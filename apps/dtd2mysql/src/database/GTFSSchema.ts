import {Columns, Table} from "./Schema";

/**
 * The GTFS tables.
 *
 * These are not feed tables. Nothing parses a record into them, they hold a GTFS file as it was written,
 * so they are keyed the way the GTFS specification keys them rather than by a generated id.
 */
export interface GTFSSchema {
  readonly [table: string]: Table;
}

/**
 * Declare a GTFS table. The primary key and the indexes have to name columns that exist.
 */
export function gtfsTable<C extends Columns>(
  columns: C,
  options: { primaryKey?: readonly (keyof C & string)[], indexes?: readonly (keyof C & string)[] } = {}
): Table<C, false> {
  return {
    columns,
    key: [],
    primaryKey: options.primaryKey ?? [],
    indexes: options.indexes ?? [],
    generatedId: false
  };
}
