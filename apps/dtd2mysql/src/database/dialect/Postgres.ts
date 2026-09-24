import {ColumnDefinitionBuilder, CreateTableBuilder, Expression, sql} from "kysely";
import {ColumnType, FieldType, getErrorCode, SchemaDialect} from "../SchemaDialect";

const DUPLICATE_TABLE = "42P07";

/**
 * Postgres returns date and timestamp columns as Date objects built in the local timezone, which is exactly
 * what dateStrings: true avoids on MySQL. Wiring the pg driver will need type parsers that leave them as
 * strings, otherwise reading a date back depends on the timezone of the machine reading it:
 *
 *   pg.types.setTypeParser(1082, value => value) // date
 *   pg.types.setTypeParser(1114, value => value) // timestamp
 */
export const postgresSchemaDialect: SchemaDialect = {

  name: "postgres",

  // varchar comparison is already exact, so an ascii column needs nothing said about it here
  columnType({ type: field }: ColumnType): Expression<unknown> {
    switch (field.type) {
      // character(n) pads a value back out to the width of the column when it is read, where MySQL
      // strips the padding instead. varchar returns exactly what was stored, which is what agrees.
      case "text": return sql.raw(`varchar(${field.length})`);
      // the feed parses booleans to 1 and 0, storing them as a number keeps that representation
      case "boolean": return sql.raw("smallint");
      case "date": return sql.raw("date");
      case "time": return sql.raw("time");
      case "serviceTime": return sql.raw("varchar(8)");
      // numeric would be returned as a string by pg, double precision matches both MySQL and the parsed field
      case "double": return sql.raw("double precision");
      // numeric is returned as a string by pg, which is what an exact value has to be to stay exact
      case "decimal": return sql.raw(`numeric(${field.length}, ${field.decimalDigits})`);
      case "float": return sql.raw("double precision");
      case "int": return sql.raw(intType(field.length));
      case "foreignKey": return sql.raw("integer");
    }
  },

  // there is one engine and one encoding, both the database's
  tableOptions<TB extends string, C extends string>(table: CreateTableBuilder<TB, C>): CreateTableBuilder<TB, C> {
    return table;
  },

  // varchar(n) is enforced, so there is nothing left to say
  columnConstraints(builder: ColumnDefinitionBuilder): ColumnDefinitionBuilder {
    return builder;
  },

  addIdColumn<TB extends string, C extends string>(table: CreateTableBuilder<TB, C>): CreateTableBuilder<TB, C | "id"> {
    return table.addColumn("id", "serial", col => col.primaryKey());
  },

  isDuplicateIndex(error: unknown): boolean {
    return getErrorCode(error) === DUPLICATE_TABLE;
  }

};

/**
 * Postgres has no unsigned types and no display widths, so the type is chosen purely on the range of values
 * the field can hold.
 */
function intType(length: number): string {
  if (length > 9) return "bigint";
  if (length > 4) return "integer";

  return "smallint";
}
