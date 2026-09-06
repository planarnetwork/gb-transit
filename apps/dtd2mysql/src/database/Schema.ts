import {Generated} from "kysely";
import {FieldType} from "./SchemaDialect";

/**
 * The declared shape of a table.
 *
 * This is the source of truth for what the database holds. The feed definitions say where a value sits in
 * a record and how to read it, which is not something a schema can express, but they no longer decide what
 * the column is. A feed change that would not fit the column it writes to is a test failure rather than a
 * silent change to everyone's database, see the schema consistency test.
 */
export interface Table<C extends Columns = Columns> {
  readonly columns: C;
  // these name columns, which is enforced where a table is declared rather than here. Naming C in a
  // keyof would make Table invariant in it, and no declaration would be assignable to a plain Table
  readonly key: readonly string[];
  readonly indexes: readonly string[];
}

export interface Columns {
  readonly [name: string]: Column;
}

/**
 * A column, carrying the type it is read back as.
 *
 * The value is never present at runtime. It is here so that the TypeScript type of a table can be read
 * straight off its declaration rather than restated, see Database.
 */
export interface Column<T = unknown> {
  readonly type: FieldType;
  readonly nullable: boolean;
  readonly value: T;
}

/**
 * Every table gets the surrogate key the schema builder adds, plus a column per declaration
 */
export type Row<T> = T extends Table
  ? { id: Generated<number> } & { [K in keyof T["columns"]]: Value<T["columns"][K]> }
  : never;

type Value<C> = C extends Column<infer T> ? T : never;

/**
 * The value is a phantom, so it is the one thing here that has to be asserted rather than built
 */
function column<T>(type: FieldType): Column<T> {
  return { type, nullable: false } as Column<T>;
}

/** Fixed length text, blank padded and returned without the padding by MySQL */
export const char = (length: number): Column<string> =>
  column({ type: "text", length, variableLength: false });

/** Variable length text */
export const varchar = (length: number): Column<string> =>
  column({ type: "text", length, variableLength: true });

/** A whole number of up to the given number of digits */
export const integer = (length: number): Column<number> =>
  column({ type: "int", length });

/** A number with the given total digits and decimal places */
export const double = (length: number, decimalDigits: number): Column<number> =>
  column({ type: "double", length, decimalDigits });

/**
 * A signed number with no declared precision. No feed field parses to one, the fares and timetable values
 * all have a width the record gives them, but a coordinate does not and cannot be unsigned.
 */
export const float: Column<number> = column({ type: "float" });

/** The feed parses booleans to 1 and 0, so they are stored and returned as numbers */
export const boolean: Column<number> = column({ type: "boolean" });

/** Returned as a string so that reading a date does not depend on the reader's timezone */
export const date: Column<string> = column({ type: "date" });

export const time: Column<string> = column({ type: "time" });

/** The generated identifier of a row in another table, not a database level constraint */
export const foreignKey: Column<number> = column({ type: "foreignKey" });

export const nullable = <T>(value: Column<T>): Column<T | null> =>
  ({ ...value, nullable: true }) as Column<T | null>;

/**
 * Declare a table. The key and the indexes have to name columns that exist.
 */
export function table<C extends Columns>(
  columns: C,
  options: { key?: readonly (keyof C & string)[], indexes?: readonly (keyof C & string)[] } = {}
): Table<C> {
  return { columns, key: options.key ?? [], indexes: options.indexes ?? [] };
}

/**
 * The tables of a feed, keyed by table name
 */
export interface FeedSchema {
  readonly [table: string]: Table;
}
