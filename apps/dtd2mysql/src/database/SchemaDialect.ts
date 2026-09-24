import {ColumnDefinitionBuilder, CreateTableBuilder, Expression} from "kysely";
import {
  BooleanField,
  DateField,
  DoubleField,
  Field,
  ForeignKeyField,
  IntField,
  NullDateField,
  ShortDateField,
  TextField,
  TimeField,
  VariableLengthText
} from "@gb-transit/feed-parser";

export type DialectName = "mysql" | "postgres" | "sqlite";

export const dialectNames: DialectName[] = ["mysql", "postgres", "sqlite"];

/**
 * A feed field as the database layer sees it, without any of the parsing behaviour
 */
export type FieldType =
  | { type: "text", length: number, variableLength: boolean }
  | { type: "boolean" }
  | { type: "date" }
  | { type: "time" }
  | { type: "serviceTime" }
  | { type: "double", length: number, decimalDigits: number }
  | { type: "decimal", length: number, decimalDigits: number }
  | { type: "float" }
  | { type: "int", length: number }
  | { type: "foreignKey" };

/**
 * A column as the schema layer sees it: what it holds, and how the database is to compare it.
 *
 * Declared here rather than beside the rest of a column so that a dialect can be written against it
 * without the declarations having to know a dialect exists.
 */
export interface ColumnType {
  readonly type: FieldType;
  /**
   * The value is ASCII and is to be compared byte for byte, case included.
   *
   * Only MySQL has an opinion: its default collation is case insensitive, which makes two ids that
   * differ only in case the same id. SQLite compares byte for byte already and Postgres compares
   * varchar exactly, so both ignore this.
   */
  readonly ascii: boolean;
}

/**
 * The schema vocabulary of a database.
 *
 * Kysely's Dialect decides how to talk to a database - the driver, the placeholder style and identifier
 * quoting. It passes column types straight through to the compiler, so something has to decide that a
 * DoubleField is stored as an unsigned double in MySQL and as a numeric in Postgres. That is this.
 */
export interface SchemaDialect {

  readonly name: DialectName;

  /**
   * The column type used to store the given column
   */
  columnType(column: ColumnType): Expression<unknown>;

  /**
   * Whatever the database needs said about the table rather than its columns
   */
  tableOptions<TB extends string, C extends string>(table: CreateTableBuilder<TB, C>): CreateTableBuilder<TB, C>;

  /**
   * Whatever the database has to be told to enforce that its column types do not say on their own
   */
  columnConstraints(builder: ColumnDefinitionBuilder, name: string, column: ColumnType): ColumnDefinitionBuilder;

  /**
   * Add the auto incrementing surrogate primary key to the table
   */
  addIdColumn<TB extends string, C extends string>(table: CreateTableBuilder<TB, C>): CreateTableBuilder<TB, C | "id">;

  /**
   * True if the error is caused by creating an index that already exists
   */
  isDuplicateIndex(error: unknown): boolean;

}

/**
 * Reduce a feed field to the type information the database layer needs.
 *
 * The order of these checks matters, the field classes are a hierarchy.
 */
export function getFieldType(field: Field): FieldType {
  if (field instanceof VariableLengthText) return { type: "text", length: field.length, variableLength: true };
  // ZeroFillIntField is a TextField, as a zero filled int is stored as the padded text
  if (field instanceof TextField)          return { type: "text", length: field.length, variableLength: false };
  if (field instanceof BooleanField)       return { type: "boolean" };
  if (field instanceof ShortDateField)     return { type: "date" };
  if (field instanceof DateField)          return { type: "date" };
  if (field instanceof NullDateField)      return { type: "date" };
  if (field instanceof TimeField)          return { type: "time" };
  if (field instanceof DoubleField)        return { type: "double", length: field.length, decimalDigits: field.decimalDigits };
  if (field instanceof IntField)           return { type: "int", length: field.length };
  if (field instanceof ForeignKeyField)    return { type: "foreignKey" };

  throw new Error("Unknown field type");
}

/**
 * Return the driver specific error number, if the error has one
 */
export function getErrorNumber(error: unknown): number | undefined {
  return error instanceof Error && "errno" in error && typeof error.errno === "number" ? error.errno : undefined;
}

/**
 * Return the SQLSTATE code, if the error has one
 */
export function getErrorCode(error: unknown): string | undefined {
  return error instanceof Error && "code" in error && typeof error.code === "string" ? error.code : undefined;
}

/**
 * Return SQLite's own result code, if the error has one.
 *
 * node:sqlite puts it in errcode and leaves errno undefined, where the two server drivers do the
 * opposite, so an error from it is invisible to the other two readers above.
 */
export function getSqliteCode(error: unknown): number | undefined {
  return error instanceof Error && "errcode" in error && typeof error.errcode === "number" ? error.errcode : undefined;
}

const MYSQL_DEADLOCK = 1213;
const MYSQL_LOCK_WAIT_TIMEOUT = 1205;
const POSTGRES_DEADLOCK = "40P01";
const SQLITE_BUSY = 5;
const SQLITE_LOCKED = 6;

/**
 * True if the error is contention rather than anything wrong with the rows: another writer holding
 * what this one wants, which is worth waiting out. Each database says so in its own vocabulary.
 */
export function isLockError(error: unknown): boolean {
  const errno = getErrorNumber(error);
  const sqlite = getSqliteCode(error);

  return errno === MYSQL_DEADLOCK
    || errno === MYSQL_LOCK_WAIT_TIMEOUT
    || getErrorCode(error) === POSTGRES_DEADLOCK
    || sqlite === SQLITE_BUSY
    || sqlite === SQLITE_LOCKED;
}
