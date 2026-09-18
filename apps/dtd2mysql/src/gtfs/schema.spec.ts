import {describe, it, expect} from "vitest";
import * as fs from "node:fs";
import * as path from "node:path";
import {Kysely} from "kysely";
import gtfsSchema from "./schema";
import {GTFSSchemaBuilder} from "../database/GTFSSchema";
import {mysqlSchemaDialect, postgresSchemaDialect, sqliteSchemaDialect} from "../database/dialect";
import {nodeSqliteDialect} from "../database/NodeSqliteDatabase";
import {Column} from "../database/Schema";
import {recording} from "../database/testing/recording";

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

  /**
   * A trip id is in a primary key and three more indexes, and MySQL's default collation would make two
   * that differ only in case the same one - so the key would reject the second and a join would match
   * either. The same goes for the shape id a trip points at.
   */
  it("compares every id column exactly", () => {
    const ids: { [at: string]: Column } = {
      "stop_times.trip_id": gtfsSchema.stop_times.columns.trip_id,
      "trips.trip_id": gtfsSchema.trips.columns.trip_id,
      "trips.shape_id": gtfsSchema.trips.columns.shape_id,
      "shapes.shape_id": gtfsSchema.shapes.columns.shape_id,
      "transfers.from_trip_id": gtfsSchema.transfers.columns.from_trip_id,
      "transfers.to_trip_id": gtfsSchema.transfers.columns.to_trip_id
    };

    expect(Object.keys(ids).filter(at => !ids[at].ascii)).to.deep.equal([]);
  });

  // they are in the primary key, so a transfers.txt written without them has to land as empty strings
  it("defaults the transfer trip ids to the empty string", () => {
    expect(gtfsSchema.transfers.columns.from_trip_id.default).to.equal("");
    expect(gtfsSchema.transfers.columns.to_trip_id.default).to.equal("");
  });

  it("creates every table in a real database, and compiles for the other two", async () => {
    const sqlite = new Kysely<any>({ dialect: nodeSqliteDialect(":memory:") });

    for (const [name, table] of Object.entries(gtfsSchema)) {
      await new GTFSSchemaBuilder(sqlite, sqliteSchemaDialect, name, table).createSchema();

      for (const dialect of [mysqlSchemaDialect, postgresSchemaDialect]) {
        const { db, statements } = recording(dialect.name);

        await new GTFSSchemaBuilder(db, dialect, name, table).createSchema();

        expect(statements.some(sql => sql.startsWith("create table")), `${dialect.name} ${name}`).to.equal(true);

        await db.destroy();
      }
    }

    expect((await sqlite.introspection.getTables()).length).to.equal(Object.keys(gtfsSchema).length);

    await sqlite.destroy();
  });

});
