import {afterAll, beforeAll, describe, expect, it} from "vitest";
import {Kysely} from "kysely";
import config from "@gb-transit/dtd-schema";
import {ImportFeedCommand} from "../cli/ImportFeedCommand";
import {kysely} from "../container";
import schema from "../database/schema";
import {expectedRows, importFeed, lastProcessedFile, readTable, tableNames, zipFixture} from "./support";

/**
 * Imports the generated routeing feed and records every row it wrote. Generated for the same reason the
 * fares fixture is: fifteen files against the DTD spec is not something to transcribe by hand.
 */
describe("importing the routeing feed", () => {

  let command: ImportFeedCommand;
  let db: Kysely<any>;

  beforeAll(async () => {
    db = kysely();
    command = await importFeed(config.routeing, schema.routeing, zipFixture("routeing", "RJRGF999.ZIP"));
  });

  afterAll(async () => {
    await command?.end();
  });

  for (const table of tableNames(config.routeing)) {
    it(`writes the same ${table} rows it always has`, async () => {
      await expect(await readTable(db, table)).toMatchFileSnapshot(expectedRows(`routeing/${table}.tsv`));
    });
  }

  it("logs the file it processed", async () => {
    expect(await lastProcessedFile(db)).to.equal("RJRGF999.ZIP");
  });

});
