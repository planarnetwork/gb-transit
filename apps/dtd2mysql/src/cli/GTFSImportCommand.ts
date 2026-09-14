
import * as fs from "fs";
import * as path from "path";
import {Kysely} from "kysely";
import {CLICommand} from "./CLICommand";
import {GTFSSchema, GTFSSchemaBuilder, GTFSTable} from "../database/GTFSSchema";
import {SchemaDialect} from "../database/SchemaDialect";
import {Column} from "../database/Schema";
import {chunks} from "../database/parameters";
import {CSVRow, readCSV} from "../gtfs/CSVReader";

/**
 * GTFS writes a date as YYYYMMDD. The fixed link columns in transfers.txt take theirs from a date column
 * instead, so they arrive as YYYY-MM-DD. The two are made to agree rather than left to the database.
 */
const YYYYMMDD = /^(\d{4})(\d{2})(\d{2})$/;

/**
 * How many rows are held before they are written
 */
const FLUSH_LIMIT = 5000;

/**
 * Load the GTFS files back into the database.
 *
 * This used to shell out to the mysql client with LOAD DATA LOCAL INFILE, which meant a MySQL server, the
 * mysql binary on the path, the password on a command line and a mapping between file and column that had
 * drifted from what the output writes. The files are read here instead, so the same command works against
 * all three databases.
 */
export class GTFSImportCommand implements CLICommand {

  constructor(
    private readonly db: Kysely<any>,
    private readonly schemaDialect: SchemaDialect,
    private readonly schema: GTFSSchema
  ) { }

  public async run(argv: string[]): Promise<void> {
    await this.doImport(argv[3] || "./");

    return this.end();
  }

  /**
   * Replace each table and load the file of the same name into it
   */
  public async doImport(directory: string): Promise<void> {
    for (const [name, table] of Object.entries(this.schema)) {
      await new GTFSSchemaBuilder(this.db, this.schemaDialect, name, table).createSchema();
      await this.load(directory, name, table);
    }
  }

  private async load(directory: string, name: string, table: GTFSTable): Promise<void> {
    const filename = path.join(directory, `${name}.txt`);

    if (!fs.existsSync(filename)) {
      console.log(`No ${name}.txt to load`);

      return;
    }

    let rows: object[] = [];
    let loaded = 0;

    for await (const row of readCSV(filename)) {
      rows.push(this.values(name, table, row));

      if (rows.length >= FLUSH_LIMIT) {
        await this.insert(name, rows);

        loaded += rows.length;
        rows = [];
      }
    }

    if (rows.length > 0) {
      await this.insert(name, rows);

      loaded += rows.length;
    }

    console.log(`Loaded ${loaded} rows into ${name}`);
  }

  /**
   * Read each value as the column it is going into. A column the table does not have is a file and a
   * declaration that have drifted apart, which is worth stopping for rather than dropping the value.
   */
  private values(name: string, table: GTFSTable, row: CSVRow): object {
    const values: { [column: string]: unknown } = {};

    for (const [column, text] of Object.entries(row)) {
      const declared = table.columns[column];

      if (!declared) {
        throw new Error(`${name}.txt has a ${column} column, which ${name} does not.`);
      }

      values[column] = value(declared, text);
    }

    return values;
  }

  private async insert(name: string, rows: object[]): Promise<void> {
    for (const chunk of chunks(rows, Object.keys(rows[0]).length)) {
      await this.db.insertInto(name).values(chunk).execute();
    }
  }

  /**
   * Close the underlying database connection
   */
  public async end(): Promise<void> {
    await this.db.destroy();
  }

}

/**
 * A CSV file is all text, so each value is read as whatever its column holds. An empty value is nothing
 * at all rather than a zero or a blank date.
 */
function value(column: Column, text: string): string | number | null {
  switch (column.type.type) {
    case "int":
    case "boolean":
    case "double":
    case "float":
    case "foreignKey":
      return text === "" ? null : Number(text);

    case "date":
      return text === "" ? null : toISODate(text);

    default:
      return text === "" && column.nullable ? null : text;
  }
}

function toISODate(text: string): string {
  const match = YYYYMMDD.exec(text);

  return match ? `${match[1]}-${match[2]}-${match[3]}` : text;
}
