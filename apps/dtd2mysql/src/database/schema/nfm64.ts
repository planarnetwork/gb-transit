import {char, integer, table} from "../Schema";

/**
 * The nfm64 tables.
 *
 * This is what the database holds. The feed definitions in the sibling folders say where each value sits
 * in a record and how to read it, and are checked against these columns, see the schema consistency test.
 * Every table also gets the generated id column that the schema builder adds.
 */
export const nfm64 = table({
  origin: char(4),
  destination: char(4),
  route_code: char(5),
  ticket_code: char(3),
  price: integer(6),
}, {
  key: ["origin", "destination", "route_code", "ticket_code"]
});

export default {
  nfm64
};
