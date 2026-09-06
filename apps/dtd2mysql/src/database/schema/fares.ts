import {boolean, char, date, integer, nullable, table, time} from "../Schema";

/**
 * The fares tables.
 *
 * This is what the database holds. The feed definitions in the sibling folders say where each value sits
 * in a record and how to read it, and are checked against these columns, see the schema consistency test.
 * Every table also gets the generated id column that the schema builder adds.
 */
export const status = table({
  status_code: char(3),
  end_date: date,
  start_date: date,
  atb_desc: nullable(char(5)),
  cc_desc: nullable(char(5)),
  uts_code: char(1),
  first_single_max_flat: nullable(integer(8)),
  first_return_max_flat: nullable(integer(8)),
  std_single_max_flat: nullable(integer(8)),
  std_return_max_flat: nullable(integer(8)),
  first_lower_min: nullable(integer(8)),
  first_higher_min: nullable(integer(8)),
  std_lower_min: nullable(integer(8)),
  std_higher_min: nullable(integer(8)),
  fs_mkr: boolean,
  fr_mkr: boolean,
  ss_mkr: boolean,
  sr_mkr: boolean,
}, {
  key: ["status_code", "end_date"]
});

export const status_discount = table({
  status_code: char(3),
  end_date: date,
  discount_category: integer(2),
  discount_indicator: char(1),
  discount_percentage: integer(3),
}, {
  key: ["status_code", "end_date", "discount_category"]
});

export const flow = table({
  origin_code: char(4),
  destination_code: char(4),
  route_code: char(5),
  status_code: char(3),
  usage_code: char(1),
  direction: char(1),
  end_date: date,
  start_date: date,
  toc: char(3),
  cross_london_ind: integer(1),
  ns_disc_ind: integer(1),
  publication_ind: char(1),
  flow_id: integer(7),
}, {
  key: ["origin_code", "destination_code", "route_code", "status_code", "usage_code", "direction", "end_date"]
});

export const fare = table({
  flow_id: integer(7),
  ticket_code: char(3),
  fare: integer(8),
  restriction_code: nullable(char(2)),
}, {
  key: ["flow_id", "ticket_code"]
});

export const non_standard_discount = table({
  origin_code: nullable(char(4)),
  destination_code: nullable(char(4)),
  route_code: nullable(char(5)),
  railcard_code: nullable(char(3)),
  ticket_code: nullable(char(3)),
  end_date: date,
  start_date: date,
  quote_date: date,
  use_nlc: nullable(char(4)),
  adult_nodis_flag: char(1),
  adult_add_on_amount: nullable(integer(8)),
  adult_rebook_flag: char(1),
  child_nodis_flag: char(1),
  child_add_on_amount: nullable(integer(8)),
  child_rebook_flag: char(1),
}, {
  key: ["origin_code", "destination_code", "route_code", "railcard_code", "ticket_code", "end_date"]
});

export const station_cluster = table({
  cluster_id: char(4),
  cluster_nlc: char(4),
  end_date: date,
  start_date: date,
}, {
  key: ["cluster_id", "cluster_nlc", "end_date"],
  indexes: ["cluster_nlc"]
});

export const location = table({
  uic: char(7),
  end_date: date,
  start_date: date,
  quote_date: date,
  area_admin_code: char(2),
  nlc: nullable(char(4)),
  description: char(16),
  crs: nullable(char(3)),
  resv: char(5),
  ers_country: nullable(char(2)),
  ers_code: nullable(char(3)),
  fare_group: nullable(char(6)),
  county: nullable(char(2)),
  pte_code: nullable(char(2)),
  zone_no: nullable(char(4)),
  zone_ind: nullable(char(2)),
  region: nullable(char(1)),
  hierarchy: nullable(char(1)),
  cc_desc_out: nullable(char(41)),
  cc_desc_rtn: nullable(char(16)),
  atb_desc_out: nullable(char(60)),
  atb_desc_rtn: nullable(char(30)),
  special_facilities: nullable(char(26)),
  lul_direction_ind: nullable(char(1)),
  lul_uts_mode: nullable(char(1)),
  lul_zone_1: nullable(boolean),
  lul_zone_2: nullable(boolean),
  lul_zone_3: nullable(boolean),
  lul_zone_4: nullable(boolean),
  lul_zone_5: nullable(boolean),
  lul_zone_6: nullable(boolean),
  lul_uts_london_stn: nullable(char(1)),
  uts_code: nullable(char(3)),
  uts_a_code: nullable(char(3)),
  uts_ptr_bias: nullable(char(1)),
  uts_offset: nullable(char(1)),
  uts_north: nullable(char(3)),
  uts_east: nullable(char(3)),
  uts_south: nullable(char(3)),
  uts_west: nullable(char(3)),
}, {
  key: ["uic", "end_date", "start_date"],
  indexes: ["nlc"]
});

export const location_association = table({
  uic_code: char(7),
  end_date: date,
  assoc_uic_code: char(7),
  assoc_crs_code: char(3),
}, {
  key: ["uic_code", "end_date", "assoc_uic_code"]
});

export const location_group = table({
  group_uic_code: char(7),
  end_date: date,
  start_date: date,
  quote_date: date,
  description: char(16),
  ers_country: nullable(char(2)),
  ers_code: nullable(char(3)),
}, {
  key: ["group_uic_code", "end_date"]
});

export const location_group_member = table({
  group_uic_code: char(7),
  end_date: date,
  member_uic_code: char(7),
  member_crs_code: char(3),
}, {
  key: ["group_uic_code", "end_date", "member_uic_code"],
  indexes: ["member_uic_code"]
});

export const location_synonym = table({
  uic_code: char(7),
  end_date: date,
  start_date: date,
  description: char(16),
}, {
  key: ["uic_code", "end_date", "start_date", "description"]
});

export const location_railcard = table({
  uic_code: char(7),
  railcard_code: char(3),
  end_date: date,
}, {
  key: ["uic_code", "railcard_code", "end_date"]
});

export const non_derivable_fare = table({
  origin_code: char(4),
  destination_code: char(4),
  route_code: nullable(char(5)),
  railcard_code: char(3),
  ticket_code: char(3),
  nd_record_type: char(1),
  end_date: date,
  start_date: date,
  quote_date: date,
  suppress_mkr: boolean,
  adult_fare: nullable(integer(8)),
  child_fare: nullable(integer(8)),
  restriction_code: nullable(char(2)),
  composite_indicator: char(1),
  cross_london_ind: boolean,
  ps_ind: char(1),
}, {
  key: ["origin_code", "destination_code", "route_code", "railcard_code", "ticket_code", "nd_record_type", "end_date"]
});

export const non_derivable_fare_override = table({
  origin_code: char(4),
  destination_code: char(4),
  route_code: nullable(char(5)),
  railcard_code: char(3),
  ticket_code: char(3),
  nd_record_type: char(1),
  end_date: date,
  start_date: date,
  quote_date: date,
  suppress_mkr: boolean,
  adult_fare: nullable(integer(8)),
  child_fare: nullable(integer(8)),
  restriction_code: nullable(char(2)),
  composite_indicator: nullable(char(1)),
  cross_london_ind: nullable(boolean),
  ps_ind: nullable(char(1)),
}, {
  key: ["origin_code", "destination_code", "route_code", "railcard_code", "ticket_code", "nd_record_type", "end_date"]
});

export const railcard_minimum_fare = table({
  railcard_code: char(3),
  ticket_code: char(3),
  end_date: date,
  start_date: date,
  minimum_fare: integer(8),
}, {
  key: ["railcard_code", "ticket_code", "end_date"]
});

export const railcard = table({
  railcard_code: char(3),
  end_date: date,
  start_date: date,
  quote_date: date,
  holder_type: char(1),
  description: char(20),
  restricted_by_issue: boolean,
  restricted_by_area: boolean,
  restricted_by_train: boolean,
  restricted_by_date: boolean,
  master_code: nullable(char(3)),
  display_flag: char(1),
  max_passengers: integer(3),
  min_passengers: integer(3),
  max_holders: integer(3),
  min_holders: integer(3),
  max_acc_adults: integer(3),
  min_acc_adults: integer(3),
  max_adults: integer(3),
  min_adults: integer(3),
  max_children: integer(3),
  min_children: integer(3),
  price: nullable(integer(8)),
  discount_price: nullable(integer(8)),
  validity_period: nullable(char(4)),
  last_valid_date: nullable(date),
  physical_card: boolean,
  capri_ticket_type: nullable(char(3)),
  adult_status: nullable(char(3)),
  child_status: nullable(char(3)),
  aaa_status: nullable(char(3)),
}, {
  key: ["railcard_code", "end_date"]
});

export const restriction_date = table({
  cf_mkr: char(1),
  start_date: date,
  end_date: date,
  atb_desc: nullable(char(5)),
}, {
  key: ["cf_mkr"]
});

export const restriction_header = table({
  cf_mkr: char(1),
  restriction_code: char(2),
  description: nullable(char(30)),
  desc_out: nullable(char(50)),
  desc_ret: nullable(char(50)),
  type_out: char(1),
  type_ret: char(1),
  change_ind: boolean,
}, {
  key: ["cf_mkr", "restriction_code"]
});

export const restriction_header_date = table({
  cf_mkr: char(1),
  restriction_code: char(2),
  date_from: char(4),
  date_to: char(4),
  monday: boolean,
  tuesday: boolean,
  wednesday: boolean,
  thursday: boolean,
  friday: boolean,
  saturday: boolean,
  sunday: boolean,
  start_date: nullable(date),
  end_date: nullable(date),
}, {
  key: ["cf_mkr", "restriction_code", "date_from", "date_to"]
});

export const restriction_time = table({
  cf_mkr: char(1),
  restriction_code: char(2),
  sequence_no: char(4),
  out_ret: char(1),
  time_from: time,
  time_to: time,
  arr_dep_via: char(1),
  location: nullable(char(3)),
  rstr_type: char(1),
  train_type: char(1),
  min_fare_flag: boolean,
}, {
  key: ["cf_mkr", "restriction_code", "sequence_no", "out_ret"]
});

export const restriction_time_date = table({
  cf_mkr: char(1),
  restriction_code: char(2),
  sequence_no: char(4),
  out_ret: char(1),
  date_from: char(4),
  date_to: char(4),
  monday: boolean,
  tuesday: boolean,
  wednesday: boolean,
  thursday: boolean,
  friday: boolean,
  saturday: boolean,
  sunday: boolean,
  start_date: nullable(date),
  end_date: nullable(date),
}, {
  key: ["cf_mkr", "restriction_code", "sequence_no", "out_ret", "date_from", "date_to"]
});

export const restriction_time_toc = table({
  cf_mkr: char(1),
  restriction_code: char(2),
  sequence_no: char(4),
  out_ret: char(1),
  toc_code: char(2),
}, {
  key: ["cf_mkr", "restriction_code", "sequence_no", "out_ret", "toc_code"]
});

export const restriction_train = table({
  cf_mkr: char(1),
  restriction_code: char(2),
  train_no: char(6),
  out_ret: char(1),
  quota_ind: char(1),
  sleeper_ind: char(1),
}, {
  key: ["cf_mkr", "restriction_code", "train_no", "out_ret"]
});

export const restriction_train_date = table({
  cf_mkr: char(1),
  restriction_code: char(2),
  train_no: char(6),
  out_ret: char(1),
  date_from: char(4),
  date_to: char(4),
  monday: boolean,
  tuesday: boolean,
  wednesday: boolean,
  thursday: boolean,
  friday: boolean,
  saturday: boolean,
  sunday: boolean,
  start_date: nullable(date),
  end_date: nullable(date),
}, {
  key: ["cf_mkr", "restriction_code", "train_no", "out_ret", "date_from", "date_to"]
});

export const restriction_train_quota = table({
  cf_mkr: char(1),
  restriction_code: char(2),
  train_no: char(6),
  out_ret: char(1),
  location: char(3),
  quota_ind: nullable(char(1)),
  arr_dep: char(1),
}, {
  key: ["cf_mkr", "restriction_code", "train_no", "out_ret", "location", "quota_ind", "arr_dep"]
});

export const restriction_railcard = table({
  cf_mkr: char(1),
  railcard_code: char(3),
  sequence_no: char(4),
  ticket_code: nullable(char(3)),
  route_code: nullable(char(5)),
  location: nullable(char(3)),
  restriction_code: nullable(char(2)),
  total_ban: boolean,
}, {
  key: ["cf_mkr", "railcard_code", "sequence_no"]
});

export const restriction_exception = table({
  cf_mkr: char(1),
  exception_code: char(1),
  description: char(50),
}, {
  key: ["cf_mkr", "exception_code"]
});

export const restriction_ticket_calendar = table({
  cf_mkr: char(1),
  ticket_code: char(3),
  cal_type: char(1),
  route_code: nullable(char(5)),
  country_code: char(1),
  date_from: char(4),
  date_to: char(4),
  monday: boolean,
  tuesday: boolean,
  wednesday: boolean,
  thursday: boolean,
  friday: boolean,
  saturday: boolean,
  sunday: boolean,
  start_date: nullable(date),
  end_date: nullable(date),
}, {
  key: ["cf_mkr", "ticket_code", "cal_type", "route_code", "country_code", "date_from", "date_to"]
});

export const route = table({
  route_code: char(5),
  end_date: date,
  start_date: date,
  quote_date: date,
  description: char(16),
  atb_desc_1: nullable(char(35)),
  atb_desc_2: nullable(char(35)),
  atb_desc_3: nullable(char(35)),
  atb_desc_4: nullable(char(35)),
  cc_desc: char(16),
  aaa_desc: nullable(char(41)),
  uts_mode: char(1),
  uts_zone_1: boolean,
  uts_zone_2: boolean,
  uts_zone_3: boolean,
  uts_zone_4: boolean,
  uts_zone_5: boolean,
  uts_zone_6: boolean,
  uts_north: char(3),
  uts_east: char(3),
  uts_south: char(3),
  uts_west: char(3),
}, {
  key: ["route_code", "end_date"]
});

export const route_location = table({
  route_code: char(5),
  end_date: date,
  admin_area_code: char(3),
  nlc_code: char(4),
  crs_code: nullable(char(3)),
  incl_excl: char(1),
}, {
  key: ["route_code", "end_date", "admin_area_code", "nlc_code"]
});

export const supplement = table({
  supplement_code: char(3),
  end_date: date,
  start_date: date,
  quote_date: date,
  description: char(20),
  short_desc: char(12),
  suppl_type: char(3),
  price: integer(5),
  cpf_ticket_type: nullable(char(5)),
  min_group_size: integer(1),
  max_group_size: integer(1),
  per_leg_or_dir: char(1),
  class_type: char(1),
  capri_code: nullable(char(3)),
  sep_tkt_ind: char(1),
  resvn_type: char(2),
  sundry_code: nullable(char(5)),
}, {
  key: ["supplement_code", "end_date"]
});

export const supplement_rule = table({
  rule_number: integer(3),
  end_date: date,
  start_date: date,
  quote_date: date,
  train_uid: nullable(char(7)),
  train_uid_desc: nullable(char(39)),
  fare_class: char(1),
  quota: char(1),
  weekend_first: char(1),
  silver_standard: char(1),
  railcard: char(1),
  catering_code: char(1),
  sleeper: char(1),
  accom_class: char(1),
  status: char(1),
  reservation_status: nullable(char(3)),
  sectors: nullable(char(3)),
}, {
  key: ["rule_number", "end_date"]
});

export const supplement_rule_applies = table({
  rule_number: integer(3),
  end_date: date,
  ie_marker: char(1),
  condition_type: char(1),
  ie_code: char(3),
}, {
  key: ["rule_number", "end_date", "ie_marker", "condition_type", "ie_code"]
});

export const supplement_rule_supplement = table({
  rule_number: integer(3),
  end_date: date,
  supplement_code: char(3),
  om_flag: char(1),
}, {
  key: ["rule_number", "end_date", "supplement_code"]
});

export const supplement_override = table({
  supplement_code: char(3),
  end_date: date,
  overridden_supplement: char(3),
}, {
  key: ["supplement_code", "end_date", "overridden_supplement"]
});

export const advance_ticket = table({
  ticket_code: char(3),
  restriction_code: nullable(char(2)),
  restriction_flag: char(1),
  toc_id: nullable(char(2)),
  end_date: date,
  start_date: date,
  check_type: char(1),
  ap_data: char(8),
  booking_time: nullable(time),
}, {
  key: ["ticket_code", "restriction_code", "restriction_flag", "toc_id", "end_date"]
});

export const toc = table({
  toc_id: char(2),
  toc_name: char(30),
  active: boolean,
}, {
  key: ["toc_id"]
});

export const toc_fare = table({
  fare_toc_id: char(3),
  toc_id: nullable(char(2)),
  fare_toc_name: char(30),
}, {
  key: ["fare_toc_id", "toc_id"]
});

// package is a reserved word, so the table is declared under another name and keyed by its real one below
export const packageTable = table({
  package_code: char(3),
  end_date: date,
  start_date: date,
  quote_date: date,
  restriction_code: nullable(char(2)),
  origin_facilities: nullable(char(26)),
  destination_facilities: nullable(char(26)),
}, {
  key: ["package_code", "end_date"]
});

export const package_supplement = table({
  package_code: char(3),
  end_date: date,
  supplement_code: char(3),
  direction: char(1),
  pack_number: char(3),
  origin_facility: nullable(char(1)),
  dest_facility: nullable(char(1)),
}, {
  key: ["package_code", "end_date", "supplement_code"]
});

export const rover = table({
  rover_code: char(3),
  end_date: date,
  start_date: date,
  quote_date: date,
  description: char(30),
  ticket_desc: char(15),
  capri_ticket_code: nullable(char(3)),
  rover_accounting_code: char(4),
  days_travel: integer(3),
  months_valid: integer(2),
  days_valid: integer(2),
}, {
  key: ["rover_code", "end_date"]
});

export const rover_price = table({
  rover_code: char(3),
  end_date: date,
  railcard_code: char(3),
  rover_class: integer(1),
  adult_fare: nullable(integer(8)),
  child_fare: nullable(integer(8)),
  restriction_code: nullable(char(2)),
}, {
  key: ["rover_code", "end_date", "railcard_code", "rover_class"]
});

export const toc_specific_ticket = table({
  ticket_code: char(3),
  restriction_code: nullable(char(2)),
  restriction_flag: char(1),
  direction: char(1),
  toc_id: nullable(char(2)),
  toc_type: char(1),
  end_date: date,
  start_date: date,
  sleeper_mkr: boolean,
  inc_exc_stock: char(1),
  stock_list: nullable(char(40)),
}, {
  key: ["ticket_code", "restriction_code", "restriction_flag", "direction", "toc_id", "toc_type", "end_date"]
});

export const ticket_type = table({
  ticket_code: char(3),
  end_date: date,
  start_date: date,
  quote_date: date,
  description: char(15),
  tkt_class: integer(1),
  tkt_type: char(1),
  tkt_group: char(1),
  last_valid_day: date,
  max_passengers: integer(3),
  min_passengers: integer(3),
  max_adults: integer(3),
  min_adults: integer(3),
  max_children: integer(3),
  min_children: integer(3),
  restricted_by_date: boolean,
  restricted_by_train: boolean,
  restricted_by_area: boolean,
  validity_code: char(2),
  atb_description: char(20),
  lul_xlondon_issue: integer(1),
  reservation_required: char(1),
  capri_code: char(3),
  lul_93: nullable(boolean),
  uts_code: char(2),
  time_restriction: nullable(integer(1)),
  free_pass_lul: nullable(boolean),
  package_mkr: char(1),
  fare_multiplier: integer(3),
  discount_category: integer(2),
}, {
  key: ["ticket_code", "end_date"]
});

export const ticket_validity = table({
  validity_code: char(2),
  end_date: date,
  start_date: date,
  description: char(20),
  out_days: integer(2),
  out_months: integer(2),
  ret_days: integer(2),
  ret_months: integer(2),
  ret_after_days: integer(2),
  ret_after_months: integer(2),
  ret_after_day: nullable(char(2)),
  break_out: boolean,
  break_in: boolean,
  out_description: char(14),
  rtn_description: char(14),
}, {
  key: ["validity_code", "end_date"]
});

export default {
  status,
  status_discount,
  flow,
  fare,
  non_standard_discount,
  station_cluster,
  location,
  location_association,
  location_group,
  location_group_member,
  location_synonym,
  location_railcard,
  non_derivable_fare,
  non_derivable_fare_override,
  railcard_minimum_fare,
  railcard,
  restriction_date,
  restriction_header,
  restriction_header_date,
  restriction_time,
  restriction_time_date,
  restriction_time_toc,
  restriction_train,
  restriction_train_date,
  restriction_train_quota,
  restriction_railcard,
  restriction_exception,
  restriction_ticket_calendar,
  route,
  route_location,
  supplement,
  supplement_rule,
  supplement_rule_applies,
  supplement_rule_supplement,
  supplement_override,
  advance_ticket,
  toc,
  toc_fare,
  package: packageTable,
  package_supplement,
  rover,
  rover_price,
  toc_specific_ticket,
  ticket_type,
  ticket_validity
};
