import {describe, expect, it} from "vitest";
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import AdmZip from "adm-zip";
import {Kysely} from "kysely";
import {FeedFile, ParsedRecord, Record as FeedRecord, RecordAction} from "@gb-transit/feed-parser";
import {ImportFeedCommand} from "./ImportFeedCommand";
import {nodeSqliteDialect} from "../database/NodeSqliteDatabase";
import {getSchemaDialect} from "../database/dialect";
import {char, FeedSchema} from "../database/Schema";

/**
 * The log table is what says an archive has been imported: the next download starts from the file it
 * names and asks for the changes published since. Anything it records is an archive nothing will come
 * back for, so what it may record is worth a test of its own.
 */
describe("importing a feed", () => {

  it("records the archive when every file lands", async () => {
    const db = database();

    await command(db).doImport(archive(["good"]));

    expect(await filenames(db)).to.deep.equal(["RJFAF999.ZIP"]);
    expect(await codes(db)).to.deep.equal(["good"]);

    await db.destroy();
  });

  it("does not record the archive when a file fails", async () => {
    const db = database();

    await expect(command(db).doImport(archive(["good", "bad"]))).rejects.toThrow(/was not imported/);

    expect(await filenames(db)).to.deep.equal([]);

    await db.destroy();
  });

});

const database = () => new Kysely<any>({ dialect: nodeSqliteDialect(":memory:") });

const filenames = (db: Kysely<any>) =>
  db.selectFrom("log").select("filename").execute().then(rows => rows.map(row => row.filename));

const codes = (db: Kysely<any>) =>
  db.selectFrom("thing").select("code").orderBy("code").execute().then(rows => rows.map(row => row.code));

function command(db: Kysely<any>): ImportFeedCommand {
  const schema: FeedSchema = { thing: { columns: { code: char(4) }, key: ["code"], indexes: [] } };

  return new ImportFeedCommand(
    db,
    getSchemaDialect("sqlite"),
    { THING: file },
    schema,
    fs.mkdtempSync(path.join(os.tmpdir(), "dtd-import"))
  );
}

/**
 * A feed file of one record type, which refuses the line "bad" the way a field refuses a value it
 * cannot read
 */
const record: FeedRecord = {
  name: "thing",
  key: ["code"],
  fields: {},
  indexes: [],
  orderedInserts: false,
  extractValues: (line: string): ParsedRecord => {
    if (line === "bad") {
      throw new Error(`thing cannot read "${line}"`);
    }

    return { action: RecordAction.Insert, values: { id: null, code: line }, keysValues: { code: line } };
  }
};

const file: FeedFile = { recordTypes: [record], getRecord: () => record };

/**
 * An archive of one file holding the given lines. The fifth character of the name says whether the
 * feed is a full refresh, and F makes this one.
 */
function archive(lines: string[]): string {
  const zip = new AdmZip();

  zip.addFile("RJFAF999.THING", Buffer.from(lines.join("\n") + "\n"));

  const filename = path.join(fs.mkdtempSync(path.join(os.tmpdir(), "dtd-archive")), "RJFAF999.ZIP");

  zip.writeZip(filename);

  return filename;
}
