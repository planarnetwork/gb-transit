import {ascii, boolean, char, date, decimal, defaultTo, float, integer, nullable, serviceTime, time, varchar} from "../database/Schema";
import {gtfsTable} from "../database/GTFSSchema";

/**
 * The tables --gtfs-import loads the GTFS files into.
 *
 * They hold each file as it was written, so the columns are the columns of the file and the key is the
 * one the GTFS specification gives. Declaring them rather than writing the DDL out is what lets the same
 * import run against MySQL, Postgres and SQLite.
 *
 * A table is named after the file that fills it, and the loader matches values to columns by the file's
 * header. The two orders do not have to agree - stops.txt writes its coordinates last while the table
 * declares them in the middle - which is the whole class of bug a positional column list had.
 */

export const agency = gtfsTable({
  agency_id: varchar(100),
  agency_name: varchar(255),
  agency_url: varchar(255),
  agency_timezone: varchar(100),
  agency_lang: nullable(varchar(100)),
  agency_phone: nullable(varchar(100)),
  agency_fare_url: nullable(varchar(100)),
}, {
  primaryKey: ["agency_id"]
});

/**
 * The spec has no field for the terms, which is the one thing an attribution statement has to say, so
 * attribution_licence is a producer extension. See entity/Attribution.ts.
 */
export const attributions = gtfsTable({
  organization_name: varchar(255),
  is_producer: boolean,
  is_operator: boolean,
  is_authority: boolean,
  attribution_url: nullable(varchar(255)),
  attribution_licence: varchar(255),
});

export const calendar = gtfsTable({
  // A counter over the distinct calendars of a build rather than anything the feed numbers, so the
  // digits are a ceiling on how many a feed may have. Four of them is 9999 calendars, and Postgres
  // stores that as a smallint, which stops at 32767 where MySQL's unsigned one reaches 65535: a
  // three month national feed is close enough to both for the difference to be a failed import on
  // one database and not the other. See CreateCalendar.ts.
  service_id: integer(7),
  monday: boolean,
  tuesday: boolean,
  wednesday: boolean,
  thursday: boolean,
  friday: boolean,
  saturday: boolean,
  sunday: boolean,
  start_date: date,
  end_date: date,
}, {
  primaryKey: ["service_id"],
  indexes: [
    "start_date", "end_date", "monday", "tuesday", "wednesday", "thursday", "friday", "saturday", "sunday"
  ]
});

export const calendar_dates = gtfsTable({
  service_id: integer(7),
  date: date,
  exception_type: integer(2),
}, {
  primaryKey: ["service_id", "date"]
});

export const feed_info = gtfsTable({
  feed_publisher_name: varchar(255),
  feed_publisher_url: varchar(255),
  feed_lang: varchar(15),
  feed_start_date: date,
  feed_end_date: date,
  feed_version: nullable(varchar(255)),
});

export const routes = gtfsTable({
  route_id: varchar(100),
  agency_id: nullable(varchar(100)),
  route_short_name: varchar(50),
  route_long_name: varchar(255),
  route_type: integer(7),
  route_text_color: nullable(varchar(255)),
  route_color: nullable(varchar(255)),
  route_url: nullable(varchar(255)),
  route_desc: nullable(varchar(255)),
}, {
  primaryKey: ["route_id"]
});

/**
 * Nothing writes shapes.txt today. The table is declared so that the import replaces it rather than
 * leaving whatever an older feed put there.
 *
 * The coordinates are floats rather than the declared precision the other numbers use, because a
 * longitude west of Greenwich is negative and the sized numeric type is unsigned.
 */
export const shapes = gtfsTable({
  // Twelve hex characters of a digest of the stations the line runs through, so the same line is the
  // same id in every build. See Shapes.ts.
  shape_id: ascii(char(12)),
  // Six decimal places, which is what the feed writes. Two integer digits for a latitude and three for
  // a longitude, because those are the ranges: +-90 and +-180.
  //
  // decimal rather than the float stops.txt uses, and the two are answering different questions. A
  // stop's coordinate is whatever its source surveyed and this stores it as given; a shape point is
  // written to a fixed six places by the producer, so an exact type stores exactly that and a double
  // would read 51.126 back as 51.126000000000005.
  shape_pt_lat: decimal(8, 6),
  shape_pt_lon: decimal(9, 6),
  // five digits, not two: the longest line in a national feed is over 200 points.
  shape_pt_sequence: integer(5),
  shape_dist_traveled: nullable(varchar(50)),
}, {
  primaryKey: ["shape_id", "shape_pt_sequence"]
});

/**
 * A trip id is a string the build composes, not a counter: TUID and the dates the calendar runs
 * between, e.g. G38968_20261018_20261018. The longest in a three month feed is 26 characters.
 */
export const stop_times = gtfsTable({
  trip_id: ascii(varchar(32)),
  arrival_time: nullable(serviceTime),
  departure_time: nullable(serviceTime),
  stop_id: varchar(100),
  stop_sequence: integer(2),
  stop_headsign: nullable(varchar(50)),
  pickup_type: nullable(integer(2)),
  drop_off_type: nullable(integer(2)),
  shape_dist_traveled: nullable(varchar(50)),
  timepoint: nullable(integer(2)),
}, {
  primaryKey: ["trip_id", "stop_sequence"],
  indexes: ["arrival_time", "departure_time", "stop_id"]
});

export const stops = gtfsTable({
  stop_id: varchar(100),
  stop_code: nullable(varchar(50)),
  stop_name: varchar(255),
  stop_desc: nullable(varchar(255)),
  stop_lat: nullable(float),
  stop_lon: nullable(float),
  zone_id: nullable(varchar(255)),
  stop_url: nullable(varchar(255)),
  location_type: nullable(varchar(2)),
  parent_station: nullable(varchar(100)),
  platform_code: nullable(varchar(50)),
  stop_timezone: nullable(varchar(50)),
  wheelchair_boarding: nullable(integer(2)),
}, {
  primaryKey: ["stop_id"]
});

/**
 * from_trip_id and to_trip_id are empty rather than null so they can stay in the primary key, which the
 * pair of stops is not unique without: a coupling happens at a station that already has an interchange
 * time.
 *
 * mode through sunday are the producer extension columns transfers.txt carries for a fixed link - the
 * mode, the window it runs in and the days it runs on. All null on a station interchange row, which has
 * no link to describe.
 */
export const transfers = gtfsTable({
  from_stop_id: varchar(100),
  to_stop_id: varchar(100),
  from_trip_id: defaultTo(ascii(varchar(32)), ""),
  to_trip_id: defaultTo(ascii(varchar(32)), ""),
  transfer_type: integer(2),
  // seconds, and a fixed link may take up to 999 minutes: 59940 is five digits
  min_transfer_time: nullable(integer(5)),
  mode: nullable(varchar(255)),
  start_time: nullable(time),
  end_time: nullable(time),
  start_date: nullable(date),
  end_date: nullable(date),
  monday: nullable(boolean),
  tuesday: nullable(boolean),
  wednesday: nullable(boolean),
  thursday: nullable(boolean),
  friday: nullable(boolean),
  saturday: nullable(boolean),
  sunday: nullable(boolean),
}, {
  primaryKey: ["from_stop_id", "to_stop_id", "from_trip_id", "to_trip_id", "transfer_type"]
});

export const trips = gtfsTable({
  route_id: varchar(255),
  service_id: integer(7),
  trip_id: ascii(varchar(32)),
  trip_headsign: nullable(varchar(50)),
  trip_short_name: nullable(varchar(50)),
  direction_id: nullable(integer(2)),
  wheelchair_accessible: nullable(integer(2)),
  bikes_allowed: nullable(integer(2)),
  // Nullable: a trip every station of which the feed cannot place has no line to point at. See Shapes.ts.
  shape_id: nullable(ascii(char(12))),
}, {
  primaryKey: ["trip_id"],
  indexes: ["service_id", "trip_headsign"]
});

export default {
  agency,
  attributions,
  calendar,
  calendar_dates,
  feed_info,
  routes,
  shapes,
  stop_times,
  stops,
  transfers,
  trips
};
