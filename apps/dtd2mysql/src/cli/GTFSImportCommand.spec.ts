import {describe, it, expect, beforeEach, afterEach} from "vitest";
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import {Kysely} from "kysely";
import {GTFSImportCommand} from "./GTFSImportCommand";
import {nodeSqliteDialect} from "../database/NodeSqliteDatabase";
import {sqliteSchemaDialect} from "../database/dialect";
import gtfsSchema from "../gtfs/schema";

/**
 * The import against a real database, loading the golden feed cif2gtfs commits: the whole path - create
 * the tables, read the CSV, write the rows - with no server needed.
 */
const golden = path.join(__dirname, "..", "..", "..", "cif2gtfs", "fixtures", "mini", "golden");

describe("GTFSImportCommand", () => {
  let db: Kysely<any>;

  beforeEach(async () => {
    db = new Kysely<any>({dialect: nodeSqliteDialect(":memory:")});

    await new GTFSImportCommand(db, sqliteSchemaDialect, gtfsSchema).doImport(golden);
  });

  afterEach(async () => {
    await db.destroy();
  });

  it("loads every file the build writes", async () => {
    for (const table of Object.keys(gtfsSchema)) {
      const [{count}] = await db
        .selectFrom(table)
        .select(eb => eb.fn.countAll<number>().as("count"))
        .execute();

      expect(Number(count), `${table} rows`).to.be.greaterThan(0);
    }
  });

  /**
   * A GTFS time counts from the start of the service day rather than the clock, so a call after
   * midnight is written as 24:01:00 and a late one as 26:15:00. Postgres refuses either as a time,
   * and they are 430 of this feed's 1326 calls.
   */
  it("loads the calls after midnight", async () => {
    const calls = await db
      .selectFrom("stop_times")
      .select("arrival_time")
      .where("arrival_time", ">=", "24:00:00")
      .execute();

    expect(calls.length).to.be.greaterThan(0);
  });

  /**
   * stops.txt writes its coordinates last while the table declares them in the middle. A positional
   * column list loaded the longitude into zone_id and reported nothing.
   */
  it("puts the coordinates in the coordinate columns", async () => {
    const stops = await db
      .selectFrom("stops")
      .select(["stop_id", "stop_lat", "stop_lon", "zone_id", "stop_url"])
      .where("stop_lat", "is not", null)
      .execute();

    expect(stops.length).to.be.greaterThan(0);

    for (const stop of stops) {
      expect(Number(stop.stop_lat), stop.stop_id).to.be.greaterThan(49);
      expect(Number(stop.stop_lat), stop.stop_id).to.be.lessThan(61);
      expect(stop.zone_id, stop.stop_id).to.equal(null);
      expect(stop.stop_url, stop.stop_id).to.equal(null);
    }
  });

  it("reads a YYYYMMDD date as a date", async () => {
    const [calendar] = await db.selectFrom("calendar").select(["start_date", "end_date"]).execute();

    expect(calendar.start_date).to.match(/^\d{4}-\d{2}-\d{2}$/);
    expect(calendar.end_date).to.match(/^\d{4}-\d{2}-\d{2}$/);
  });

  /**
   * An absent value is an empty field rather than \N, so a column that can be absent has to become null
   * rather than a zero or a blank date - "does not run on Monday" is not the same as "no link here".
   */
  it("reads an empty field as nothing rather than as zero", async () => {
    const rows = await db
      .selectFrom("transfers")
      .select(["transfer_type", "mode", "monday", "start_date", "min_transfer_time", "from_trip_id"])
      .where("mode", "is", null)
      .execute();

    expect(rows.length).to.be.greaterThan(0);

    for (const transfer of rows) {
      // no link to describe, so none of the fixed link columns say anything
      expect(transfer.monday).to.equal(null);
      expect(transfer.start_date).to.equal(null);
    }

    // a station interchange is a time between two stops, with no trips
    const interchanges = rows.filter(row => Number(row.transfer_type) === 2);

    expect(interchanges.length).to.be.greaterThan(0);
    expect(interchanges.every(row => row.min_transfer_time !== null)).to.equal(true);
    expect(interchanges.every(row => row.from_trip_id === "")).to.equal(true);

    // a coupling is two trips meeting, with no time
    const couplings = rows.filter(row => Number(row.transfer_type) === 4);

    expect(couplings.length).to.be.greaterThan(0);
    expect(couplings.every(row => row.min_transfer_time === null)).to.equal(true);
    expect(couplings.every(row => row.from_trip_id !== "")).to.equal(true);
  });

  /**
   * A cell the feed leaves empty is nothing at all, whatever the column holds. An empty decimal fell
   * through to the text default and was written as "", which MySQL stored as zero, Postgres refused
   * on the syntax and SQLite stored as the empty string - three answers to a coordinate nobody
   * wrote. It is a null now, and a column that cannot hold one says so.
   */
  it("refuses a coordinate the feed did not write, rather than storing a zero", async () => {
    const directory = fs.mkdtempSync(path.join(os.tmpdir(), "dtd-gtfs"));

    fs.writeFileSync(
      path.join(directory, "shapes.txt"),
      "shape_id,shape_pt_lat,shape_pt_lon,shape_pt_sequence\nabcdef123456,,,1\n"
    );

    await expect(new GTFSImportCommand(db, sqliteSchemaDialect, gtfsSchema).doImport(directory))
      .rejects.toThrow(/NOT NULL|constraint/i);
  });

  it("replaces what an earlier import left behind", async () => {
    const before = await count("stops");

    await new GTFSImportCommand(db, sqliteSchemaDialect, gtfsSchema).doImport(golden);

    expect(await count("stops")).to.equal(before);
  });

  async function count(table: string): Promise<number> {
    const [{count}] = await db
      .selectFrom(table)
      .select(eb => eb.fn.countAll<number>().as("count"))
      .execute();

    return Number(count);
  }

});
