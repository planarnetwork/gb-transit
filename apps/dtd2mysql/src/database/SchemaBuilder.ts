import {CreateTableBuilder, Kysely, sql} from "kysely";
import {Database} from "./Database";
import {SchemaDialect} from "./SchemaDialect";
import {Table} from "./Schema";

export const LOG_TABLE = "log";

/**
 * Creates and drops a declared table in whichever database the dialect describes
 */
export class SchemaBuilder {

  constructor(
    private readonly db: Kysely<Database>,
    private readonly dialect: SchemaDialect,
    private readonly name: string,
    private readonly table: Table
  ) {}

  /**
   * Create the table and its indexes
   */
  public async createSchema(): Promise<void> {
    // the column names are known to the declaration but not to the builder's own types
    let table: CreateTableBuilder<string, string> =
      this.dialect.addIdColumn(this.db.schema.createTable(this.name).ifNotExists());

    for (const [name, column] of Object.entries(this.table.columns)) {
      const type = this.dialect.columnType(column.type);

      table = table.addColumn(name, type, builder => column.nullable ? builder : builder.notNull());
    }

    if (this.table.key.length > 0) {
      table = table.addUniqueConstraint(`${this.name}_key`, [...this.table.key]);
    }

    await table.execute();

    for (const index of this.table.indexes) {
      await this.createIndex(index);
    }
  }

  /**
   * Drop the table, taking its indexes with it
   */
  public async dropSchema(): Promise<void> {
    await this.db.schema.dropTable(this.name).ifExists().execute();
  }

  /**
   * Index names are unique per database in Postgres and SQLite so they are qualified with the table name.
   *
   * MySQL has no IF NOT EXISTS for indexes, so a duplicate is caught rather than avoided.
   */
  private async createIndex(column: string): Promise<void> {
    try {
      await this.db.schema
        .createIndex(`${this.name}_${column}_idx`)
        .on(this.name)
        .column(column)
        .execute();
    }
    catch (err) {
      if (!this.dialect.isDuplicateIndex(err)) {
        throw err;
      }
    }
  }

}

/**
 * Create the table that records which feed files have been processed
 */
export async function createLogSchema(db: Kysely<Database>, dialect: SchemaDialect): Promise<void> {
  await dialect
    .addIdColumn(db.schema.createTable(LOG_TABLE).ifNotExists())
    .addColumn("filename", sql.raw("varchar(255)"))
    .addColumn("processed", timestampType(dialect))
    .execute();
}

function timestampType(dialect: SchemaDialect) {
  switch (dialect.name) {
    case "mysql": return sql.raw("datetime");
    case "postgres": return sql.raw("timestamp");
    case "sqlite": return sql.raw("text");
  }
}
