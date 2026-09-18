import {CreateTableBuilder, Expression, sql} from "kysely";
import {ColumnType, FieldType, getErrorNumber, SchemaDialect} from "../SchemaDialect";

const ER_DUP_KEYNAME = 1061;

export const mysqlSchemaDialect: SchemaDialect = {

  name: "mysql",

  columnType(column: ColumnType): Expression<unknown> {
    return sql.raw(storageType(column.type) + collation(column));
  },

  /**
   * The engine and the character set, which a server's defaults would otherwise decide.
   *
   * InnoDB because the writer needs its transactions: a flush is delete then insert, and on MyISAM or
   * Aria a failed insert leaves the delete done. utf8mb4 because a station name is not ASCII and a
   * latin1 default would store it mangled.
   */
  tableOptions<TB extends string, C extends string>(table: CreateTableBuilder<TB, C>): CreateTableBuilder<TB, C> {
    return table.modifyEnd(sql.raw("engine=InnoDB default charset=utf8mb4"));
  },

  addIdColumn<TB extends string, C extends string>(table: CreateTableBuilder<TB, C>): CreateTableBuilder<TB, C | "id"> {
    return table.addColumn("id", sql.raw("int(11) unsigned"), col => col.notNull().autoIncrement().primaryKey());
  },

  isDuplicateIndex(error: unknown): boolean {
    return getErrorNumber(error) === ER_DUP_KEYNAME;
  }

};

/**
 * An ASCII column is stored and compared as ASCII: the server's default collation is case insensitive,
 * where these values are ids that differ by case.
 */
function collation(column: ColumnType): string {
  return column.ascii && column.type.type === "text" ? " character set ascii collate ascii_bin" : "";
}

function storageType(field: FieldType): string {
  switch (field.type) {
    case "text": return field.variableLength ? `varchar(${field.length})` : `char(${field.length})`;
    case "boolean": return "tinyint(1) unsigned";
    case "date": return "date";
    case "time": return "time";
    case "double": return `double(${field.length}, ${field.decimalDigits}) unsigned`;
    // signed, unlike the other numbers here: a decimal holds a coordinate
    case "decimal": return `decimal(${field.length}, ${field.decimalDigits})`;
    case "float": return "double";
    case "int": return `${intType(field.length)}(${field.length}) unsigned`;
    case "foreignKey": return "int(11) unsigned";
  }
}

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
