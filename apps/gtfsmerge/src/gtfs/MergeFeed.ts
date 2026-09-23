import {
  AgencyRow, AreaRow, AttributionRow, CalendarDateRow, CalendarRow, FeedInfoRow, FrequencyRow,
  GTFS_COLUMNS, RouteRow, ShapeRow, StopAreaRow, StopRow, StopTimeRow, TransferRow, TripRow,
  fileSchema
} from "@gb-transit/gtfs-schema";
import type {FeedFileName} from "@gb-transit/gtfs-loader";

/**
 * The files a merge writes, and the columns of each.
 *
 * Where every column a file has is written, the schema's own list is referenced
 * rather than respelled. What is spelled out below is what this tool decided,
 * and two of those decisions are wider than what gtfsmerge used to write, both
 * for the sake of merging a feed from this repository:
 *
 * `platform_code` on a stop, because that is how the rail feed says which
 * platform a boarding point is, and a merge that dropped it would quietly throw
 * that away.
 *
 * `from_trip_id` and `to_trip_id` on a transfer, because a transfer_type 4 is a
 * coupling between two named trips and without them the row means nothing. They
 * are remapped along with everything else - see StopsAndTransfersMerger.
 */
export const AGENCY = fileSchema<AgencyRow>("agency.txt", GTFS_COLUMNS["agency.txt"]);

export const AREAS = fileSchema<AreaRow>("areas.txt", GTFS_COLUMNS["areas.txt"]);

export const ATTRIBUTIONS =
  fileSchema<AttributionRow>("attributions.txt", GTFS_COLUMNS["attributions.txt"]);

export const FEED_INFO = fileSchema<FeedInfoRow>("feed_info.txt", GTFS_COLUMNS["feed_info.txt"]);

export const STOP_AREAS = fileSchema<StopAreaRow>("stop_areas.txt", GTFS_COLUMNS["stop_areas.txt"]);

export const SHAPES = fileSchema<ShapeRow>("shapes.txt", GTFS_COLUMNS["shapes.txt"]);

export const FREQUENCIES =
  fileSchema<FrequencyRow>("frequencies.txt", GTFS_COLUMNS["frequencies.txt"]);

export const CALENDAR = fileSchema<CalendarRow>("calendar.txt", GTFS_COLUMNS["calendar.txt"]);

export const CALENDAR_DATES =
  fileSchema<CalendarDateRow>("calendar_dates.txt", GTFS_COLUMNS["calendar_dates.txt"]);

export const ROUTES = fileSchema<RouteRow>("routes.txt", GTFS_COLUMNS["routes.txt"]);

export const STOP_TIMES =
  fileSchema<StopTimeRow>("stop_times.txt", GTFS_COLUMNS["stop_times.txt"]);

// Its own: the coordinates where this tool has always put them, and
// platform_code, which it did not use to write at all.
export const STOPS = fileSchema<StopRow>("stops.txt", [
  "stop_id", "stop_code", "stop_name", "stop_desc", "stop_lat", "stop_lon", "zone_id", "stop_url",
  "location_type", "parent_station", "platform_code", "stop_timezone", "wheelchair_boarding"
]);

// Its own: the six standard columns. The rail feed's other twelve - the mode of
// a fixed link and when it runs - are passed through with any other column a
// feed carries; see ExtraColumns.
export const TRANSFERS = fileSchema<TransferRow>("transfers.txt", [
  "from_stop_id", "to_stop_id", "from_trip_id", "to_trip_id", "transfer_type", "min_transfer_time"
]);

// Its own: block_id and shape_id are renumbered rather than dropped. A block is
// one vehicle working through a day and a shape is one line on the ground, both
// named by the feed that published them - so two feeds numbering a block `1` do
// not mean the same vehicle, and TripsMerger gives each feed's its own ids.
//
// A merge carrying no shapes writes no shape_id either. The column would name a
// shape that is not in the feed, which is a dangling reference rather than a
// missing extra.
export const trips = (shapes: boolean) => fileSchema<TripRow>("trips.txt", [
  "route_id", "service_id", "trip_id", "trip_headsign", "trip_short_name", "direction_id",
  "block_id", ...(shapes ? ["shape_id" as const] : []), "wheelchair_accessible", "bikes_allowed"
]);

export const TRIPS = trips(true);

/**
 * The columns a merge writes of each file it writes, which is what a feed's own
 * columns are compared against to find the ones to pass through.
 */
export function declaredColumns(shapes: boolean): Partial<Record<FeedFileName, readonly string[]>> {
  const files = [
    AGENCY, AREAS, ATTRIBUTIONS, FEED_INFO, STOP_AREAS, FREQUENCIES, CALENDAR, CALENDAR_DATES,
    ROUTES, STOP_TIMES, STOPS, TRANSFERS, trips(shapes), ...(shapes ? [SHAPES] : [])
  ];

  return Object.fromEntries(files.map(file => [file.filename, file.columns as readonly string[]]));
}

/**
 * The columns a merge leaves out on purpose, which a feed carrying them does not
 * put back.
 */
export function withheldColumns(shapes: boolean): Partial<Record<FeedFileName, readonly string[]>> {
  return shapes ? {} : {"trips.txt": ["shape_id"]};
}
