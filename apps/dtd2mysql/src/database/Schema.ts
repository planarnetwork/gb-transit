import {Generated} from "kysely";
import {ColumnType, FieldType} from "./SchemaDialect";

/**
 * The declared shape of a table.
 *
 * This is the source of truth for what the database holds. The feed definitions say where a value sits in
 * a record and how to read it, which is not something a schema can express, but they do not decide what
 * the column is. A feed change that would not fit the column it writes to is a test failure rather than a
 * silent change to everyone's database, see the schema consistency test.
 */
export interface Table<C extends Columns = Columns, I extends boolean = boolean> {
  readonly columns: C;
  // these name columns, which is enforced where a table is declared rather than here. Naming C in a
  // keyof would make Table invariant in it, and no declaration would be assignable to a plain Table
  readonly key: readonly string[];
  readonly indexes: readonly string[];
  /**
   * Whether the schema builder adds the generated id every imported table is keyed by. A table worked
   * out from a feed rather than imported from one may have had no surrogate key before this described
   * it, and adding one shifts every column of a SELECT *.
   */
  readonly generatedId: I;
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
export interface Column<T = unknown> extends ColumnType {
  readonly nullable: boolean;
  /**
   * What the database stores where the column is left out of an insert. A column with no default and
   * no null is a column every insert has to name.
   */
  readonly default?: string | number;
  readonly value: T;
}

/**
 * A table gets the surrogate key the schema builder adds, unless it is declared without one, plus a
 * column per declaration
 */
export type Row<T> = T extends Table<infer C, infer I>
  ? GeneratedId<I> & { [K in keyof C]: Value<C[K]> }
  : never;

// unknown rather than an empty object, which intersects away to nothing
type GeneratedId<I extends boolean> = I extends false ? unknown : { id: Generated<number> };

type Value<C> = C extends Column<infer T> ? T : never;

/**
 * The value is a phantom, so it is the one thing here that has to be asserted rather than built
 */
function column<T>(type: FieldType): Column<T> {
  return { type, nullable: false, ascii: false } as Column<T>;
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
 * An exact number with the given total digits and decimal places, signed.
 *
 * Unlike double, what is written is what is stored: a value written to six places reads back as those
 * six places rather than the nearest double to them. Both MySQL and Postgres return it as a string to
 * keep it exact, so it is read as one.
 */
export const decimal = (length: number, decimalDigits: number): Column<string> =>
  column({ type: "decimal", length, decimalDigits });

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
 * An identifier rather than prose: ASCII, and compared byte for byte.
 *
 * Case is the reason. A trip id is composed from a TUID and two dates, and MySQL's default collation
 * would make G38968_20261018 and g38968_20261018 the same value - so a primary key holding both would
 * reject the second, and a join on one would match the other. It is also the faster comparison, which
 * matters where the id is in the key and three more indexes.
 */
export const ascii = <T>(value: Column<T>): Column<T> => ({ ...value, ascii: true });

/**
 * What the database stores where an insert leaves the column out
 */
export const defaultTo = <T extends string | number>(value: Column<T>, fallback: T): Column<T> =>
  ({ ...value, default: fallback });

/**
 * Declare a table. The key and the indexes have to name columns that exist.
 */
export function table<C extends Columns, I extends boolean = true>(
  columns: C,
  options: {
    key?: readonly (keyof C & string)[],
    indexes?: readonly (keyof C & string)[],
    generatedId?: I
  } = {}
): Table<C, I> {
  return {
    columns,
    key: options.key ?? [],
    indexes: options.indexes ?? [],
    generatedId: options.generatedId ?? true as I
  };
}

/**
 * The tables of a feed, keyed by table name
 */
export interface FeedSchema {
  readonly [table: string]: Table;
}
