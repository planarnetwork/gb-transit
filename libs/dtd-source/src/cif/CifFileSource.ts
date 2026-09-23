import {Temporal} from "temporal-polyfill";
import config from "@gb-transit/dtd-schema";
import {FieldValue, MultiRecordFile, RecordAction, SingleRecordFile} from "@gb-transit/feed-parser";
import {
  Association,
  DateRange,
  FixedLink,
  FixedLinkRecord,
  IdGenerator,
  Schedule,
  ScheduleBuilder,
  ScheduleCalendar,
  ScheduleResults,
  ScheduleStopTimeRow,
  StationCoordinates,
  Stop,
  STP,
  TimetableSource,
  toFixedLinks,
  interchange,
  toStop,
  withoutPlaceholders,
  reportDroppedStops,
  Transfer
} from "@gb-transit/gtfs";
import {FeedZip} from "./FeedZip";
import {basename} from "node:path";
import {charColumns, MemoryTable, Row} from "./MemoryTable";
import {additionalFixedLink, associationRow, AssociationRow, fixedLink, integer, stationRecord} from "./Rows";

const timetable = config.timetable;

/**
 * The `cate_interchange_status` of a TIPLOC that is not the station itself -
 * a junction or approach sharing its CRS. See groupByCrs.
 */
const SUBSIDIARY = 9;

/**
 * A TimetableSource that reads the DTD feed files directly, with no database.
 *
 * The SQL of dtd2mysql's KyselyTimetableSource is the specification. Three of
 * its behaviours come from the database rather than from the feed, and each is
 * reproduced here with the query it belongs to:
 *
 *  - a CHAR column loses its trailing spaces and a VARCHAR does not (MemoryTable)
 *  - one row per CRS code, chosen by ranking its TIPLOCs (groupByCrs)
 *  - UNION deduplicates the fixed links, so importing the same ALF three times
 *    does not triple links.txt
 *
 * Feeds are applied in the order given, so a full refresh followed by its
 * incrementals produces what importing them in that order would.
 */
export class CifFileSource implements TimetableSource {

  private readonly reference = once(() => readReference(this.sources));
  private readonly stops = once(async () => toStops(await this.reference(), this.stationCoordinates));
  private readonly timetable = once(async () => {
    const [reference, stops] = await Promise.all([this.reference(), this.stops()]);

    return readTimetable(this.sources, reference, stops.dropped, this.range, this.removePassingPoints);
  });

  constructor(
    private readonly sources: string[],
    private readonly stationCoordinates: StationCoordinates,
    private readonly range: DateRange,
    /**
     * Whether to drop the locations a service runs through without stopping.
     *
     * Passed to ScheduleBuilder rather than applied here, because a location a
     * train runs through is still somewhere it goes: the builder keeps it on
     * `Schedule.path` for the shapes whatever this says, and this decides only
     * whether it also becomes a stop time.
     */
    private readonly removePassingPoints: boolean = true
  ) {}

  /**
   * The last feed given, which is the most recent one applied.
   */
  public async getFeedVersion(): Promise<string | null> {
    const last = this.sources[this.sources.length - 1];

    return last === undefined ? null : basename(last);
  }

  /**
   * SELECT crs_code, ... FROM physical_station WHERE crs_code IS NOT NULL GROUP BY crs_code
   */
  public async getStops(): Promise<Stop[]> {
    const {stops} = await this.stops();

    return stops;
  }

  /**
   * SELECT crs_code, crs_code, 2, minimum_change_time * 60 FROM physical_station
   * WHERE cate_interchange_status IS NOT NULL GROUP BY crs_code
   *
   * Note there is no `crs_code IS NOT NULL` here, unlike getStops.
   */
  public async getTransfers(): Promise<Transfer[]> {
    const {stations} = await this.reference();

    return groupByCrs(stations.rows.filter(row => row.cate_interchange_status !== null))
      .map(row => interchange(row.crs_code as string, integer(row, "minimum_change_time") * 60));
  }

  /**
   * The ALF links between two known stations, plus the FLF links for any pair
   * ALF does not cover, deduplicated the way the UNION deduplicates them.
   */
  public async getFixedLinks(): Promise<FixedLink[]> {
    const {stations, additionalFixedLinks, fixedLinks} = await this.reference();

    const known = new Set(stations.rows.map(row => String(row.crs_code)));
    const covered = new Set(additionalFixedLinks.rows.map(row => `${row.origin}${row.destination}`));
    const records: FixedLinkRecord[] = [];

    for (const row of additionalFixedLinks.rows) {
      if (known.has(String(row.origin)) && known.has(String(row.destination))) {
        records.push(additionalFixedLink(row));
      }
    }

    for (const row of fixedLinks.rows) {
      if (!covered.has(`${row.origin}${row.destination}`)) {
        records.push(fixedLink(row));
      }
    }

    return dedupe(records, fixedLinkKey).flatMap(toFixedLinks);
  }

  public async getSchedules(): Promise<ScheduleResults> {
    const {schedules, maxId} = await this.timetable();

    return {schedules, idGenerator: idsFrom(maxId + 1)};
  }

  public async getAssociations(): Promise<Association[]> {
    const {associations} = await this.timetable();

    return associations;
  }

  public async end(): Promise<any> {
    return undefined;
  }

}

/**
 * Every station as a stop, with the operator placeholders taken out and their
 * codes kept so the schedule read can drop the stop times calling at them.
 */
function toStops(reference: Reference, coordinates: StationCoordinates): DroppableStops {
  return withoutPlaceholders(
    groupByCrs(reference.stations.rows.filter(row => row.crs_code !== null), true)
      .map(row => toStop(stationRecord(row), coordinates))
  );
}

/**
 * MSN, ALF and FLF from every feed, in order.
 *
 * All of them are read before any schedule is, because the schedule queries
 * join to physical_station and MySQL does that join against the finished
 * table - an incremental can introduce a station that a schedule in the
 * refresh calls at.
 */
async function readReference(sources: string[]): Promise<Reference> {
  const msn = timetable["MSN"] as MultiRecordFile;
  const alf = timetable["ALF"] as SingleRecordFile;
  const flf = timetable["FLF"] as MultiRecordFile;

  const stations = new MemoryTable(msn.records["A"]);
  const additionalFixedLinks = new MemoryTable(alf.recordTypes[0]);
  const fixedLinks = new MemoryTable(flf.records["A"]);

  for (const source of sources) {
    const zip = new FeedZip(source);

    try {
      await zip.eachLine("MSN", line => {
        const record = msn.getRecord(line);

        if (record && record.name === "physical_station") {
          stations.apply(record.extractValues(line));
        }
      });
      await zip.eachLine("ALF", line => {
        additionalFixedLinks.apply(alf.recordTypes[0].extractValues(line));
      });
      await zip.eachLine("FLF", line => {
        const record = flf.getRecord(line);

        if (record) {
          fixedLinks.apply(record.extractValues(line));
        }
      });
    }
    finally {
      zip.close();
    }
  }

  return {stations, additionalFixedLinks, fixedLinks};
}

/**
 * MCA or CFA and ZTR from every feed, in order.
 *
 * The reference read has to be finished before this one starts: the stop times
 * are joined to the stations by TIPLOC, and an incremental can introduce a
 * station that a schedule in the refresh calls at.
 */
async function readTimetable(
  sources: string[],
  reference: Reference,
  exclude: ReadonlySet<string>,
  range: DateRange,
  removePassingPoints: boolean
): Promise<Timetable> {
  const {stations} = reference;
  const crsByTiploc = new Map<string, string>();

  for (const row of stations.rows) {
    if (row.crs_code !== null) {
      crsByTiploc.set(row.tiploc_code as string, row.crs_code as string);
    }
  }

  const mca = timetable["MCA"] as MultiRecordFile;
  const cfa = timetable["CFA"] as MultiRecordFile;
  const ztr = timetable["ZTR"] as MultiRecordFile;
  const loader = new ScheduleLoader(range, crsByTiploc, exclude, removePassingPoints);

  for (const source of sources) {
    const zip = new FeedZip(source);
    const extensions = zip.extensions;

    try {
      const scheduleFile = extensions.includes("MCA") ? "MCA" : "CFA";
      const file = scheduleFile === "MCA" ? mca : cfa;

      await zip.eachLine(scheduleFile, line => loader.readTimetableLine(file, line));
      loader.endOfFile();

      await zip.eachLine("ZTR", line => loader.readZTrainLine(ztr, line));
      loader.endOfFile();
    }
    finally {
      zip.close();
    }
  }

  reportDroppedStops(loader.droppedStops);

  return loader.results();
}

/**
 * Accumulates one schedule at a time.
 *
 * Only the finished Schedule objects are kept, never the raw rows: a three month
 * window is nearly three million stop time rows, and holding those as well as
 * the schedules built from them roughly doubles peak memory for no benefit.
 */
class ScheduleLoader {

  private readonly schedules = new Map<string, Schedule>();
  private readonly zSchedules = new Map<string, Schedule>();
  private readonly associations = new MemoryTable((timetable["MCA"] as MultiRecordFile).records["AA"]);
  private readonly tiplocs = new MemoryTable((timetable["MCA"] as MultiRecordFile).records["TI"]);
  private pending: Pending | null = null;

  // The importer numbers schedules in the order their BS records are parsed and
  // skips deletions, and route_id is that number. Counting here rather than
  // reading the parser's counter keeps the numbering to this read: the record
  // objects are shared with every other reader in the process.
  private scheduleId = 0;
  private zScheduleId = 0;

  // Summed across builders because there is one per schedule here, unlike the
  // database source which streams every schedule through a single builder.
  public droppedStops = 0;

  constructor(
    private readonly range: DateRange,
    private readonly crsByTiploc: Map<string, string>,
    private readonly exclude: ReadonlySet<string>,
    private readonly removePassingPoints: boolean
  ) {}

  public readTimetableLine(file: MultiRecordFile, line: string): void {
    const record = file.getRecord(line);

    if (!record) {
      return;
    }

    switch (record.name) {
      case "schedule": {
        const parsed = record.extractValues(line);

        return this.startSchedule(parsed.action, charColumns(record, parsed.values), false);
      }

      case "schedule_extra":
        if (this.pending) {
          this.pending.extra = charColumns(record, record.extractValues(line).values);
        }
        return;

      case "stop_time":
        if (this.pending) {
          this.addStop(charColumns(record, record.extractValues(line).values));
        }
        return;

      case "association":
        this.associations.apply(record.extractValues(line));
        return;

      case "tiploc":
        this.tiplocs.apply(record.extractValues(line));
        return;

      // CR service change records are imported but the GTFS build never reads them
      default:
        return;
    }
  }

  public readZTrainLine(file: MultiRecordFile, line: string): void {
    const record = file.getRecord(line);

    if (!record) {
      return;
    }

    switch (record.name) {
      case "z_schedule": {
        const parsed = record.extractValues(line);

        return this.startSchedule(parsed.action, charColumns(record, parsed.values), true);
      }

      case "z_schedule_extra":
        if (this.pending) {
          this.pending.extra = charColumns(record, record.extractValues(line).values);
        }
        return;

      case "z_stop_time":
        if (this.pending) {
          this.addStop(charColumns(record, record.extractValues(line).values));
        }
        return;

      default:
        return;
    }
  }

  public endOfFile(): void {
    this.store();
  }

  public results(): Timetable {
    this.store();

    const schedules = [...this.schedules.values()].sort(byStpThenId);
    const zTrains = [...this.zSchedules.values()].map(z => offsetId(z, this.scheduleId));
    const all = [...schedules, ...zTrains];
    const maxId = all.reduce((max, schedule) => Math.max(max, schedule.id), 0);

    return {schedules: all, associations: this.buildAssociations(), maxId};
  }

  private startSchedule(action: RecordAction, values: Row, zTrain: boolean): void {
    this.store();

    const target = zTrain ? this.zSchedules : this.schedules;
    const key = `${values.train_uid} ${values.runs_from} ${values.stp_indicator}`;

    // REPLACE INTO deletes the old row whether or not the new one is wanted
    if (action === RecordAction.Update) {
      target.delete(key);
    }

    if (action === RecordAction.Delete) {
      target.delete(key);
      return;
    }

    // A deletion carries no id, anything else takes the next one whether or not
    // it is kept
    const id = zTrain ? ++this.zScheduleId : ++this.scheduleId;

    // INSERT IGNORE: the first record for a key wins, and the stop times that
    // follow the rejected one are orphaned and removed
    if (action === RecordAction.Insert && target.has(key)) {
      return;
    }

    if (!this.inWindow(values.runs_from as string, values.runs_to as string)) {
      return;
    }

    this.pending = {key, id, values, extra: null, stops: [], seen: new Set(), zTrain};
  }

  /**
   * The unique key on stop_time is (schedule, location, suffix,
   * public_departure_time), so a train calling twice at one place at the same
   * published time keeps only the first call.
   */
  private addStop(values: Row): void {
    const pending = this.pending!;
    const key = `${values.location} ${values.suffix} ${values.public_departure_time}`;

    if (pending.seen.has(key)) {
      return;
    }

    pending.seen.add(key);
    pending.stops.push(values);
  }

  private store(): void {
    const pending = this.pending;
    this.pending = null;

    if (!pending) {
      return;
    }

    const builder = new ScheduleBuilder(this.exclude, this.removePassingPoints);
    builder.load(pending.zTrain ? this.zTrainRows(pending) : this.scheduleRows(pending));
    this.droppedStops += builder.dropped;

    const [schedule] = builder.results.schedules;

    if (schedule) {
      (pending.zTrain ? this.zSchedules : this.schedules).set(pending.key, schedule);
    }
  }

  /**
   * The passenger query: stop times joined to physical_station on the TIPLOC, so
   * a location that is not a station drops out. A schedule with no stop time
   * records at all survives as a single row of nulls.
   */
  private scheduleRows(pending: Pending): ScheduleStopTimeRow[] {
    const {values, extra, stops} = pending;
    const common = {
      id: pending.id,
      train_uid: values.train_uid as string,
      retail_train_id: (extra?.retail_train_id ?? null) as string,
      runs_from: values.runs_from as string,
      runs_to: values.runs_to as string,
      monday: values.monday, tuesday: values.tuesday, wednesday: values.wednesday,
      thursday: values.thursday, friday: values.friday, saturday: values.saturday,
      sunday: values.sunday,
      stp_indicator: values.stp_indicator as STP,
      train_category: (values.train_status === "S" ? "SS" : values.train_category) as string,
      atoc_code: (extra?.atoc_code ?? null) as string | null,
      train_class: values.train_class as null | "S" | "B",
      reservations: values.reservations as null | "R" | "S" | "A"
    };

    if (stops.length === 0) {
      return [{...common, ...NO_STOP} as unknown as ScheduleStopTimeRow];
    }

    const rows: ScheduleStopTimeRow[] = [];

    for (const stop of stops) {
      const crs = this.crsByTiploc.get(stop.location as string);

      if (crs === undefined) {
        continue;
      }

      rows.push({
        ...common,
        ...stopColumns(stop, crs, rows.length + 1, stop.location as string)
      } as unknown as ScheduleStopTimeRow);
    }

    return rows;
  }

  /**
   * The z-train query. The join to z_stop_time is an inner one, so a z-train
   * with no stops does not appear at all, and the location is already a CRS
   * code rather than a TIPLOC.
   *
   * Passing times reach the builder here too, though no ZTR yet published
   * carries one - RJTTF918 has 10,165 intermediate records and not one of them.
   * The row is handed over the same way so a ZTR that starts carrying them gets
   * the same treatment a train does rather than a second rule of its own.
   */
  private zTrainRows(pending: Pending): ScheduleStopTimeRow[] {
    const {values, extra, stops} = pending;
    const common = {
      id: pending.id,
      // the query selects a bare `null` for this column, so it arrives undefined
      retail_train_id: undefined as unknown as string,
      train_uid: values.train_uid as string,
      runs_from: values.runs_from as string,
      runs_to: values.runs_to as string,
      monday: values.monday, tuesday: values.tuesday, wednesday: values.wednesday,
      thursday: values.thursday, friday: values.friday, saturday: values.saturday,
      sunday: values.sunday,
      stp_indicator: values.stp_indicator as STP,
      train_category: values.train_category as string,
      atoc_code: (extra?.atoc_code ?? null) as string | null,
      train_class: "S" as const,
      reservations: null
    };

    return stops.map((stop, index) =>
      ({...common, ...stopColumns(stop, stop.location as string, index + 1, null)}) as ScheduleStopTimeRow
    );
  }

  /**
   * JOIN tiploc ON assoc_location = tiploc_code, so an association at a location
   * the feed never described is dropped, and ORDER BY stp_indicator DESC, id.
   */
  private buildAssociations(): Association[] {
    const rows = this.associations.rows
      .map(associationRow)
      .filter((row: AssociationRow) =>
        this.tiplocs.get(row.assoc_location) !== undefined
        && this.inWindow(row.start_date, row.end_date)
      )
      .sort(byStpThenId);

    return rows.map(row => new Association(
      row.id,
      row.base_uid,
      row.assoc_uid,
      this.tiplocs.get(row.assoc_location)!.crs_code as string,
      row.assoc_date_ind,
      row.assoc_cat,
      new ScheduleCalendar(
        Temporal.PlainDate.from(row.start_date),
        Temporal.PlainDate.from(row.end_date),
        row.days
      ),
      row.stp_indicator
    ));
  }

  private inWindow(from: string, to: string): boolean {
    return from < this.range.to.toString() && to >= this.range.from.toString();
  }

}

function stopColumns(stop: Row, crs: string, sequence: number, tiploc: string | null) {
  return {
    crs_code: crs,
    stop_id: sequence,
    public_arrival_time: stop.public_arrival_time,
    public_departure_time: stop.public_departure_time,
    scheduled_arrival_time: stop.scheduled_arrival_time,
    scheduled_departure_time: stop.scheduled_departure_time,
    scheduled_pass_time: stop.scheduled_pass_time,
    platform: stop.platform,
    tiploc,
    activity: stop.activity
  };
}

const NO_STOP = {
  crs_code: null,
  stop_id: null,
  public_arrival_time: null,
  public_departure_time: null,
  scheduled_arrival_time: null,
  scheduled_departure_time: null,
  scheduled_pass_time: null,
  platform: null,
  tiploc: null,
  activity: null
};

/**
 * ORDER BY stp_indicator DESC, id
 */
function byStpThenId(a: Overlaid, b: Overlaid): number {
  const aStp = String(a.stp_indicator ?? a.stp);
  const bStp = String(b.stp_indicator ?? b.stp);

  return aStp === bStp ? a.id - b.id : (aStp < bStp ? 1 : -1);
}

/**
 * A schedule or an association, either of which may name its STP indicator as
 * the column it came from or as the property the model exposes.
 */
interface Overlaid {
  readonly id: number;
  readonly stp?: STP;
  readonly stp_indicator?: FieldValue;
}

/**
 * GROUP BY crs_code keeps the first row inserted for each code, and returns the
 * groups in code order.
 */
/**
 * One row per CRS, preferring a TIPLOC that describes the station itself.
 *
 * `cate_interchange_status` is the CATE interchange rating - 0 for a station
 * that is not an interchange, 1 to 3 for how significant an interchange it is,
 * and **9 for a subsidiary location**: a junction or an approach that shares the
 * station's CRS without being the place a passenger stands. Reading has
 * `RDNGSTN` rated 2 and `RDNGORJ` rated 9.
 *
 * Taking whichever row came first published the subsidiary TIPLOC as
 * `stop_code` for 75 stations, Reading among them, because the order rows
 * happen to arrive in is not a rule.
 *
 * The TIPLOC itself breaks the tie, because some stations have nothing else to
 * separate them: Westbury's TIPLOCs are all rated 9, so the preference decides
 * nothing and whatever remains has to be a property of the data rather than of
 * the order it arrived in. The database and the file source read the rows in
 * different orders, and a tie-break that depends on that makes them disagree.
 *
 * `preferStation` is off for transfers, which want the minimum change time of
 * whichever row the database would have grouped to. Changing that is a separate
 * question from which TIPLOC to publish.
 */
function groupByCrs(rows: Row[], preferStation = false): Row[] {
  const groups = new Map<string, Row>();

  for (const row of rows) {
    const crs = String(row.crs_code);
    const chosen = groups.get(crs);

    if (chosen === undefined || (preferStation && better(row, chosen))) {
      groups.set(crs, row);
    }
  }

  return [...groups.values()].sort((a, b) => String(a.crs_code) < String(b.crs_code) ? -1 : 1);
}

function subsidiary(row: Row): boolean {
  return row.cate_interchange_status === SUBSIDIARY;
}

function better(candidate: Row, chosen: Row): boolean {
  return subsidiary(candidate) !== subsidiary(chosen)
    ? !subsidiary(candidate)
    : String(candidate.tiploc_code) < String(chosen.tiploc_code);
}

/**
 * The columns the UNION deduplicates on, named rather than taken from the object
 * so that the two branches building those objects cannot drift apart.
 */
function fixedLinkKey(row: FixedLinkRecord): string {
  return JSON.stringify([
    row.mode, row.duration, row.origin, row.destination,
    row.start_time, row.end_time, row.start_date, row.end_date,
    row.monday, row.tuesday, row.wednesday, row.thursday,
    row.friday, row.saturday, row.sunday
  ]);
}

function dedupe<T>(rows: T[], keyOf: (row: T) => string): T[] {
  const seen = new Set<string>();

  return rows.filter(row => {
    const key = keyOf(row);

    return seen.has(key) ? false : (seen.add(key), true);
  });
}

/**
 * The z-train query offsets the ids past the passenger schedules so the two sets
 * cannot collide.
 *
 * Through `clone` rather than a constructor call of its own. This listed nine of
 * a schedule's ten fields and so dropped `path` the day one was added, which
 * nothing caught: `path` is an optional trailing argument, so leaving it out
 * compiles, and a z-train with no path draws its shape from its calls - the
 * same list, until a ZTR carries a pass time.
 */
function offsetId(schedule: Schedule, offset: number): Schedule {
  return schedule.clone(schedule.calendar, schedule.id + offset);
}

/**
 * Read once, however many times it is asked for.
 *
 * The build asks all five questions at the same time, so three callers arrive
 * for the reference read and two for the timetable before either has finished.
 * They wait on the first read rather than starting one of their own.
 */
function once<T>(read: () => Promise<T>): () => Promise<T> {
  let result: Promise<T> | undefined;

  return () => result ??= read();
}

function* idsFrom(start: number): IdGenerator {
  let id = start;

  while (true) {
    yield id++;
  }
}

interface Pending {
  key: string;
  id: number;
  values: Row;
  extra: Row | null;
  stops: Row[];
  seen: Set<string>;
  zTrain: boolean;
}

interface DroppableStops {
  stops: Stop[];
  dropped: Set<string>;
}

interface Reference {
  stations: MemoryTable;
  additionalFixedLinks: MemoryTable;
  fixedLinks: MemoryTable;
}

interface Timetable {
  schedules: Schedule[];
  associations: Association[];
  maxId: number;
}
