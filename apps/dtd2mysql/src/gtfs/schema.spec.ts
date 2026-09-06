import {describe, it, expect} from "vitest";
import * as fs from "node:fs";
import * as path from "node:path";
import gtfsSchema from "./schema";

/**
 * The tables --gtfs-import loads into have to agree with the feed the build writes, and nothing else
 * says so.
 *
 * The loader matches a value to a column by the file's header rather than by position, so the two orders
 * are free to differ - which they do, stops.txt writing its coordinates last. What is not free is a
 * column the file has and the table does not: the loader stops on one rather than dropping the value, so
 * a feed that gains a field fails the import until it is declared. That is what this catches first.
 *
 * The golden feed belongs to cif2gtfs, which is the only committed example of what this build produces.
 * Reading it across the workspace is the point: the two have to match.
 */
const golden = path.join(__dirname, "..", "..", "..", "cif2gtfs", "fixtures", "mini", "golden");

const header = (file: string) =>
  fs.readFileSync(path.join(golden, file), "utf8").split("\n")[0].trim().split(",");

const written = () => fs.readdirSync(golden).filter(file => file.endsWith(".txt")).sort();

describe("the GTFS import schema", () => {

  it("declares a table for every file the build writes", () => {
    const tables = written().map(file => file.replace(".txt", ""));

    expect(tables.filter(table => !gtfsSchema.hasOwnProperty(table))).to.deep.equal([]);
  });

  for (const file of written()) {
    it(`declares every column ${file} carries`, () => {
      const table = gtfsSchema[file.replace(".txt", "") as keyof typeof gtfsSchema];
      const columns = Object.keys(table.columns);

      expect(header(file).filter(column => !columns.includes(column))).to.deep.equal([]);
    });
  }

  /**
   * A table declared for a file that is never written is harmless - the import says there is nothing to
   * load - but it is more likely a rename nobody finished.
   */
  it("declares no tables beyond the files", () => {
    const files = new Set(written().map(file => file.replace(".txt", "")));
    const extra = Object.keys(gtfsSchema).filter(table => !files.has(table));

    expect(extra).to.deep.equal([]);
  });

});
