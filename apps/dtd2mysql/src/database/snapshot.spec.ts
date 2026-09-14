import {describe, it, expect} from "vitest";
import * as fs from "node:fs";
import * as path from "node:path";
import schema from "./schema";
import {FeedSchema} from "./Schema";

/**
 * The declared tables against a real database.
 *
 * data/snapshots/db-all-feeds was cut from a MariaDB the four feeds had been imported into, so it is
 * the one record of what the importer actually produces rather than what it is meant to. The schema
 * consistency test says the declarations fit the feed definitions; this says they match a database
 * somebody built.
 *
 * Only the column list is compared. The row hashes in the same snapshot are taken from mariadb-dump
 * output and are specific to the machine that cut them - the README is explicit that a baseline cut on
 * a runner will not match one cut locally even with identical data - so they are not something a test
 * can assert. A column list is DDL rather than dumped rows, and does not move.
 */
const snapshot = path.join(__dirname, "..", "..", "..", "..", "data", "snapshots", "db-all-feeds");

/**
 * The snapshot writes literal \t between its fields rather than tabs
 */
function columnsBySnapshotTable(): Map<string, string[]> {
  const tables = new Map<string, string[]>();

  for (const line of fs.readFileSync(path.join(snapshot, "columns.tsv"), "utf8").trim().split("\n")) {
    const [table, , column] = line.split("\\t");

    tables.set(table, [...(tables.get(table) ?? []), column]);
  }

  return tables;
}

/**
 * Every declared table, with the generated id the schema builder adds in front of its columns
 */
function columnsByDeclaredTable(): Map<string, string[]> {
  const tables = new Map<string, string[]>();

  for (const feed of Object.values(schema) as FeedSchema[]) {
    for (const [name, table] of Object.entries(feed)) {
      tables.set(name, ["id", ...Object.keys(table.columns)]);
    }
  }

  return tables;
}

describe("the declared schema against the snapshot", () => {
  const real = columnsBySnapshotTable();
  const declared = columnsByDeclaredTable();

  /**
   * log is created by createLogSchema rather than by a feed, so it is in the database without being
   * declared as part of one. network_flow_restriction is the other way round: --fares-clean builds it
   * out of the fares it has just cleaned, and the snapshot was cut from an import that never ran it.
   */
  it("declares every table the import creates", () => {
    const missing = [...real.keys()].filter(table => !declared.has(table) && table !== "log");

    expect(missing).to.deep.equal([]);
  });

  it("declares no table the import does not create, other than the derived one", () => {
    const extra = [...declared.keys()].filter(table => !real.has(table));

    expect(extra).to.deep.equal(["network_flow_restriction"]);
  });

  for (const [table, columns] of real) {
    if (table === "log") {
      continue;
    }

    it(`declares ${table} with the columns the database has, in the same order`, () => {
      expect(declared.get(table)).to.deep.equal(columns);
    });
  }

});
