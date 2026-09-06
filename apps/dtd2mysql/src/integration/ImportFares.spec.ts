import {afterAll, beforeAll, describe, expect, it} from "vitest";
import {Kysely} from "kysely";
import config from "@gb-transit/dtd-schema";
import {ImportFeedCommand} from "../cli/ImportFeedCommand";
import {kysely} from "../container";
import schema from "../database/schema";
import {expectedRows, importFeed, lastProcessedFile, readTable, tableNames, zipFixture} from "./support";

/**
 * Imports the generated fares feed and records every row it wrote.
 *
 * Nineteen files and forty five tables, which is more than anyone wants to transcribe against the DTD
 * spec by hand, so the fixture is built from the field definitions - see generateFixtures.ts. The data is
 * synthetic, so what this proves is that the database layer stores and returns what the feed parsed,
 * across all three databases, rather than that the parsing is right.
 *
 * ImportFaresLocations covers the same feed with real records, and the timetable fixture is a real slice.
 */
describe("importing the fares feed", () => {

  let command: ImportFeedCommand;
  let db: Kysely<any>;

  beforeAll(async () => {
    db = kysely();
    command = await importFeed(config.fares, schema.fares, zipFixture("fares", "RJFAF999.ZIP"));
  });

  afterAll(async () => {
    await command?.end();
  });

  for (const table of tableNames(config.fares)) {
    it(`writes the same ${table} rows it always has`, async () => {
      await expect(await readTable(db, table)).toMatchFileSnapshot(expectedRows(`fares/${table}.tsv`));
    });
  }

  it("logs the file it processed", async () => {
    expect(await lastProcessedFile(db)).to.equal("RJFAF999.ZIP");
  });

});
