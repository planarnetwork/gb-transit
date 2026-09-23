// GTFS entities - the shape of each output file - and the scalars they are
// written in. They live in @gb-transit/gtfs-schema, which depends on nothing, so
// that a consumer wanting only the vocabulary does not also get proj4 and the
// Temporal-typed schedule model. Re-exported here so this package's surface is
// what it always was.
export type {Agency, AgencyID, AgencyRow} from "@gb-transit/gtfs-schema";
export type {Area, AreaID, AreaRow, StopArea, StopAreaRow} from "@gb-transit/gtfs-schema";
export type {AttributionRole, AttributionRow} from "@gb-transit/gtfs-schema";
export type {Calendar, CalendarRow} from "@gb-transit/gtfs-schema";
export type {CalendarDate, CalendarDateRow} from "@gb-transit/gtfs-schema";
export type {FixedLink, FixedLinkRow} from "@gb-transit/gtfs-schema";
export {RouteType} from "@gb-transit/gtfs-schema";
export type {Route, RouteID, RouteRow} from "@gb-transit/gtfs-schema";
export type {Stop, StopRow, CRS, TIPLOC} from "@gb-transit/gtfs-schema";
export type {StopTime, StopTimeRow, Platform} from "@gb-transit/gtfs-schema";
export {TransferType} from "@gb-transit/gtfs-schema";
export type {Transfer, TransferRow, StopID} from "@gb-transit/gtfs-schema";
export type {Trip, TripRow} from "@gb-transit/gtfs-schema";
export type {FeedInfo, FeedInfoRow} from "@gb-transit/gtfs-schema";
export type {FeedRow} from "@gb-transit/gtfs-schema";
export {fileSchema, GTFS_COLUMNS} from "@gb-transit/gtfs-schema";
export type {Columns, FileSchema, GTFSColumn, GTFSFileName} from "@gb-transit/gtfs-schema";
export type {Shape, ShapeID, ShapeRow} from "@gb-transit/gtfs-schema";

// The transit model - pure domain objects with no IO
export {Association, AssociationType, DateIndicator} from "./model/Association";
export type {AssociationApplication, AssociationLink} from "./model/Association";
export {SECONDS_IN_DAY, formatDuration, parseDuration} from "@gb-transit/gtfs-schema";
export type {Duration} from "@gb-transit/gtfs-schema";
export {STP} from "./model/OverlayRecord";
export type {IdGenerator, OverlayRecord} from "./model/OverlayRecord";
export type {RSID, TUID} from "@gb-transit/gtfs-schema";
export {compare, dayOfWeek, maxDate, minDate, toYYYYMMDD} from "@gb-transit/gtfs-schema";
export type {DayOfWeek} from "@gb-transit/gtfs-schema";
export {Schedule, tripId} from "./model/Schedule";
export {NO_DAYS, OverlapType, ScheduleCalendar} from "./model/ScheduleCalendar";
export type {BankHoliday, Days, ExcludeDays} from "./model/ScheduleCalendar";

// Transforms - overlays, associations, merging and calendars
export {shiftLateNightServices} from "./transform/ShiftLateNightServices";
export {applyAssociations} from "./transform/ApplyAssociations";
export type {AssociatedSchedules, AssociationIndex, ScheduleIndex} from "./transform/ApplyAssociations";
export {combinedHeadsigns, onwardHeadsigns} from "./transform/Headsigns";
export {linkedTrips, resolveLinks} from "./transform/LinkedTrips";
export type {TripLink} from "./transform/LinkedTrips";
export {reversingTrips} from "./transform/ReversingTrips";
export {reversalRules} from "./data/reversal";
export type {ReversalRule} from "./data/reversal";
export {applyOverlays} from "./transform/ApplyOverlays";
export type {OverlayIndex} from "./transform/ApplyOverlays";
export {createCalendar} from "./transform/CreateCalendar";
export type {HasCalendar, ServiceIdIndex} from "./transform/CreateCalendar";
export type {Frequency} from "./transform/Frequency";
export {mergeSchedules} from "./transform/MergeSchedules";

// Transforms - what the feed publishes, and the identifiers it publishes it by
export {TIMETABLE_ATTRIBUTION, createAttributions} from "./transform/CreateAttributions";
export {createFeedInfo} from "./transform/CreateFeedInfo";
export {dropUnknownStops} from "./transform/DropUnknownStops";
export {excludeLinks, excludeServices, LINK_MODES, MODES, NO_EXCLUSIONS} from "./transform/ExcludeServices";
export type {ServiceExclusions} from "./transform/ExcludeServices";
export {interchange, mergeTransfers} from "./transform/MergeTransfers";
export {stopId, toStopTimeRow, withStopPoints} from "./transform/Platforms";
export {shapes} from "./transform/Shapes";
export type {FeedShapes} from "./transform/Shapes";
export {stationId, stopPointId} from "./transform/Atco";
export {agencyId, toAgencyRow, toRouteRow} from "./transform/Noc";

// The build orchestrator
export {BuildFeed} from "./build/BuildFeed";
export {buildContext, dateRange, option, options, parseRange} from "./build/BuildContext";
export type {BuildContext, DateRange} from "./build/BuildContext";
export type {GTFSOutput, RowWriter} from "@gb-transit/gtfs-schema";
export {buildReport} from "./build/BuildReport";
export type {BuildReport, SourceReport} from "./build/BuildReport";
export {ScheduleBuilder} from "./build/ScheduleBuilder";
export type {ScheduleResults} from "./build/ScheduleBuilder";
export {parseConfig} from "./build/BuildConfig";
export type {BuildConfig, EnricherConfig, ExtensionConfig, Licence} from "./build/BuildConfig";

// Enrichment - what an external source is allowed to change, and the record of
// what it did
export {enrich, order, provenanceFile} from "./enrich/Enrich";
export {MutableFeed} from "./enrich/MutableFeed";
export {Provenance} from "./enrich/Provenance";
export type {Write, FieldHistory} from "./enrich/Provenance";
export type {Enricher, EnrichmentReport, Attribution} from "./enrich/Enricher";

// Extension - whole files the core build has no concept of
export {checkKeys, extend} from "./extend/Extend";
export {extensionFile} from "./extend/Extension";
export type {Extension, ExtensionFile, ExtensionOutput, ExtensionReport, KeyValue} from "./extend/Extension";
export type {FeedView} from "./extend/FeedView";

// The source SPI
export type {ScheduleStopTimeRow, StationCoordinates, TimetableSource} from "./source/TimetableSource";
export {toStop} from "./source/StationRecord";
export {isPlaceholder, withoutPlaceholders, reportDroppedStops} from "./source/Placeholder";
export {BOUNDS, inBounds} from "./source/Bounds";
export {locate, NOWHERE, toStopRow} from "./source/Located";
export type {StationRecord} from "./source/StationRecord";
export {toFixedLinks} from "./source/FixedLinkRecord";
export type {FixedLinkRecord} from "./source/FixedLinkRecord";

// Data that belongs in a source with a provenance rather than in the library
export {agencies} from "./data/agency";
export {stationCoordinates} from "./data/station-coordinates";
