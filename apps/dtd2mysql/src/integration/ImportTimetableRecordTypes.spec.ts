import {afterAll, beforeAll, describe, expect, it} from "vitest";
import {Kysely} from "kysely";
import config from "@gb-transit/dtd-schema";
import {ImportFeedCommand} from "../cli/ImportFeedCommand";
import {kysely} from "../container";
import schema from "../database/schema";
import {expectedRows, importFeed, readTable, zipFixture} from "./support";

/**
 * The timetable record types the real slice does not reach.
 *
 * RJTTF001.ZIP is a slice of a real refresh and is the better fixture for everything it covers, but a
 * slice only holds what its seed TUIDs pulled in. Two record types are not in it at all:
 *
 * - the TSI file, which is the timetable feed's only CSV record rather than a fixed width one, so
 *   without this nothing exercises that parser end to end;
 * - the MSN's L records, its second record type, which are station aliases.
 *
 * Both tables came back empty against the real slice, which is what this fixture is for. It is hand
 * built and small: four stations, one alias and two interchange rows, enough to say the records parse
 * and store on all three databases.
 *
 * A full refresh drops and recreates the timetable tables, so this import replaces what ImportTimetable
 * left behind. The files run one at a time for that reason - see vitest.integration.config.mts.
 */
describe("importing the timetable record types the real slice lacks", () => {

  let command: ImportFeedCommand;
  let db: Kysely<any>;

  beforeAll(async () => {
    db = kysely();
    command = await importFeed(
      config.timetable, schema.timetable, zipFixture("timetable", "RJTTF999.ZIP")
    );
  });

  afterAll(async () => {
    await command?.end();
  });

  for (const table of ["alias", "toc_interchange"] as const) {
    it(`writes the same ${table} rows it always has`, async () => {
      await expect(await readTable(db, table)).toMatchFileSnapshot(
        expectedRows(`timetable-record-types/${table}.tsv`)
      );
    });
  }

  it("reads the CSV records of the TSI file", async () => {
    const rows = await db.selectFrom("toc_interchange").selectAll().orderBy("id").execute();

    expect(rows.length).to.equal(2);
    expect(rows[0].crs).to.equal("BTN");
    expect(rows[0].from_toc).to.equal("SN");
    expect(rows[0].to_toc).to.equal("GW");
    expect(Number(rows[0].time)).to.equal(10);
  });

});
