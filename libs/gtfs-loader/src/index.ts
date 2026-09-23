// The imports in this package carry explicit .js extensions, which the rest of the repository does
// not. It publishes ESM as well as CommonJS and node's ESM loader will not resolve a specifier
// without one; nodenext maps them back onto the .ts sources for either build. Do not take them off.

// The feed, and the two ways in
export { GTFSFetchError, loadGTFS, loadGTFSFromUrl } from "./GTFSLoader.js";
export type { FeedInfo, FetchOptions, GTFSFeed, RawFeed, RawOptions } from "./GTFSLoader.js";
export { sizeOf, toChunks } from "./Source.js";
export type { GTFSSource } from "./Source.js";
export { ProgressReporter } from "./Progress.js";
export type { LoadOptions, LoadProgress } from "./Progress.js";

// What the feed is made of. Several of these names are also exported by @gb-transit/gtfs, where
// they mean something else: those are the rows a GB rail feed is written as, these are what any
// feed is read into. Same words, opposite directions - see the README.
export type {
  Agency, AgencyID, AgencyIndex, Area, AreaID, AreaIndex, Calendar, CalendarIndex, DateIndex,
  DateNumber, DayOfWeek, Duration, Interchange, Route, RouteID, RouteIndex, ServiceID, ShapeID,
  ShapeIndex, ShapePoint, Stop, StopID, StopIndex, StopTime, Time, Transfer, TransfersByOrigin,
  Trip, TripID, TripLink
} from "./GTFS.js";
export { transferModes } from "./TransferMode.js";
export { LinkedService, Service } from "./Service.js";
export type { ServiceCalendar } from "./Service.js";
export { addDays, daysBetween, getDateNumber, getDayOfWeek } from "./DateUtil.js";

// Coupled trips: the through trip a passenger stays on across a coupling
export { coupledTripIds, linkShapes, linkTrips } from "./LinkedTrips.js";

// The feed put into the terms a journey planner plans in
export { isCall, normalise } from "./Normalise.js";
export type { TimetableInput } from "./Normalise.js";

// The same feed as the rows it was written as - loadGTFS(source, {raw: true}).
// readFeed is what that is built on, for a caller that wants the rows one at a
// time rather than all of them: a national feed's stop_times.txt is three
// million rows, and holding them to index them holds them twice.
export { readFeed, readFeedRows } from "./ReadFeed.js";
export { readHeaders } from "./ReadHeaders.js";
export type { FeedHandlers, ReadFeedOptions } from "./ReadFeed.js";
export { FEED_FILES, READ_COLUMNS, feedFileOf, toRow } from "./FeedFile.js";
export type { FeedFileName, FeedRowTypes } from "./FeedFile.js";

// The parts both of those are built from
export { CSVParser } from "./CSVParser.js";
export type { Row } from "./CSVParser.js";
export { COLUMNS, entityTypeOf } from "./EntityType.js";
export type { EntityType } from "./EntityType.js";
export { FeedBuilder } from "./FeedBuilder.js";
export { TimeParser } from "./TimeParser.js";
export { readZip } from "./ZipReader.js";
export type { EntrySink, ReadZipOptions, ZipEntry } from "./ZipReader.js";
