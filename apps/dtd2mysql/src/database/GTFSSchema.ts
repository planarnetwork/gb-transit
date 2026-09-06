import {CreateTableBuilder, Kysely} from "kysely";
import {Columns} from "./Schema";
import {SchemaDialect} from "./SchemaDialect";

/**
 * The declared shape of one of the GTFS tables.
 *
 * These are not feed tables. Nothing parses a record into them, they hold a GTFS file as it was written,
 * so they are keyed the way the GTFS specification keys them rather than by a generated id.
 */
export interface GTFSTable<C extends Columns = Columns> {
  readonly columns: C;
  // these name columns, which is enforced where a table is declared rather than here, see Table
  readonly primaryKey: readonly string[];
  readonly indexes: readonly string[];
}

export interface GTFSSchema {
  readonly [table: string]: GTFSTable;
}

/**
 * Declare a GTFS table. The primary key and the indexes have to name columns that exist.
 */
export function gtfsTable<C extends Columns>(
  columns: C,
  options: { primaryKey?: readonly (keyof C & string)[], indexes?: readonly (keyof C & string)[] } = {}
): GTFSTable<C> {
  return { columns, primaryKey: options.primaryKey ?? [], indexes: options.indexes ?? [] };
}

/**
 * Creates and drops a GTFS table in whichever database the dialect describes.
 *
 * This is the sibling of SchemaBuilder for tables that are loaded from a GTFS file rather than imported
 * from a feed: no generated id, and the key the specification gives is the primary key rather than a
 * unique constraint alongside one.
 */
export class GTFSSchemaBuilder {

  constructor(
    private readonly db: Kysely<any>,
    private readonly dialect: SchemaDialect,
    private readonly name: string,
    private readonly table: GTFSTable
  ) {}

  /**
   * Drop whatever is there and create the table and its indexes.
   *
   * The tables are a copy of the files being loaded rather than something added to, so they are replaced
   * outright. That is what the TRUNCATE before each load used to say.
   */
  public async createSchema(): Promise<void> {
    await this.dropSchema();

    // the column names are known to the declaration but not to the builder's own types
    let table: CreateTableBuilder<string, string> = this.db.schema.createTable(this.name);

    for (const [name, column] of Object.entries(this.table.columns)) {
      const type = this.dialect.columnType(column.type);

      table = table.addColumn(name, type, builder => column.nullable ? builder : builder.notNull());
    }

    if (this.table.primaryKey.length > 0) {
      table = table.addPrimaryKeyConstraint(`${this.name}_pk`, [...this.table.primaryKey]);
    }

    await table.execute();

    for (const index of this.table.indexes) {
      await this.createIndex(index);
    }
  }

  public async dropSchema(): Promise<void> {
    await this.db.schema.dropTable(this.name).ifExists().execute();
  }

  /**
   * Index names are unique per database in Postgres and SQLite so they are qualified with the table name
   */
  private async createIndex(column: string): Promise<void> {
    await this.db.schema
      .createIndex(`${this.name}_${column}_idx`)
      .on(this.name)
      .column(column)
      .execute();
  }

}
