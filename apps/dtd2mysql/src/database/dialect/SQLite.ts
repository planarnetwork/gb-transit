import {CreateTableBuilder, Expression, sql} from "kysely";
import {FieldType, SchemaDialect} from "../SchemaDialect";

export const sqliteSchemaDialect: SchemaDialect = {

  name: "sqlite",

  /**
   * SQLite only has storage classes, the declared type just sets the column affinity. Dates and times are stored
   * as ISO strings, which is the representation the rest of the code already expects.
   */
  columnType(field: FieldType): Expression<unknown> {
    switch (field.type) {
      case "text": return sql.raw("text");
      case "date": return sql.raw("text");
      case "time": return sql.raw("text");
      case "boolean": return sql.raw("integer");
      case "int": return sql.raw("integer");
      case "foreignKey": return sql.raw("integer");
      case "double": return sql.raw("numeric");
      case "float": return sql.raw("real");
    }
  },

  addIdColumn<TB extends string, C extends string>(table: CreateTableBuilder<TB, C>): CreateTableBuilder<TB, C | "id"> {
    return table.addColumn("id", "integer", col => col.primaryKey().autoIncrement());
  },

  isDuplicateIndex(error: unknown): boolean {
    return error instanceof Error && /index .* already exists/i.test(error.message);
  }

};
