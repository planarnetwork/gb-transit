import {afterAll, beforeAll, describe, expect, it} from "vitest";
import {Kysely} from "kysely";
import config from "@gb-transit/dtd-schema";
import {ImportFeedCommand} from "../cli/ImportFeedCommand";
import {kysely} from "../container";
import schema from "../database/schema";
import {expectedRows, importFeed, readTable, tableNames, zipFixture} from "./support";

/**
 * Imports the generated nfm64 feed. One file and one table, and the only feed whose file has no
 * extension at all, which is why the fixture is named nfm64 rather than nfm64.something.
 */
describe("importing the nfm64 feed", () => {

  let command: ImportFeedCommand;
  let db: Kysely<any>;

  beforeAll(async () => {
    db = kysely();
    command = await importFeed(config.nfm64, schema.nfm64, zipFixture("nfm64", "RJFAF999.ZIP"));
  });

  afterAll(async () => {
    await command?.end();
  });

  for (const table of tableNames(config.nfm64)) {
    it(`writes the same ${table} rows it always has`, async () => {
      await expect(await readTable(db, table)).toMatchFileSnapshot(expectedRows(`nfm64/${table}.tsv`));
    });
  }

});
