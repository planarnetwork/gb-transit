import AdmZip from "adm-zip";
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import {Kysely} from "kysely";
import {FeedConfig} from "@gb-transit/dtd-schema";
import {FeedSchema, Row, Table} from "../database/Schema";
import {ImportFeedCommand} from "../cli/ImportFeedCommand";
import {kysely, schemaDialect} from "../container";

/**
 * Which database the suite runs against. MySQL is the default because that is what the recorded rows
 * were taken from, and every dialect is compared against the same ones.
 */
export const dialect = process.env.DATABASE_DIALECT ?? "mysql";

// docker-compose.yml and the CI services both provide this database; sqlite just needs somewhere to live
process.env.DATABASE_NAME ??= dialect === "sqlite"
  ? path.join(os.tmpdir(), "dtd2mysql-integration.sqlite")
  : "dtd2mysql";

const directory = path.join(__dirname, "fixture");

/**
 * The mini feeds dtd2gtfs commits, which are slices of real refreshes rather than anything written by
 * hand. See apps/dtd2gtfs/fixtures/mini/README.md for what they were seeded from and why.
 */
export const miniFixture = (archive: string): string =>
  path.join(__dirname, "..", "..", "..", "dtd2gtfs", "fixtures", "mini", archive);

/**
 * The recorded rows for a feed, which the import is compared against
 */
export function expectedRows(name: string): string {
  return path.join(__dirname, "expected", name);
}

/**
 * Zip a fixture folder up, as the import takes an archive rather than a folder.
 *
 * The archive name matters: the fifth character says whether the feed is a full refresh or a set of
 * changes to apply on top of one.
 */
export function zipFixture(fixture: string, archive: string): string {
  const zip = new AdmZip();

  zip.addLocalFolder(path.join(directory, fixture));

  const filename = path.join(fs.mkdtempSync(path.join(os.tmpdir(), "dtd-fixture")), archive);

  zip.writeZip(filename);

  return filename;
}

/**
 * The tables a feed writes to, in a stable order, deduplicated because some files share their records
 */
export function tableNames(feed: FeedConfig): string[] {
  const names = Object.values(feed).flatMap(file => file.recordTypes.map(record => record.name));

  return [...new Set(names)].sort();
}

/**
 * Every row of one table as a tab separated block, header first.
 *
 * Recorded as text rather than as JSON because JSON repeats every column name on every row: the
 * timetable feed is 416 KB this way and 3.7 MB as JSON, against the 196 KB golden feed dtd2gtfs commits
 * next door. The repo already writes its database fingerprints as .tsv, so this is the same shape.
 *
 * Rows come back in whatever order the database feels like, so they are ordered by the generated id the
 * feed tables all have. The GTFS tables are keyed by the specification instead, so they say what to use.
 *
 * A null is written as \N, the same sentinel mariadb-dump uses, so that it cannot be confused with the
 * empty string a fixed width field leaves behind.
 */
export async function readTable(
  db: Kysely<any>,
  table: string,
  orderBy: readonly string[] = ["id"]
): Promise<string> {
  let query = db.selectFrom(table).selectAll();

  for (const column of orderBy) {
    query = query.orderBy(column);
  }

  const rows = await query.execute();

  if (rows.length === 0) {
    return "";
  }

  const columns = Object.keys(rows[0]);
  const lines = [columns.join("\t")];

  for (const row of rows) {
    lines.push(columns.map(column => cell((row as any)[column])).join("\t"));
  }

  return lines.join("\n") + "\n";
}

/**
 * The same value read by three drivers is not the same JavaScript: mysql2 hands back a decimal as a
 * string where pg hands back a number, and SQLite has no boolean at all. What the import wrote is the
 * same either way, so a value is written as the text it stands for and the driver's opinion of its type
 * does not reach the recorded rows.
 */
function cell(value: unknown): string {
  if (value === null || value === undefined) {
    return "\\N";
  }

  return String(value).replace(/\\/g, "\\\\").replace(/\t/g, "\\t").replace(/\n/g, "\\n");
}

/**
 * A row of the given table, carrying the given values and something acceptable everywhere else.
 *
 * A fares table is forty columns wide and a test that spells all of them out says nothing about which of
 * them it is actually about. The declaration already says what each column holds, so the rest are filled
 * from it and the test names only the values it is making a point with.
 */
export function rowOf<T extends Table>(table: T, values: Partial<Values<T>>): Values<T> {
  const row: {[column: string]: unknown} = {};

  for (const [name, column] of Object.entries(table.columns)) {
    // a column that can be empty is left empty, so a value in a recorded row was put there on purpose
    if (column.nullable) {
      row[name] = null;
      continue;
    }

    switch (column.type.type) {
      case "int": case "boolean": case "double": case "float": case "foreignKey": row[name] = 0; break;
      case "date": row[name] = "2000-01-01"; break;
      case "time": row[name] = "00:00:00"; break;
      default: row[name] = "";
    }
  }

  return {...row, ...values} as Values<T>;
}

/**
 * The columns of a table without the id the database generates
 */
type Values<T extends Table> = Omit<Row<T>, "id">;

/**
 * The most recent file the import recorded, which is appended to rather than reset
 */
export async function lastProcessedFile(db: Kysely<any>): Promise<string | undefined> {
  const [row] = await db.selectFrom("log").select("filename").orderBy("id", "desc").limit(1).execute();

  return row?.filename ?? undefined;
}

/**
 * Import one feed from the given archive, against whichever database DATABASE_DIALECT names.
 *
 * The command is built here rather than taken from the container because the container resolves a CLI
 * flag to a command, and a test wants to say which archive rather than which flag.
 */
export async function importFeed(
  feed: FeedConfig,
  feedSchema: FeedSchema,
  archive: string
): Promise<ImportFeedCommand> {
  const command = new ImportFeedCommand(
    kysely(),
    schemaDialect(),
    feed,
    feedSchema,
    fs.mkdtempSync(path.join(os.tmpdir(), "dtd"))
  );

  await command.doImport(archive);

  return command;
}
