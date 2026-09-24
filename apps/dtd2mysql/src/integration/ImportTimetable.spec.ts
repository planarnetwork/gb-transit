import {afterAll, beforeAll, describe, expect, it} from "vitest";
import {Kysely} from "kysely";
import config from "@gb-transit/dtd-schema";
import {ImportFeedCommand} from "../cli/ImportFeedCommand";
import {kysely} from "../container";
import schema from "../database/schema";
import {expectedRows, importFeed, lastProcessedFile, miniFixture, readTable, tableNames} from "./support";

/**
 * Imports the mini timetable feed and records every row it wrote.
 *
 * The point of this is the expected rows file. The same file is the expectation for MySQL, Postgres and
 * SQLite: a database needing its own is a bug rather than something to record. Run vitest with -u to
 * update it, and treat any change to it as something to explain rather than accept.
 *
 * The fixture is RJTTF001.ZIP, a slice of the real RJTTF918 refresh that cif2gtfs commits for its golden
 * feed - 7,336 MCA lines seeded from named TUIDs covering the STP stacks, the joins and splits, the
 * services running past midnight and one z-train of each category.
 *
 * It carries the header and trailer lines the real feeds do, so the record count and the row count do
 * not match: the MSN holds 205 A records and 204 stations arrive. The extra one is the FILE-SPEC header,
 * whose S lands on the interchange status field and which would read as a station with a CRS code of
 * 0/1. MSN.isRecord excludes it, and 204 is what says so.
 */
describe("importing the timetable feed", () => {

  let command: ImportFeedCommand;
  let db: Kysely<any>;

  beforeAll(async () => {
    db = kysely();
    command = await importFeed(config.timetable, schema.timetable, miniFixture("RJTTF001.ZIP"));
  });

  afterAll(async () => {
    await command?.end();
  });

  // one file per table, so a change to stop_time is not a diff against everything else as well
  for (const table of tableNames(config.timetable)) {
    it(`writes the same ${table} rows it always has`, async () => {
      await expect(await readTable(db, table)).toMatchFileSnapshot(
        expectedRows(`timetable/${table}.tsv`)
      );
    });
  }

  it("logs the file it processed", async () => {
    expect(await lastProcessedFile(db)).to.equal("RJTTF001.ZIP");
  });

});
