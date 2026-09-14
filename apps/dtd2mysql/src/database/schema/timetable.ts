import {boolean, char, date, foreignKey, integer, nullable, table, time, varchar} from "../Schema";

/**
 * The timetable tables.
 *
 * This is what the database holds. The feed definitions in the sibling folders say where each value sits
 * in a record and how to read it, and are checked against these columns, see the schema consistency test.
 * Every table also gets the generated id column that the schema builder adds.
 */
export const physical_station = table({
  station_name: char(26),
  cate_interchange_status: nullable(integer(1)),
  tiploc_code: char(7),
  crs_reference_code: nullable(char(3)),
  crs_code: nullable(char(3)),
  easting: nullable(integer(5)),
  northing: nullable(integer(5)),
  minimum_change_time: integer(2),
}, {
  key: ["tiploc_code"],
  indexes: ["crs_code"]
});

export const alias = table({
  station_name: char(26),
  station_alias: char(26),
}, {
  key: ["station_name"]
});

export const fixed_link = table({
  mode: varchar(10),
  origin: char(3),
  destination: char(3),
  duration: integer(3),
}, {
  key: ["mode", "origin", "destination"]
});

export const association = table({
  base_uid: char(6),
  assoc_uid: char(6),
  start_date: date,
  end_date: date,
  monday: boolean,
  tuesday: boolean,
  wednesday: boolean,
  thursday: boolean,
  friday: boolean,
  saturday: boolean,
  sunday: boolean,
  assoc_cat: nullable(char(2)),
  assoc_date_ind: nullable(char(1)),
  assoc_location: char(7),
  base_location_suffix: char(1),
  assoc_location_suffix: char(1),
  association_type: nullable(char(1)),
  stp_indicator: char(1),
}, {
  key: ["base_uid", "assoc_uid", "assoc_location", "start_date", "stp_indicator"],
  indexes: ["end_date"]
});

export const tiploc = table({
  tiploc_code: char(7),
  capitals: char(2),
  nalco: char(6),
  nlc_check_character: char(1),
  tps_description: nullable(char(26)),
  stanox: char(5),
  po_mcp_code: integer(4),
  crs_code: nullable(char(3)),
  description: nullable(char(16)),
}, {
  key: ["tiploc_code"],
  indexes: ["crs_code"]
});

export const schedule = table({
  train_uid: char(6),
  runs_from: date,
  runs_to: date,
  monday: boolean,
  tuesday: boolean,
  wednesday: boolean,
  thursday: boolean,
  friday: boolean,
  saturday: boolean,
  sunday: boolean,
  bank_holiday_running: boolean,
  train_status: nullable(char(1)),
  train_category: nullable(char(2)),
  train_identity: nullable(char(4)),
  headcode: nullable(char(4)),
  course_indicator: char(1),
  profit_center: nullable(char(8)),
  business_sector: nullable(char(1)),
  power_type: nullable(char(3)),
  timing_load: nullable(char(4)),
  speed: nullable(char(3)),
  operating_chars: nullable(char(6)),
  train_class: nullable(char(1)),
  sleepers: nullable(char(1)),
  reservations: nullable(char(1)),
  connect_indicator: nullable(char(1)),
  catering_code: nullable(char(4)),
  service_branding: nullable(char(4)),
  stp_indicator: char(1),
}, {
  key: ["train_uid", "runs_from", "stp_indicator"],
  indexes: ["runs_from"]
});

export const schedule_extra = table({
  schedule: foreignKey,
  traction_class: nullable(char(4)),
  uic_code: nullable(char(5)),
  atoc_code: char(2),
  applicable_timetable_code: char(1),
  retail_train_id: nullable(char(8)),
  source: nullable(char(1)),
}, {
  indexes: ["schedule"]
});

export const stop_time = table({
  schedule: foreignKey,
  location: char(7),
  suffix: nullable(integer(1)),
  scheduled_arrival_time: nullable(time),
  scheduled_departure_time: nullable(time),
  scheduled_pass_time: nullable(time),
  public_arrival_time: nullable(time),
  public_departure_time: nullable(time),
  platform: nullable(char(3)),
  line: nullable(char(3)),
  path: nullable(char(3)),
  activity: varchar(12),
  engineering_allowance: nullable(char(2)),
  pathing_allowance: nullable(char(2)),
  performance_allowance: nullable(char(2)),
}, {
  key: ["schedule", "location", "suffix", "public_departure_time"]
});

export const service_change = table({
  stop: foreignKey,
  location: char(7),
  suffix: nullable(integer(1)),
  train_category: nullable(char(2)),
  train_identity: nullable(char(4)),
  headcode: nullable(char(4)),
  course_indicator: char(1),
  profit_center: nullable(char(8)),
  business_sector: nullable(char(1)),
  power_type: nullable(char(3)),
  timing_load: nullable(char(4)),
  speed: nullable(char(3)),
  operating_chars: nullable(char(6)),
  train_class: nullable(char(1)),
  sleepers: nullable(char(1)),
  reservations: nullable(char(1)),
  connect_indicator: nullable(char(1)),
  catering_code: nullable(char(4)),
  service_branding: nullable(char(4)),
  traction_class: nullable(char(4)),
  uic_code: nullable(char(5)),
  retail_train_id: nullable(char(8)),
}, {
  indexes: ["stop"]
});

export const z_schedule = table({
  train_uid: char(6),
  runs_from: date,
  runs_to: date,
  monday: boolean,
  tuesday: boolean,
  wednesday: boolean,
  thursday: boolean,
  friday: boolean,
  saturday: boolean,
  sunday: boolean,
  bank_holiday_running: boolean,
  train_status: nullable(char(1)),
  train_category: nullable(char(2)),
  train_identity: nullable(char(4)),
  headcode: nullable(char(4)),
  course_indicator: nullable(char(1)),
  profit_center: nullable(char(8)),
  business_sector: nullable(char(1)),
  power_type: nullable(char(3)),
  timing_load: nullable(char(4)),
  speed: nullable(char(3)),
  operating_chars: nullable(char(6)),
  train_class: nullable(char(1)),
  sleepers: nullable(char(1)),
  reservations: nullable(char(1)),
  connect_indicator: nullable(char(1)),
  catering_code: nullable(char(4)),
  service_branding: nullable(char(4)),
  stp_indicator: char(1),
}, {
  key: ["train_uid", "runs_from", "stp_indicator"],
  indexes: ["runs_from"]
});

export const z_schedule_extra = table({
  schedule: foreignKey,
  atoc_code: nullable(char(2)),
}, {
  indexes: ["schedule"]
});

export const z_stop_time = table({
  z_schedule: foreignKey,
  location: char(3),
  scheduled_arrival_time: nullable(time),
  scheduled_departure_time: nullable(time),
  scheduled_pass_time: nullable(time),
  public_arrival_time: nullable(time),
  public_departure_time: nullable(time),
  platform: nullable(char(3)),
  line: nullable(char(3)),
  path: nullable(char(3)),
  activity: varchar(12),
  engineering_allowance: nullable(char(2)),
  pathing_allowance: nullable(char(2)),
  performance_allowance: nullable(char(2)),
}, {
  key: ["z_schedule", "location", "public_departure_time"]
});

export const additional_fixed_link = table({
  mode: varchar(10),
  origin: char(3),
  destination: char(3),
  duration: integer(3),
  start_time: time,
  end_time: time,
  priority: integer(1),
  start_date: nullable(date),
  end_date: nullable(date),
  monday: boolean,
  tuesday: boolean,
  wednesday: boolean,
  thursday: boolean,
  friday: boolean,
  saturday: boolean,
  sunday: boolean,
});

export const toc_interchange = table({
  crs: char(3),
  from_toc: char(2),
  to_toc: char(2),
  time: integer(2),
}, {
  key: ["crs", "from_toc", "to_toc"]
});

export default {
  physical_station,
  alias,
  fixed_link,
  association,
  tiploc,
  schedule,
  schedule_extra,
  stop_time,
  service_change,
  z_schedule,
  z_schedule_extra,
  z_stop_time,
  additional_fixed_link,
  toc_interchange
};
