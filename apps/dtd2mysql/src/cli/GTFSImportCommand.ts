
import * as fs from "fs";
import * as path from "path";
import {Kysely} from "kysely";
import {CSVParser, Row} from "@gb-transit/gtfs-loader";
import {CLICommand} from "./CLICommand";
import {GTFSSchema, GTFSSchemaBuilder, GTFSTable} from "../database/GTFSSchema";
import {SchemaDialect} from "../database/SchemaDialect";
import {Column} from "../database/Schema";
import {chunks} from "../database/parameters";

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
 * The files are read here and written through the query builder, so the same command works against all
 * three databases and needs no database client on the path. A column is matched by the name in the file's
 * header, so the mapping cannot drift from what the output writes.
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

  /**
   * One transaction per file.
   *
   * The table was dropped and recreated a moment ago, so a failure part way through the load leaves
   * it holding part of a file and nothing saying which part. Either the file is in the table or the
   * table is as empty as it was. It is a little quicker as well - 500,000 rows in 9.6s rather than
   * 10.3s - but that is not the reason.
   */
  private async load(directory: string, name: string, table: GTFSTable): Promise<void> {
    const filename = path.join(directory, `${name}.txt`);

    if (!fs.existsSync(filename)) {
      console.log(`No ${name}.txt to load`);

      return;
    }

    const loaded = await this.db
      .transaction()
      .execute(transaction => this.write(transaction, filename, name, table))
      .catch(err => {
        throw new Error(`${name}.txt: ${err.message}`, { cause: err });
      });

    console.log(`Loaded ${loaded} rows into ${name}`);
  }

  /**
   * Write the rows of the file to the table, returning how many there were
   */
  private async write(db: Kysely<any>, filename: string, name: string, table: GTFSTable): Promise<number> {
    let rows: object[] = [];
    let header: readonly string[] | undefined;
    let written = 0;

    // a row that does not have the header's columns is a file that is not what it says it is
    const parser: CSVParser = new CSVParser(
      Object.keys(table.columns),
      row => {
        header ??= this.checkHeader(name, table, parser.header!);
        rows.push(values(table, header, row));
      },
      { strict: true }
    );

    for await (const chunk of fs.createReadStream(filename, "utf8")) {
      parser.write(chunk);

      if (rows.length >= FLUSH_LIMIT) {
        await this.insert(db, name, rows);

        written += rows.length;
        rows = [];
      }
    }

    parser.end();

    if (rows.length > 0) {
      await this.insert(db, name, rows);

      written += rows.length;
    }

    return written;
  }

  /**
   * The columns the file has. One the table does not have is a file and a declaration that have drifted
   * apart, which is worth stopping for rather than dropping the value.
   */
  private checkHeader(name: string, table: GTFSTable, header: readonly string[]): readonly string[] {
    for (const column of header) {
      if (!table.columns[column]) {
        throw new Error(`a ${column} column, which the ${name} table does not have`);
      }
    }

    return header;
  }

  private async insert(db: Kysely<any>, name: string, rows: object[]): Promise<void> {
    for (const chunk of chunks(rows, Object.keys(rows[0]).length)) {
      await db.insertInto(name).values(chunk).execute();
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
 * Read each value the file has as the column it is going into. A column the file leaves out is left out
 * of the row as well, so the database gives it its default.
 */
function values(table: GTFSTable, header: readonly string[], row: Row): object {
  const values: { [column: string]: unknown } = {};

  for (const column of header) {
    values[column] = value(table.columns[column], row[column] ?? "");
  }

  return values;
}

/**
 * A CSV file is all text, so each value is read as whatever its column holds. An empty value is nothing
 * at all rather than a zero or a blank date.
 *
 * Only a text column can hold the empty string, and only where it is not nullable - everywhere else an
 * empty cell is a null, which a column that refuses one refuses loudly. A number column given "" would
 * otherwise be a zero on MySQL, a syntax error on Postgres and the empty string on SQLite, all for a
 * coordinate the feed did not write.
 */
function value(column: Column, text: string): string | number | null {
  if (text === "") {
    return column.type.type === "text" && !column.nullable ? "" : null;
  }

  switch (column.type.type) {
    case "int":
    case "boolean":
    case "double":
    case "float":
    case "foreignKey":
      return Number(text);

    case "date":
      return toISODate(text);

    // decimal and time are stored as the digits they were written as, which is the point of them
    default:
      return text;
  }
}

function toISODate(text: string): string {
  const match = YYYYMMDD.exec(text);

  return match ? `${match[1]}-${match[2]}-${match[3]}` : text;
}
