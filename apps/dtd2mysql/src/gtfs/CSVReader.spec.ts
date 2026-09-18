import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import {CSVRowWriter} from "@gb-transit/gtfs-output";
import {finished} from "node:stream/promises";
import {describe, expect, it} from "vitest";
import {CSVRow, readCSV, splitCSVRecord} from "./CSVReader";

describe("splitting a CSV record", () => {

  it("splits on the commas", () => {
    expect(splitCSVRecord("a,b,c")).to.deep.equal(["a", "b", "c"]);
  });

  it("keeps an empty value", () => {
    expect(splitCSVRecord("a,,c")).to.deep.equal(["a", "", "c"]);
    expect(splitCSVRecord("a,b,")).to.deep.equal(["a", "b", ""]);
  });

  it("leaves the comma inside a quoted value alone", () => {
    expect(splitCSVRecord('a,"b,c",d')).to.deep.equal(["a", "b,c", "d"]);
  });

  it("reads a doubled quote as one quote", () => {
    expect(splitCSVRecord('a,"b""c",d')).to.deep.equal(["a", 'b"c', "d"]);
  });

  it("reads an empty quoted value", () => {
    expect(splitCSVRecord('a,"",c')).to.deep.equal(["a", "", "c"]);
  });

  it("does not treat a quote in the middle of a value as quoting it", () => {
    expect(splitCSVRecord('a,b"c,d')).to.deep.equal(["a", 'b"c', "d"]);
  });

  it("returns nothing when a quoted value has not been closed", () => {
    expect(splitCSVRecord('a,"b,c')).to.equal(undefined);
  });

});

describe("reading a CSV file", () => {

  it("reads back what the GTFS output writes", async () => {
    const rows = [
      { stop_id: "BTN", stop_name: "Brighton", stop_desc: null },
      // the three things the writer quotes for
      { stop_id: "LDS", stop_name: "Leeds, City", stop_desc: 'the "main" one' },
      { stop_id: "MAN", stop_name: "Manchester\nPiccadilly", stop_desc: "" }
    ];

    expect(await roundTrip(rows)).to.deep.equal([
      { stop_id: "BTN", stop_name: "Brighton", stop_desc: "" },
      { stop_id: "LDS", stop_name: "Leeds, City", stop_desc: 'the "main" one' },
      { stop_id: "MAN", stop_name: "Manchester\nPiccadilly", stop_desc: "" }
    ]);
  });

  it("reads no rows from a file that is only a header", async () => {
    expect(await roundTrip([])).to.deep.equal([]);
  });

  /**
   * The specification permits one, and left on it is part of the first column's name - so the column
   * belongs to no table, and the import fails after it has already dropped and recreated that table.
   */
  it("reads a file that starts with a byte order mark", async () => {
    const rows = await read("﻿stop_id,stop_name\nBTN,Brighton\n");

    expect(rows).to.deep.equal([{ stop_id: "BTN", stop_name: "Brighton" }]);
  });

  /**
   * A row with fewer values than the header was padded with empty strings, which a nullable column
   * then stored as null, and a row with more had the extra values dropped. Either is a file that is
   * not what it says it is.
   */
  it("refuses a row that does not have the header's columns", async () => {
    await expect(read("stop_id,stop_name,zone_id\nBTN\n")).rejects.toThrow(/1 values where the header has 3/);
    await expect(read("stop_id,stop_name\nBTN,Brighton,EXTRA\n")).rejects.toThrow(/3 values where the header has 2/);
  });

});

/**
 * Read a file written out as it is given here, rather than through the GTFS writer, so that it can be
 * malformed
 */
async function read(text: string): Promise<CSVRow[]> {
  const filename = path.join(fs.mkdtempSync(path.join(os.tmpdir(), "dtd-csv")), "stops.txt");

  fs.writeFileSync(filename, text);

  const rows: CSVRow[] = [];

  for await (const row of readCSV(filename)) {
    rows.push(row);
  }

  return rows;
}

type StopRow = { stop_id: string, stop_name: string, stop_desc: string | null };

/**
 * Write the rows out with the writer the GTFS output uses and read them back
 */
async function roundTrip(rows: StopRow[]): Promise<CSVRow[]> {
  const filename = path.join(fs.mkdtempSync(path.join(os.tmpdir(), "dtd-csv")), "stops.txt");
  const file = fs.createWriteStream(filename);
  const writer = new CSVRowWriter<StopRow>(["stop_id", "stop_name", "stop_desc"], file);

  rows.forEach(row => writer.write(row));
  writer.end();

  // the writer finishing only means it has handed everything to the pipe, see FileOutput
  await finished(file);

  const read: CSVRow[] = [];

  for await (const row of readCSV(filename)) {
    read.push(row);
  }

  return read;
}
