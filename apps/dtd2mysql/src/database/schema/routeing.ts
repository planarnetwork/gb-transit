import {boolean, char, date, double, integer, nullable, table, varchar} from "../Schema";

/**
 * The routeing tables.
 *
 * This is what the database holds. The feed definitions in the sibling folders say where each value sits
 * in a record and how to read it, and are checked against these columns, see the schema consistency test.
 * Every table also gets the generated id column that the schema builder adds.
 */
export const station_routeing_point = table({
  station_identifier: char(3),
  routeing_point_1: nullable(char(3)),
  routeing_point_2: nullable(char(3)),
  routeing_point_3: nullable(char(3)),
  routeing_point_4: nullable(char(3)),
  station_group_id: nullable(char(3)),
}, {
  key: ["station_identifier"]
});

export const station_group = table({
  station_group_id: char(3),
  main_station: char(3),
}, {
  key: ["station_group_id"]
});

export const routeing_point = table({
  routeing_point: char(3),
}, {
  key: ["routeing_point"]
});

export const map = table({
  map_identifier: char(2),
}, {
  key: ["map_identifier"]
});

export const link = table({
  start_node: char(3),
  end_node: char(3),
  map_code: char(2),
}, {
  key: ["start_node", "end_node", "map_code"]
});

export const permitted_route = table({
  start_routeing_point: char(3),
  end_routeing_point: char(3),
  map_code: varchar(150),
});

export const station_link = table({
  start_station: char(3),
  end_station: char(3),
  distance: double(7, 4),
}, {
  key: ["start_station", "end_station"]
});

export const easement = table({
  easement_ref: char(6),
  start_date: date,
  end_date: date,
  text_ref: char(6),
  easement_type: integer(1),
  easement_class: integer(1),
  category: integer(1),
  monday: nullable(boolean),
  tuesday: nullable(boolean),
  wednesday: nullable(boolean),
  thursday: nullable(boolean),
  friday: nullable(boolean),
  saturday: nullable(boolean),
  sunday: nullable(boolean),
}, {
  key: ["easement_ref"]
});

export const easement_location = table({
  easement_ref: char(6),
  location_code: char(3),
  location_modifier: integer(1),
});

export const easement_detail = table({
  easement_ref: char(6),
  detail_type: integer(1),
  detail_code: varchar(8),
}, {
  key: ["easement_ref", "detail_type", "detail_code"]
});

export const easement_exception = table({
  easement_ref: char(6),
  exception_type: integer(1),
  exception_code: varchar(8),
}, {
  key: ["easement_ref", "exception_type", "exception_code"]
});

export const easement_toc = table({
  text_ref: char(6),
  toc: char(2),
}, {
  key: ["text_ref", "toc"]
});

export const london_route = table({
  route_code: char(5),
  london_marker: integer(1),
}, {
  key: ["route_code"]
});

export const route_data = table({
  route_code: char(5),
  entry_type: char(1),
  crs_code: nullable(char(3)),
  group_mkr: boolean,
  mode_code: nullable(char(3)),
  toc_id: nullable(char(2)),
});

export const london_station = table({
  crs_code: char(3),
  lt_marker: boolean,
  xlondon_marker: boolean,
}, {
  key: ["crs_code"]
});

export const new_station = table({
  nfm64_station_code: char(3),
  new_station_code: char(3),
  start_date: date,
  end_date: date,
}, {
  key: ["nfm64_station_code", "new_station_code"]
});

export const easement_text = table({
  text_ref: char(6),
  easement_text: varchar(2000),
}, {
  key: ["text_ref"]
});

export const location = table({
  uic_code: char(3),
  nlc_code: char(4),
  group_code: char(4),
  crs_code: nullable(char(3)),
  county_code: char(2),
  zone_code: nullable(char(4)),
  start_date: date,
  end_date: date,
}, {
  key: ["uic_code", "nlc_code"]
});

export const routeing_node = table({
  node: char(3),
}, {
  key: ["node"]
});

export default {
  station_routeing_point,
  station_group,
  routeing_point,
  map,
  link,
  permitted_route,
  station_link,
  easement,
  easement_location,
  easement_detail,
  easement_exception,
  easement_toc,
  london_route,
  route_data,
  london_station,
  new_station,
  easement_text,
  location,
  routeing_node
};
