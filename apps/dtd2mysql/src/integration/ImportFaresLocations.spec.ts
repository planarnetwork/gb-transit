import {afterAll, beforeAll, describe, expect, it} from "vitest";
import {Kysely} from "kysely";
import config from "@gb-transit/dtd-schema";
import {ImportFeedCommand} from "../cli/ImportFeedCommand";
import {kysely} from "../container";
import schema from "../database/schema";
import {expectedRows, importFeed, miniFixture, readTable} from "./support";

/**
 * The same fares feed, with real records rather than generated ones.
 *
 * RJFAF001.ZIP is the slice of the RJFAF847 refresh cif2gtfs commits: the LOC file only, holding the
 * records the station groups extension reads. It is narrow - one file of forty odd lines against the
 * generated fixture's nineteen - but every line is real, including a group name padded out to its fixed
 * width, which is what says the padding is dropped on the way in rather than stored.
 *
 * The two fixtures answer different questions and both are kept: this one that real records parse and
 * store, the generated one that all forty five tables round trip.
 */
describe("importing real fares locations", () => {

  let command: ImportFeedCommand;
  let db: Kysely<any>;

  beforeAll(async () => {
    db = kysely();
    command = await importFeed(config.fares, schema.fares, miniFixture("RJFAF001.ZIP"));
  });

  afterAll(async () => {
    await command?.end();
  });

  // the six tables the LOC file writes to, which is every record type it holds
  for (const table of [
    "location",
    "location_association",
    "location_group",
    "location_group_member",
    "location_railcard",
    "location_synonym"
  ] as const) {
    it(`writes the same ${table} rows it always has`, async () => {
      await expect(await readTable(db, table)).toMatchFileSnapshot(
        expectedRows(`fares-locations/${table}.tsv`)
      );
    });
  }

});
