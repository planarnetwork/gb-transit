import {CreateTableBuilder, Expression} from "kysely";
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
  VariableLengthText,
  ZeroFillIntField
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
  | { type: "double", length: number, decimalDigits: number }
  | { type: "float" }
  | { type: "int", length: number }
  | { type: "foreignKey" };

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
   * The column type used to store the given field
   */
  columnType(field: FieldType): Expression<unknown>;

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
  if (field instanceof TextField)          return { type: "text", length: field.length, variableLength: false };
  if (field instanceof BooleanField)       return { type: "boolean" };
  if (field instanceof ShortDateField)     return { type: "date" };
  if (field instanceof DateField)          return { type: "date" };
  if (field instanceof NullDateField)      return { type: "date" };
  if (field instanceof TimeField)          return { type: "time" };
  if (field instanceof DoubleField)        return { type: "double", length: field.length, decimalDigits: field.decimalDigits };
  // zero filled ints are parsed as padded strings so they are stored as text
  if (field instanceof ZeroFillIntField)   return { type: "text", length: field.length, variableLength: false };
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
