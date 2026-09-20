import {describe, it, expect} from 'vitest';
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import {Kysely, sql} from "kysely";
import {nodeSqliteDialect} from "./NodeSqliteDatabase";

describe("node:sqlite as a Kysely database", () => {

  it("round trips values through an in memory database", async () => {
    const db = await stops();

    await db.insertInto("stops").values({ crs: "TON", name: "Tonbridge", platforms: 5 }).execute();

    const rows = await db.selectFrom("stops").selectAll().execute();

    expect(rows).to.deep.equal([{ id: 1, crs: "TON", name: "Tonbridge", platforms: 5 }]);

    await db.destroy();
  });

  it("reports the inserted id and the number of affected rows", async () => {
    const db = await stops();

    const insert = await db.insertInto("stops").values({ crs: "ASH", name: "Ashford", platforms: 6 }).executeTakeFirst();

    expect(insert.insertId).to.equal(1n);

    const update = await db.updateTable("stops").set({ platforms: 7 }).executeTakeFirst();

    expect(update.numUpdatedRows).to.equal(1n);

    await db.destroy();
  });

  it("commits transactions", async () => {
    const db = await stops();

    await db.transaction().execute(async trx => {
      await trx.insertInto("stops").values({ crs: "DOV", name: "Dover", platforms: 3 }).execute();
    });

    expect((await db.selectFrom("stops").selectAll().execute()).length).to.equal(1);

    await db.destroy();
  });

  it("rolls transactions back", async () => {
    const db = await stops();

    await expect(db.transaction().execute(async trx => {
      await trx.insertInto("stops").values({ crs: "PDW", name: "Paddock Wood", platforms: 3 }).execute();

      throw new Error("rollback");
    })).rejects.toThrow("rollback");

    expect((await db.selectFrom("stops").selectAll().execute()).length).to.equal(0);

    await db.destroy();
  });

  it("streams results a row at a time", async () => {
    const db = await stops();

    await db.insertInto("stops").values([
      { crs: "TON", name: "Tonbridge", platforms: 5 },
      { crs: "ASH", name: "Ashford", platforms: 6 },
      { crs: "DOV", name: "Dover", platforms: 3 }
    ]).execute();

    const streamed: string[] = [];

    for await (const row of db.selectFrom("stops").selectAll().stream()) {
      streamed.push(row.crs);
    }

    expect(streamed).to.deep.equal(["TON", "ASH", "DOV"]);

    await db.destroy();
  });

  it("serialises concurrent queries onto the single handle", async () => {
    const db = await stops();

    await Promise.all(
      ["TON", "ASH", "DOV", "PDW", "RAM"].map(crs =>
        db.insertInto("stops").values({ crs, name: crs, platforms: 1 }).execute()
      )
    );

    expect((await db.selectFrom("stops").selectAll().execute()).length).to.equal(5);

    await db.destroy();
  });

  /**
   * The values are spread into node:sqlite as arguments, and it reads an object in the first of them
   * as a set of named parameters - so a Date bound there is taken as no named parameters at all,
   * every later value slides one place towards it, and the row is stored wrong without an error. In
   * any other position the same value is refused, which is what it is everywhere now.
   */
  it("refuses a value it cannot store, wherever it is bound", async () => {
    const db = await stops();
    const date = new Date("2026-08-10");

    await expect(db.insertInto("stops").values({ crs: date as any, name: "Brighton" }).execute())
      .rejects.toThrow(/cannot store/);

    await expect(db.insertInto("stops").values({ crs: "BTN", name: date as any }).execute())
      .rejects.toThrow(/cannot store|cannot be bound/);

    expect((await db.selectFrom("stops").selectAll().execute()).length).to.equal(0);

    await db.destroy();
  });

  /**
   * A command that never runs a query should not leave a database behind: --download-timetable
   * writes files and imports nothing, and it created an empty one because the dialect opened the
   * file as it was built rather than when it was first used.
   */
  it("opens the file when the first query runs, not when the dialect is built", async () => {
    const filename = path.join(fs.mkdtempSync(path.join(os.tmpdir(), "dtd-sqlite")), "feed.sqlite");
    const db = new Kysely<any>({ dialect: nodeSqliteDialect(filename) });

    expect(fs.existsSync(filename), "before the first query").to.equal(false);

    await db.schema.createTable("t").addColumn("a", sql.raw("text")).execute();

    expect(fs.existsSync(filename), "after it").to.equal(true);

    await db.destroy();
  });

});

/**
 * An in memory database with a single table to work against
 */
async function stops(): Promise<Kysely<any>> {
  const db = new Kysely<any>({ dialect: nodeSqliteDialect(":memory:") });

  await db.schema
    .createTable("stops")
    .addColumn("id", "integer", column => column.primaryKey().autoIncrement())
    .addColumn("crs", sql.raw("text"), column => column.notNull())
    .addColumn("name", sql.raw("text"), column => column.notNull())
    .addColumn("platforms", sql.raw("integer"))
    .execute();

  return db;
}
