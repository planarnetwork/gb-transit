import {describe, it, expect, beforeEach, afterEach} from "vitest";
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import {finished} from "node:stream/promises";
import {Kysely} from "kysely";
import {CSVRowWriter} from "@gb-transit/gtfs-output";
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
   * A cell the feed leaves empty is nothing at all, whatever the column holds, and a column that cannot
   * hold nothing says so rather than storing a zero or an empty string for a coordinate nobody wrote.
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

  it("reads back the values the GTFS output quotes", async () => {
    const directory = fs.mkdtempSync(path.join(os.tmpdir(), "dtd-gtfs"));
    const file = fs.createWriteStream(path.join(directory, "stops.txt"));
    const writer = new CSVRowWriter<{ stop_id: string, stop_name: string, stop_desc: string | null }>(["stop_id", "stop_name", "stop_desc"], file);

    writer.write({ stop_id: "LDS", stop_name: "Leeds, City", stop_desc: 'the "main" one' });
    writer.write({ stop_id: "MAN", stop_name: "Manchester\nPiccadilly", stop_desc: null });
    writer.end();

    // the writer finishing only means it has handed everything to the pipe, see FileOutput
    await finished(file);
    await importFrom(directory);

    expect(await stops()).to.deep.equal([
      { stop_id: "LDS", stop_name: "Leeds, City", stop_desc: 'the "main" one' },
      { stop_id: "MAN", stop_name: "Manchester\nPiccadilly", stop_desc: null }
    ]);
  });

  /**
   * The specification permits one, and left on it would be part of the first column's name - a column
   * no table has.
   */
  it("reads a file that starts with a byte order mark", async () => {
    await importFrom(files({ "stops.txt": "\ufeffstop_id,stop_name\nBTN,Brighton\n" }));

    expect(await stops()).to.deep.equal([{ stop_id: "BTN", stop_name: "Brighton", stop_desc: null }]);
  });

  it("refuses a row that does not have the header's columns", async () => {
    await expect(importFrom(files({ "stops.txt": "stop_id,stop_name\nBTN\n" })))
      .rejects.toThrow("stops.txt: Row 1 has 1 fields where the header has 2");
    await expect(importFrom(files({ "stops.txt": "stop_id,stop_name\nBTN,Brighton,EXTRA\n" })))
      .rejects.toThrow("stops.txt: Row 1 has 3 fields where the header has 2");
  });

  it("refuses a column the table does not have", async () => {
    await expect(importFrom(files({ "stops.txt": "stop_id,platform_colour\nBTN,red\n" })))
      .rejects.toThrow("stops.txt: a platform_colour column, which the stops table does not have");
  });

  /**
   * from_trip_id and to_trip_id are part of the primary key, so a transfers.txt without them relies on
   * the table's default rather than a null
   */
  it("gives a column the file leaves out its default", async () => {
    await importFrom(files({ "transfers.txt": "from_stop_id,to_stop_id,transfer_type\nBTN,BTN,2\n" }));

    const [transfer] = await db.selectFrom("transfers").select(["from_trip_id", "to_trip_id"]).execute();

    expect(transfer).to.deep.equal({ from_trip_id: "", to_trip_id: "" });
  });

  it("replaces what an earlier import left behind", async () => {
    const before = await count("stops");

    await new GTFSImportCommand(db, sqliteSchemaDialect, gtfsSchema).doImport(golden);

    expect(await count("stops")).to.equal(before);
  });

  function importFrom(directory: string): Promise<void> {
    return new GTFSImportCommand(db, sqliteSchemaDialect, gtfsSchema).doImport(directory);
  }

  function stops() {
    return db.selectFrom("stops").select(["stop_id", "stop_name", "stop_desc"]).orderBy("stop_id").execute();
  }

  async function count(table: string): Promise<number> {
    const [{count}] = await db
      .selectFrom(table)
      .select(eb => eb.fn.countAll<number>().as("count"))
      .execute();

    return Number(count);
  }

});

/**
 * A directory holding the given files, written as they are given rather than through the GTFS writer
 * so that they can be malformed
 */
function files(contents: { [name: string]: string }): string {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), "dtd-gtfs"));

  for (const [name, text] of Object.entries(contents)) {
    fs.writeFileSync(path.join(directory, name), text);
  }

  return directory;
}
