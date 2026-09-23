import {
  AgencyRow, AreaRow, AttributionRow, CalendarDateRow, CalendarRow, FeedInfoRow, FixedLinkRow,
  FrequencyRow, RouteRow, ShapeRow, StopAreaRow, StopID, StopRow, StopTimeRow, TransferRow,
  TransferType, TripRow
} from "@gb-transit/gtfs-schema";
import {readFeed} from "@gb-transit/gtfs-loader";
import type {ReadFeedOptions} from "@gb-transit/gtfs-loader";
import * as fs from "fs";

/**
 * One input feed, in memory, in the shape the mergers consume.
 */
export interface GTFSZip {
  trips: TripRow[];
  transfers: TransferRow[];
  calendars: CalendarRow[];
  calendarDates: Record<string, CalendarDateRow[]>;
  routes: RouteRow[];
  agencies: AgencyRow[];
  stops: StopRow[];
  parentStops: Record<StopID, StopID>;
  areas: AreaRow[];
  stopAreas: StopAreaRow[];
  attributions: AttributionRow[];
  feedInfo: FeedInfoRow[];
  frequencies: FrequencyRow[];
}

/**
 * What a feed's streamed files are handed to as they are read.
 *
 * The two biggest files in a feed are its calls and its shapes, and neither is
 * held: each row is written and let go. They are read together because both need
 * the same thing to have happened first - the trips renumbered - and reading
 * them together is one pass over the zip rather than two.
 */
export interface StreamedRows {
  stopTime(row: StopTimeRow): void;
  shape(row: ShapeRow): void;
}

/**
 * `betweenChunks` is awaited each time the reader reaches the end of a chunk of
 * the zip, which is the only place a caller can wait: the rows themselves arrive
 * from a synchronous parser.
 */
export type FeedStream = (
  rows: StreamedRows,
  betweenChunks: () => Promise<void>
) => Promise<void>;

/**
 * Accumulates a feed as its rows arrive, applying the filters a merge wants
 * applied before anything is merged.
 *
 * This is the loader gtfsmerge used to have, with the dynamic `this[type](row)`
 * dispatch replaced by handlers named at the call site and the rows typed by the
 * shared schema. Every filter is the one it had.
 */
export class FeedIndex {

  private readonly transfers: Record<string, TransferRow> = {};
  private readonly result: GTFSZip = {
    trips: [], transfers: [], calendars: [], calendarDates: {}, routes: [],
    agencies: [], stops: [], parentStops: {}, areas: [], stopAreas: [], attributions: [],
    feedInfo: [], frequencies: []
  };

  constructor(
    private readonly filterBefore?: string
  ) {}

  public trip(row: TripRow): void {
    this.result.trips.push(row);
  }

  public route(row: RouteRow): void {
    this.result.routes.push(row);
  }

  /**
   * Both the platform and the station above it.
   *
   * A feed says where a vehicle actually stops - platform 3, or the stop on the
   * near side of the road - and which of those are one place a rider changes at.
   * The merge used to publish only the station and move every call onto it,
   * which is the answer to "which station" and no answer at all to "which
   * platform", and it threw away the grouping a bus feed publishes for its own
   * stops as well as the rail feed's.
   */
  public stop(row: StopRow): void {
    if (row.parent_station) {
      this.result.parentStops[row.stop_id] = row.parent_station;
    }

    this.result.stops.push(row);
  }

  public agency(row: AgencyRow): void {
    this.result.agencies.push(row);
  }

  public area(row: AreaRow): void {
    this.result.areas.push(row);
  }

  public stopArea(row: StopAreaRow): void {
    this.result.stopAreas.push(row);
  }

  public attribution(row: AttributionRow): void {
    this.result.attributions.push(row);
  }

  public feedInfo(row: FeedInfoRow): void {
    this.result.feedInfo.push(row);
  }

  /**
   * Held rather than streamed, unlike the calls and the shapes: the whole
   * national bus feed has 81 of these rows.
   */
  public frequency(row: FrequencyRow): void {
    this.result.frequencies.push(row);
  }

  /**
   * A calendar that has finished, or that runs on no day at all, is not worth
   * carrying into the merged feed.
   *
   * The filter being absent means keep everything. It used to read
   * `!filterBefore || end_date < filterBefore`, which is true when there is no
   * filter - so --no-date-filter dropped every calendar in every feed, and left
   * only the services that CalendarFactory could synthesise out of orphan
   * calendar_dates rows.
   */
  public calendar(row: CalendarRow): void {
    const finished = this.filterBefore !== undefined
      && (row.end_date ?? "") < this.filterBefore;
    const runs = row.monday || row.tuesday || row.wednesday || row.thursday || row.friday
      || row.saturday || row.sunday;

    if (!finished && runs) {
      this.result.calendars.push(row);
    }
  }

  public calendarDate(row: CalendarDateRow): void {
    if (this.filterBefore === undefined || row.date >= this.filterBefore) {
      const id = String(row.service_id);

      (this.result.calendarDates[id] ||= []).push(row);
    }
  }

  /**
   * links.txt is this repository's own file: a fixed link between two stations
   * with a duration and a window. As a transfer it is a minimum time.
   */
  public link(row: FixedLinkRow): void {
    this.transfer({
      from_stop_id: row.from_stop_id,
      to_stop_id: row.to_stop_id,
      transfer_type: TransferType.MinTime,
      min_transfer_time: row.duration
    });
  }

  /**
   * One transfer per pair, the shortest of them.
   *
   * Where the rows say when they apply - the rail feed's fixed links carry a
   * window, days and a mode - the one kept says when either does, as the rail
   * build's own mergeTransfers does. Keeping the shorter row's window alone would
   * take away the hours only the longer one covered.
   */
  public transfer(row: TransferRow): void {
    // A coupling is between two named trips, so it is not the same row as an
    // interchange at the same pair of stops and does not replace it.
    const key = row.transfer_type === TransferType.InSeat
      ? `${row.from_stop_id}_${row.to_stop_id}_${row.from_trip_id}_${row.to_trip_id}`
      : `${row.from_stop_id}_${row.to_stop_id}`;
    const seen = this.transfers[key];

    if (!seen) {
      this.transfers[key] = row;
    }
    else if ((seen.min_transfer_time ?? Infinity) > (row.min_transfer_time ?? Infinity)) {
      this.transfers[key] = envelope(row, seen);
    }
    else {
      this.transfers[key] = envelope(seen, row);
    }
  }

  public results(): GTFSZip {
    return {...this.result, transfers: Object.values(this.transfers)};
  }

}

const DAYS = ["monday", "tuesday", "wednesday", "thursday", "friday", "saturday", "sunday"] as const;

/**
 * `kept`, available whenever either it or `other` is. A window or a day either
 * leaves unsaid is no restriction, so the envelope leaves it unsaid too.
 */
function envelope(kept: TransferRow, other: TransferRow): TransferRow {
  const earliest = (a?: string | null, b?: string | null) => (a && b ? (a < b ? a : b) : undefined);
  const latest = (a?: string | null, b?: string | null) => (a && b ? (a > b ? a : b) : undefined);
  const modes = [kept.mode, other.mode].filter(mode => mode).flatMap(mode => String(mode).split("|"));
  const widened: TransferRow = {
    ...kept,
    start_time: earliest(kept.start_time, other.start_time),
    end_time: latest(kept.end_time, other.end_time),
    start_date: earliest(kept.start_date, other.start_date),
    end_date: latest(kept.end_date, other.end_date),
    mode: modes.length > 0 ? [...new Set(modes)].sort().join("|") : kept.mode
  };

  for (const day of DAYS) {
    const [a, b] = [kept[day], other[day]];

    widened[day] = a === undefined || a === null || b === undefined || b === null
      ? undefined
      : (Number(a) === 1 || Number(b) === 1 ? 1 : 0);
  }

  return widened;
}

/**
 * Read one input feed, apart from its stop times.
 *
 * The rows are copied out because the reader hands back the same object every
 * time - it is reading a file that may be three million rows and does not
 * allocate one per row.
 *
 * The stop times are left for `stopTimesOf` and a second pass over the file.
 * Everything here is needed before a single call can be written - a call is
 * indexed against its trip, and a trip against its route and its calendar - and
 * everything here put together is a fortieth of what the calls cost to hold.
 */
export async function readMergeInput(
  file: string,
  filterBefore?: string,
  extraColumns: ReadFeedOptions["extraColumns"] = {}
): Promise<GTFSZip> {
  const index = new FeedIndex(filterBefore);

  await readFeed(fs.createReadStream(file), {
    "trips.txt": row => index.trip({...row}),
    "routes.txt": row => index.route({...row}),
    "areas.txt": row => index.area({...row}),
    "stop_areas.txt": row => index.stopArea({...row}),
    "attributions.txt": row => index.attribution({...row}),
    "feed_info.txt": row => index.feedInfo({...row}),
    "frequencies.txt": row => index.frequency({...row}),
    "stops.txt": row => index.stop({...row}),
    "agency.txt": row => index.agency({...row}),
    "calendar.txt": row => index.calendar({...row}),
    "calendar_dates.txt": row => index.calendarDate({...row}),
    "transfers.txt": row => index.transfer({...row}),
    "links.txt": row => index.link({...row})
  }, {extraColumns});

  return index.results();
}

/**
 * The calls and the shapes of one feed, in a pass of their own.
 *
 * Nothing is kept: each row is handed straight to whoever asked for it, written
 * and let go. A second read of the file is what that costs, and the file is read
 * rather than held.
 *
 * A call with only one of its times is not a call anything can plan through, so
 * it never leaves here.
 *
 * A merge carrying no shapes asks for no shapes, so a national bus feed's 2.5GB
 * of them is read past rather than inflated and parsed.
 */
export function streamOf(
  file: string,
  shapes = true,
  extraColumns: ReadFeedOptions["extraColumns"] = {}
): FeedStream {
  return async (rows, betweenChunks) => {
    await readFeed(pausing(file, betweenChunks), {
      "stop_times.txt": row => {
        if (row.departure_time && row.arrival_time) {
          rows.stopTime(row);
        }
      },
      ...(shapes ? {"shapes.txt": (row: ShapeRow) => rows.shape(row)} : {})
    }, {extraColumns});
  };
}

/**
 * The file, a chunk at a time, giving the reader's consumer a turn between one
 * chunk and the next.
 *
 * The rows of a chunk arrive from a synchronous parser, which cannot be made to
 * wait for a writer partway through. Here it can: the reader asks for the next
 * chunk, and does not get one until the calls from the last chunk are written.
 */
async function* pausing(
  file: string,
  betweenChunks: () => Promise<void>
): AsyncIterable<Uint8Array> {
  for await (const chunk of fs.createReadStream(file)) {
    yield chunk;

    await betweenChunks();
  }
}
