import {Temporal} from "temporal-polyfill";
import {Kysely, sql} from "kysely";
import {
  Association,
  AssociationType,
  CRS,
  DateIndicator,
  DateRange,
  FixedLink,
  FixedLinkRecord,
  interchange,
  reportDroppedStops,
  ScheduleBuilder,
  ScheduleCalendar,
  ScheduleResults,
  ScheduleStopTimeRow,
  StationCoordinates,
  StationRecord,
  STP,
  Stop,
  TimetableSource,
  toFixedLinks,
  toStop,
  Transfer,
  withoutPlaceholders
} from "@gb-transit/gtfs";
import {Database} from "../database/Database";

/**
 * The timetable read through Kysely, so the same build runs against MySQL, Postgres or SQLite.
 *
 * MySqlTimetableSource is the same data expressed in the SQL one database happens to accept. Four things
 * in it do not translate:
 *
 * - `cate_interchange_status <=> 9` is MySQL's null safe equals. A CASE says the same thing everywhere,
 *   including for the null the operator quietly treats as "not 9".
 * - `IF(train_status = "S", ...)` is a MySQL function; CASE is the standard spelling.
 * - matching a fixed link on `CONCAT(origin, destination)` can match the wrong link, because the codes
 *   are glued together before they are compared. `AB` + `CDE` and `ABC` + `DE` are the same string.
 * - a bare `GROUP BY crs_code` with columns that are not in it. MySQL answers by choosing a row for you
 *   and Postgres rejects the query outright, so the row is chosen here instead.
 *
 * The queries are built rather than written, so they are checked against the schema declarations rather
 * than being strings that happen to name columns.
 */
export class KyselyTimetableSource implements TimetableSource {

  constructor(
    private readonly db: Kysely<Database>,
    private readonly stationCoordinates: StationCoordinates,
    private readonly range: DateRange,
    /**
     * Whether to drop the locations a service runs through without stopping.
     * See BuildContext: on unless the build asked for them.
     *
     * Handed to ScheduleBuilder rather than written into the query, the same way the MySQL source does
     * it. The stop times a service runs through are selected either way, because the shapes are drawn
     * through them.
     */
    private readonly removePassingPoints: boolean = true
  ) {}

  /**
   * Return the interchange time between each station.
   *
   * One row per CRS, chosen the same way getStops chooses one, so the two agree on which physical
   * station a code refers to.
   */
  public async getTransfers(): Promise<Transfer[]> {
    const results = await this.preferred()
      .where("cate_interchange_status", "is not", null)
      .select(["crs_code", "minimum_change_time"])
      .orderBy("crs_code")
      .execute();

    // Through interchange() rather than returned as they come back: the rows have the four standard
    // columns and Transfer now has twelve more, and the CSV writer takes its header from the first row.
    return results.map((row: any) => interchange(row.crs_code as CRS, Number(row.minimum_change_time) * 60));
  }

  /**
   * The last file ImportFeedCommand recorded. A missing table or an empty log both mean the same thing:
   * nothing is known, so say nothing rather than guess.
   */
  public async getFeedVersion(): Promise<string | null> {
    try {
      const [log] = await this.db
        .selectFrom("log")
        .select("filename")
        .orderBy("id", "desc")
        .limit(1)
        .execute();

      return log?.filename ?? null;
    }
    catch (err) {
      return null;
    }
  }

  public async getStops(): Promise<Stop[]> {
    const {stops} = await this.stations();

    return stops;
  }

  /**
   * Every station as a stop, with the operator placeholders taken out and their codes kept so
   * getSchedules can drop the stop times that call at them. Held as a promise because both callers want
   * it and neither runs first.
   */
  private stations(): Promise<{stops: Stop[], dropped: Set<string>}> {
    return this.stationsQ ??= this.preferred()
      .select([
        "crs_code", "tiploc_code", "station_name", "cate_interchange_status", "easting", "northing"
      ])
      .orderBy("crs_code")
      .execute()
      .then((rows: any[]) => withoutPlaceholders(
        (rows as unknown as StationRecord[]).map(row => toStop(row, this.stationCoordinates))
      ));
  }

  private stationsQ?: Promise<{stops: Stop[], dropped: Set<string>}>;

  /**
   * One physical station row per CRS code, preferring a TIPLOC that describes the station itself.
   *
   * `cate_interchange_status` is the CATE interchange rating - 0 for a station that is not an
   * interchange, 1 to 3 for how significant an interchange it is, and 9 for a subsidiary location: a
   * junction or an approach that shares the station's CRS without being the place a passenger stands.
   * Reading has `RDNGSTN` rated 2 and `RDNGORJ` rated 9.
   *
   * Grouping alone keeps whichever row came first, which published the subsidiary TIPLOC as `stop_code`
   * for 75 stations, so the row is chosen explicitly. The TIPLOC itself breaks the remaining tie,
   * because some stations have nothing else to separate them: Westbury's TIPLOCs are all rated 9.
   *
   * ROW_NUMBER is standard SQL and all three databases have it. The ranking is the one thing MySQL
   * spells its own way - `cate_interchange_status <=> 9` is its null safe equals - so a CASE says the
   * same thing, including for the null the operator quietly treats as "not 9".
   */
  private preferred() {
    const ranked = this.db
      .selectFrom("physical_station")
      .where("crs_code", "is not", null)
      .selectAll()
      .select(eb => sql<number>`row_number() over (
        partition by ${eb.ref("crs_code")}
        order by case when ${eb.ref("cate_interchange_status")} = 9 then 1 else 0 end, ${eb.ref("tiploc_code")}
      )`.as("preference"));

    return (this.db as Kysely<any>)
      .selectFrom(ranked.as("ranked"))
      .where("preference", "=", 1);
  }

  /**
   * Return the schedules and z trains.
   *
   * The first query selects the stop times for all passenger services live in the window. It is
   * important that the stop time location is mapped to physical stations to avoid getting fake CRS
   * codes from the tiploc data.
   *
   * The second selects the z-trains (usually replacement buses) over the same window. They already use
   * CRS codes as the location so avoid the disaster above.
   *
   * Loaded one after the other rather than at once: they push into the same list, so the order they
   * finish in would otherwise depend on how fast each driver happens to deliver its rows.
   */
  public async getSchedules(): Promise<ScheduleResults> {
    const {dropped} = await this.stations();
    const scheduleBuilder = new ScheduleBuilder(dropped, this.removePassingPoints);

    const [lastSchedule] = await this.db
      .selectFrom("schedule")
      .select("id")
      .orderBy("id", "desc")
      .limit(1)
      .execute();

    if (!lastSchedule) {
      throw new Error(
        "The schedule table is empty, so there is no timetable to export. " +
        "Import a timetable feed first: dtd2mysql --timetable /path/to/RJTTFxxx.ZIP"
      );
    }

    await scheduleBuilder.loadStream(this.streamSchedules());
    await scheduleBuilder.loadStream(this.streamZSchedules(lastSchedule.id));

    reportDroppedStops(scheduleBuilder.dropped);

    return scheduleBuilder.results;
  }

  private streamSchedules(): AsyncIterable<ScheduleStopTimeRow> {
    const from = this.range.from.toString();
    const to = this.range.to.toString();

    let query = this.db
      .selectFrom("schedule")
      .leftJoin("schedule_extra", "schedule.id", "schedule_extra.schedule")
      .leftJoin("stop_time", "schedule.id", "stop_time.schedule")
      .leftJoin("physical_station as ps", "stop_time.location", "ps.tiploc_code")
      .where(eb => eb.or([
        eb("stop_time.id", "is", null),
        eb("ps.crs_code", "is not", null)
      ]))
      .where("schedule.runs_from", "<", to)
      .where("schedule.runs_to", ">=", from);

    return query
      .select(eb => [
        "schedule.id as id",
        "schedule.train_uid",
        "schedule_extra.retail_train_id",
        "schedule.runs_from",
        "schedule.runs_to",
        "schedule.monday", "schedule.tuesday", "schedule.wednesday", "schedule.thursday",
        "schedule.friday", "schedule.saturday", "schedule.sunday",
        "ps.crs_code",
        "schedule.stp_indicator",
        "stop_time.public_arrival_time",
        "stop_time.public_departure_time",
        eb.case()
          .when("schedule.train_status", "=", "S")
          .then(eb.val("SS"))
          .else(eb.ref("schedule.train_category"))
          .end()
          .as("train_category"),
        "stop_time.scheduled_arrival_time",
        "stop_time.scheduled_departure_time",
        "stop_time.scheduled_pass_time",
        "stop_time.platform",
        "stop_time.location as tiploc",
        "schedule_extra.atoc_code",
        "stop_time.id as stop_id",
        "stop_time.activity",
        "schedule.reservations",
        "schedule.train_class"
      ])
      .orderBy("schedule.stp_indicator", "desc")
      .orderBy("schedule.id")
      .orderBy("stop_time.id")
      .stream() as AsyncIterable<ScheduleStopTimeRow>;
  }

  private streamZSchedules(lastScheduleId: number): AsyncIterable<ScheduleStopTimeRow> {
    const from = this.range.from.toString();
    const to = this.range.to.toString();

    let query = this.db
      .selectFrom("z_schedule")
      .leftJoin("z_schedule_extra", "z_schedule.id", "z_schedule_extra.schedule")
      .innerJoin("z_stop_time", "z_schedule.id", "z_stop_time.z_schedule")
      .where("z_schedule.runs_from", "<", to)
      .where("z_schedule.runs_to", ">=", from);

    return query
      .select(eb => [
        sql<number>`${eb.lit(lastScheduleId)} + ${eb.ref("z_schedule.id")}`.as("id"),
        "z_schedule.train_uid",
        sql<null>`null`.as("retail_train_id"),
        "z_schedule.runs_from",
        "z_schedule.runs_to",
        "z_schedule.monday", "z_schedule.tuesday", "z_schedule.wednesday", "z_schedule.thursday",
        "z_schedule.friday", "z_schedule.saturday", "z_schedule.sunday",
        "z_schedule.stp_indicator",
        "z_stop_time.location as crs_code",
        "z_schedule.train_category",
        "z_stop_time.public_arrival_time",
        "z_stop_time.public_departure_time",
        "z_stop_time.scheduled_arrival_time",
        "z_stop_time.scheduled_departure_time",
        "z_stop_time.scheduled_pass_time",
        "z_stop_time.platform",
        sql<null>`null`.as("tiploc"),
        "z_schedule_extra.atoc_code",
        "z_stop_time.id as stop_id",
        "z_stop_time.activity",
        sql<null>`null`.as("reservations"),
        eb.val("S").as("train_class")
      ])
      .orderBy("z_stop_time.id")
      .stream() as AsyncIterable<ScheduleStopTimeRow>;
  }

  public async getAssociations(): Promise<Association[]> {
    const results = await this.db
      .selectFrom("association as a")
      .innerJoin("tiploc", "a.assoc_location", "tiploc.tiploc_code")
      .where("a.start_date", "<", this.range.to.toString())
      .where("a.end_date", ">=", this.range.from.toString())
      .select([
        "a.id as id", "a.base_uid", "a.assoc_uid", "tiploc.crs_code", "a.assoc_date_ind", "a.assoc_cat",
        "a.monday", "a.tuesday", "a.wednesday", "a.thursday", "a.friday", "a.saturday", "a.sunday",
        "a.start_date", "a.end_date", "a.stp_indicator"
      ])
      .orderBy("a.stp_indicator", "desc")
      .orderBy("a.id")
      .execute() as unknown as AssociationRow[];

    return results.map(row => new Association(
      row.id,
      row.base_uid,
      row.assoc_uid,
      row.crs_code,
      row.assoc_date_ind,
      row.assoc_cat,
      new ScheduleCalendar(
        Temporal.PlainDate.from(row.start_date),
        Temporal.PlainDate.from(row.end_date), {
          0: row.sunday,
          1: row.monday,
          2: row.tuesday,
          3: row.wednesday,
          4: row.thursday,
          5: row.friday,
          6: row.saturday
        }),
      row.stp_indicator
    ));
  }

  /**
   * Return the ALF information, using the additional fixed links where there are any and filling the
   * rest in from fixed_link.
   */
  public async getFixedLinks(): Promise<FixedLink[]> {
    const additional = this.db
      .selectFrom("additional_fixed_link")
      .where("origin", "in", eb => eb.selectFrom("physical_station").select("crs_code"))
      .where("destination", "in", eb => eb.selectFrom("physical_station").select("crs_code"))
      .select(eb => [
        "mode", sql<number>`${eb.ref("duration")} * 60`.as("duration"), "origin", "destination",
        "start_time", "end_time", "start_date", "end_date",
        "monday", "tuesday", "wednesday", "thursday", "friday", "saturday", "sunday"
      ]);

    // Matched on the pair rather than on the two codes glued together, which could match the wrong link
    const fallback = this.db
      .selectFrom("fixed_link")
      .where(({not, exists, selectFrom}) => not(exists(
        selectFrom("additional_fixed_link as a")
          .select(eb => eb.lit(1).as("one"))
          .whereRef("a.origin", "=", "fixed_link.origin")
          .whereRef("a.destination", "=", "fixed_link.destination")
      )))
      .select(eb => [
        "mode", sql<number>`${eb.ref("duration")} * 60`.as("duration"), "origin", "destination",
        eb.val("00:00:00").as("start_time"), eb.val("23:59:59").as("end_time"),
        eb.val("2017-01-01").as("start_date"), eb.val("2038-01-19").as("end_date"),
        eb.lit(1).as("monday"), eb.lit(1).as("tuesday"), eb.lit(1).as("wednesday"),
        eb.lit(1).as("thursday"), eb.lit(1).as("friday"), eb.lit(1).as("saturday"),
        eb.lit(1).as("sunday")
      ]);

    const rows = await additional
      .union(fallback)
      .orderBy("origin")
      .orderBy("destination")
      .execute() as unknown as FixedLinkRow[];

    return rows.flatMap(row => toFixedLinks(normalise(row)));
  }

  public async end(): Promise<any> {
    return this.db.destroy();
  }

}

/**
 * The day flags and the duration are declared as numbers, but a union of a column and a literal is
 * typed differently by each database and MySQL hands these back as strings, so they are made numbers.
 */
function normalise(row: FixedLinkRow): FixedLinkRecord {
  return {
    mode: row.mode,
    duration: Number(row.duration),
    origin: row.origin,
    destination: row.destination,
    start_time: row.start_time,
    end_time: row.end_time,
    start_date: row.start_date || "2017-01-01",
    end_date: row.end_date || "2038-01-19",
    monday: Number(row.monday) as 0 | 1,
    tuesday: Number(row.tuesday) as 0 | 1,
    wednesday: Number(row.wednesday) as 0 | 1,
    thursday: Number(row.thursday) as 0 | 1,
    friday: Number(row.friday) as 0 | 1,
    saturday: Number(row.saturday) as 0 | 1,
    sunday: Number(row.sunday) as 0 | 1
  } as unknown as FixedLinkRecord;
}

interface FixedLinkRow {
  mode: string;
  duration: number | string;
  origin: CRS;
  destination: CRS;
  start_time: string;
  end_time: string;
  start_date: string;
  end_date: string;
  monday: number | string;
  tuesday: number | string;
  wednesday: number | string;
  thursday: number | string;
  friday: number | string;
  saturday: number | string;
  sunday: number | string;
}

interface AssociationRow {
  id: number;
  base_uid: string;
  assoc_uid: string;
  crs_code: CRS;
  start_date: string;
  end_date: string;
  assoc_date_ind: DateIndicator,
  assoc_cat: AssociationType,
  sunday: 0 | 1;
  monday: 0 | 1;
  tuesday: 0 | 1;
  wednesday: 0 | 1;
  thursday: 0 | 1;
  friday: 0 | 1;
  saturday: 0 | 1;
  stp_indicator: STP;
}
