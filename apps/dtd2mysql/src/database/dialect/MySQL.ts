import {CreateTableBuilder, Expression, sql} from "kysely";
import {FieldType, getErrorNumber, SchemaDialect} from "../SchemaDialect";

const ER_DUP_KEYNAME = 1061;

export const mysqlSchemaDialect: SchemaDialect = {

  name: "mysql",

  columnType(field: FieldType): Expression<unknown> {
    switch (field.type) {
      case "text": return sql.raw(field.variableLength ? `varchar(${field.length})` : `char(${field.length})`);
      case "boolean": return sql.raw("tinyint(1) unsigned");
      case "date": return sql.raw("date");
      case "time": return sql.raw("time");
      case "double": return sql.raw(`double(${field.length}, ${field.decimalDigits}) unsigned`);
      case "float": return sql.raw("double");
      case "int": return sql.raw(`${intType(field.length)}(${field.length}) unsigned`);
      case "foreignKey": return sql.raw("int(11) unsigned");
    }
  },

  addIdColumn<TB extends string, C extends string>(table: CreateTableBuilder<TB, C>): CreateTableBuilder<TB, C | "id"> {
    return table.addColumn("id", sql.raw("int(11) unsigned"), col => col.notNull().autoIncrement().primaryKey());
  },

  isDuplicateIndex(error: unknown): boolean {
    return getErrorNumber(error) === ER_DUP_KEYNAME;
  }

};

/**
 * MySQL has a type for every size of integer, use the smallest one that fits
 */
function intType(length: number): string {
  if (length > 9) return "bigint";
  if (length > 7) return "int";
  if (length > 4) return "mediumint";
  if (length > 2) return "smallint";

  return "tinyint";
}
