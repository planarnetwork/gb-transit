import {ColumnDefinitionBuilder, CreateTableBuilder, Expression, sql} from "kysely";
import {ColumnType, FieldType, SchemaDialect} from "../SchemaDialect";

export const sqliteSchemaDialect: SchemaDialect = {

  name: "sqlite",

  /**
   * SQLite only has storage classes, the declared type just sets the column affinity. Dates and times are stored
   * as ISO strings, which is the representation the rest of the code already expects.
   *
   * A width is declared even though nothing enforces it, so that the column says what it holds to
   * anything reading the schema back. Comparison is byte for byte whatever is written here, which is
   * what an ascii column asks for.
   */
  columnType({ type: field }: ColumnType): Expression<unknown> {
    switch (field.type) {
      case "text": return sql.raw(field.variableLength ? `varchar(${field.length})` : `char(${field.length})`);
      case "date": return sql.raw("text");
      case "time": return sql.raw("text");
      case "boolean": return sql.raw("integer");
      case "int": return sql.raw("integer");
      case "foreignKey": return sql.raw("integer");
      case "double": return sql.raw("numeric");
      // text, not numeric: numeric affinity converts the value it is given to a real, which is the one
      // thing a decimal is for not doing. Stored as the digits it was written as, and read back as them.
      case "decimal": return sql.raw("text");
      case "float": return sql.raw("real");
    }
  },

  // no engines, and text is whatever encoding the database was created with
  tableOptions<TB extends string, C extends string>(table: CreateTableBuilder<TB, C>): CreateTableBuilder<TB, C> {
    return table;
  },

  /**
   * SQLite stores a value of any length in a column of any width, so a row the other two databases
   * refuse is stored here in full and the three disagree about what was imported. The width is the
   * declaration's, and a value that does not fit it is worth the same error everywhere, so it is
   * asked for as a constraint - the one thing SQLite does enforce.
   */
  columnConstraints(builder: ColumnDefinitionBuilder, name: string, column: ColumnType): ColumnDefinitionBuilder {
    if (column.type.type !== "text") {
      return builder;
    }

    const width = column.type.length;

    return builder.check(sql`length(${sql.ref(name)}) <= ${sql.lit(width)}`);
  },

  addIdColumn<TB extends string, C extends string>(table: CreateTableBuilder<TB, C>): CreateTableBuilder<TB, C | "id"> {
    return table.addColumn("id", "integer", col => col.primaryKey().autoIncrement());
  },

  isDuplicateIndex(error: unknown): boolean {
    return error instanceof Error && /index .* already exists/i.test(error.message);
  }

};
