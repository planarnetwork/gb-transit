import {Generated, Kysely} from "kysely";
import schema from "./schema";
import fares from "./schema/fares";
import {Row} from "./Schema";

/**
 * The database as Kysely sees it, read straight off the schema declarations in ./schema.
 *
 * Those declarations are the source of truth. Change a column there and both the table the importer
 * builds and the type queries are checked against move together.
 */
export type Database = Tables & { log: Log };

/**
 * The table recording which feed files have been processed, see createLogSchema
 */
export interface Log {
  id: Generated<number>;
  filename: string | null;
  processed: string | null;
}

type Schemas = typeof schema;

/**
 * Every table of every feed, as a union of name and declaration pairs, so that the tables can be keyed
 * by name rather than by the feed they came from
 */
type Entry = {
  [F in keyof Schemas]: {
    [T in keyof Schemas[F]]: { name: T & string, table: Schemas[F][T] }
  }[keyof Schemas[F]]
}[keyof Schemas];

/**
 * A table defined by more than one feed, currently only location, comes out as a union of its shapes
 * rather than a single merged one. Reading a column that only one of them has will not compile, which is
 * the intended prompt to make them agree.
 */
type Tables = { [N in Entry["name"]]: Row<Extract<Entry, { name: N }>["table"]> };

/**
 * The database as a command that only deals with the fares feed sees it.
 *
 * Because location is a union, neither feed's columns can be named through it, and the fares clean up
 * needs the fares ones. Narrowing to a single feed's declaration is the alternative to naming those
 * columns in raw SQL, and the declaration is still what says what they are.
 */
export type FaresDatabase = Omit<Database, "location"> & { location: Row<typeof fares.location> };

/**
 * Read the same connection as a fares one. The two types describe the same tables, they disagree only on
 * which of the two location declarations is in view, so nothing about the connection changes.
 */
export function asFaresDatabase(db: Kysely<Database>): Kysely<FaresDatabase> {
  return db as unknown as Kysely<FaresDatabase>;
}
