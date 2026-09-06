import AdmZip from "adm-zip";
import * as fs from 'fs';
import {CLICommand} from "./CLICommand";
import {FeedConfig} from "@gb-transit/dtd-schema";
import {FeedFile, Record as FeedRecord} from "@gb-transit/feed-parser";
import {Kysely, sql} from "kysely";
import {createLogSchema, LOG_TABLE, SchemaBuilder} from "../database/SchemaBuilder";
import {SchemaDialect} from "../database/SchemaDialect";
import {FeedSchema, Table} from "../database/Schema";
import {Database} from "../database/Database";
import * as path from "path";
import {TableWriter} from "../database/TableWriter";
import memoize from "memoized-class-decorator";
import {RecordStream, TableIndex} from "../database/RecordStream";
import byline from "byline";
import {finished} from "node:stream/promises";

const getExt = (filename: string) => path.extname(filename).slice(1).toUpperCase();
const readFile = (filename: string) => byline.createStream(fs.createReadStream(filename, "utf8"));

/**
 * Imports one of the feeds
 */
export class ImportFeedCommand implements CLICommand {

  constructor(
    private readonly db: Kysely<Database>,
    private readonly schemaDialect: SchemaDialect,
    private readonly files: FeedConfig,
    private readonly schema: FeedSchema,
    private readonly tmpFolder: string
  ) { }

  private get fileArray(): FeedFile[] {
    return Object.values(this.files);
  }

  /**
   * Do the import and then shut down the connection pool
   */
  public async run(argv: string[]): Promise<void> {
    await this.doImport(argv[3]);

    return this.end();
  }

  /**
   * Extract the zip, set up the schema and do the inserts
   */
  public async doImport(filePath: string): Promise<void> {
    console.log(`Extracting ${filePath} to ${this.tmpFolder}`);
    fs.rmSync(this.tmpFolder, {recursive: true, force: true});

    new AdmZip(filePath).extractAllTo(this.tmpFolder);

    const zipName = path.basename(filePath);

    // if the file is a not an incremental, reset the database schema
    if (zipName.charAt(4) !== "C") {
      await this.setupSchema();
      await this.createLastProcessedSchema();
    }

    await this.restoreIdCounters();

    await Promise.all(
      fs.readdirSync(this.tmpFolder)
        .filter(filename => this.getFeedFile(filename))
        .map(filename => this.processFile(filename))
    );

    await this.removeOrphanStopTimes();

    await this.updateLastFile(zipName);
    fs.rmSync(this.tmpFolder, { recursive: true });
  }

  /**
   * Drop and recreate the tables
   */
  private async setupSchema(): Promise<void> {
    await Promise.all(this.schemas().map(schema => schema.dropSchema()));
    await Promise.all(this.schemas().map(schema => schema.createSchema()));
  }

  /**
   * Create the last_file table (if it doesn't already exist)
   */
  private async createLastProcessedSchema(): Promise<void> {
    await createLogSchema(this.db, this.schemaDialect);
  }

  /**
   * Continue every generated id from where the database left off.
   *
   * A record that makes its own id counts from zero on each run, and `id` is the
   * primary key, so `INSERT IGNORE` silently drops every row whose id an earlier
   * feed already used - the schedules of an incremental land and their stop
   * times do not.
   *
   * Every record with a counter is restored, so a new one needs nothing here.
   * The name of a record is the name of its table, so there is no list to keep
   * in step. A full refresh drops the tables first, leaving the max null and
   * this a no-op.
   */
  private async restoreIdCounters(): Promise<void> {
    const counted = Object.values(this.files)
      .flatMap(file => file.recordTypes)
      .filter((record): record is FeedRecord & {lastId: number} => "lastId" in record);

    const seen = new Set<string>();

    await Promise.all(counted.map(async record => {
      if (seen.has(record.name)) {
        return;
      }

      seen.add(record.name);

      const [row] = await this.db
        .selectFrom(record.name as keyof Database)
        .select(eb => eb.fn.max<number | null>("id").as("id"))
        .execute();

      record.lastId = row?.id ?? 0;
    }));
  }

  /**
   * Stop times whose schedule is gone.
   *
   * A z-train that a later feed revises is REPLACEd, which means the old row is
   * deleted and the new one takes a new id - so the stop times that pointed at
   * the old id belong to nothing. The same is true of a schedule an incremental
   * withdraws.
   *
   * Only the timetable feed holds these tables, and only the feed being imported
   * has had its tables created. Importing fares into a database that has never
   * had a timetable feed used to fail here on a table that was never created -
   * invisible where all four feeds share one database, which is why it was.
   */
  private async removeOrphanStopTimes(): Promise<void> {
    if (!this.schema["stop_time"]) {
      return;
    }

    const schedules = this.db.selectFrom("schedule").select("id");
    const zSchedules = this.db.selectFrom("z_schedule").select("id");

    await this.db.deleteFrom("stop_time").where("schedule", "not in", schedules).execute();
    await this.db.deleteFrom("z_stop_time").where("z_schedule", "not in", zSchedules).execute();
    await this.db.deleteFrom("schedule_extra").where("schedule", "not in", schedules).execute();
  }


  private async updateLastFile(filename: string): Promise<void> {
    await this.db
      .insertInto(LOG_TABLE)
      .values({ filename, processed: sql<string>`current_timestamp` })
      .execute();
  }

  /**
   * Process the records inside the given file
   */
  private async processFile(filename: string): Promise<void> {
    const file = this.getFeedFile(filename);
    const tables = await this.tables(file);
    const tableStream = new RecordStream(filename, file, tables);
    const stream = readFile(`${this.tmpFolder}/${filename}`).pipe(tableStream);

    try {
      await finished(stream);

      console.log(`Finished processing ${filename}`);
    }
    catch (err) {
      console.error(`Error processing ${filename}`);
      console.error(err);
    }
  }

  @memoize
  private getFeedFile(filename: string): FeedFile {
    return this.files[getExt(filename)];
  }

  /**
   * One builder per table the feed writes to.
   *
   * Some files share their record types, the timetable's MCA and CFA in particular, so the tables are
   * deduplicated. Creating the same table twice at once is a race in Postgres, which does not make
   * CREATE TABLE IF NOT EXISTS atomic against itself.
   */
  @memoize
  private schemas(): SchemaBuilder[] {
    const tables = new Map<string, SchemaBuilder>();

    for (const file of this.fileArray) {
      for (const record of file.recordTypes) {
        if (!tables.has(record.name)) {
          tables.set(
            record.name,
            new SchemaBuilder(this.db, this.schemaDialect, record.name, this.table(record.name))
          );
        }
      }
    }

    return [...tables.values()];
  }

  /**
   * The declared table a record writes to. A record without one is a feed definition that was added
   * without declaring where it goes, which is worth failing on rather than silently skipping.
   */
  private table(name: string): Table {
    const table = this.schema[name];

    if (!table) {
      throw new Error(`No table is declared for ${name} in src/database/schema.`);
    }

    return table;
  }

  @memoize
  private async tables(file: FeedFile): Promise<TableIndex> {
    const index: TableIndex = {};

    for (const record of file.recordTypes) {
      if (!index[record.name]) {
        index[record.name] = new TableWriter(
          this.db, this.schemaDialect.name, record.name, record.orderedInserts
        );
      }
    }

    return index;
  }

  /**
   * Close the underling database connection
   */
  public async end(): Promise<void> {
    await this.db.destroy();
  }

}
