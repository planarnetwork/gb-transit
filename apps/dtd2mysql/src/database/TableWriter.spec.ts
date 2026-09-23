import {describe, expect, it} from 'vitest';
import {Kysely} from "kysely";
import {TableWriter} from "./TableWriter";
import {nodeSqliteDialect} from "./NodeSqliteDatabase";
import {DialectName} from "./SchemaDialect";
import {ParsedRecord, RecordAction} from "@gb-transit/feed-parser";
import {recording} from "./testing/recording";
import {SchemaBuilder} from "./SchemaBuilder";
import {sqliteSchemaDialect} from "./dialect";
import {table, varchar} from "./Schema";

const row = (action: RecordAction, values: object, keysValues: object = {}): ParsedRecord =>
  ({ action, values, keysValues }) as ParsedRecord;

// the statements themselves, without the transaction every flush is written inside
const queries = (statements: string[]) => statements.filter(sql => !["begin", "commit", "rollback"].includes(sql));

describe("TableWriter", () => {

  it("buffers until the flush limit is reached", async () => {
    const { db, statements } = recording("mysql");
    const writer = new TableWriter(db, "mysql", "my_table", false, 2);

    await writer.apply(row(RecordAction.Insert, { id: null, some: "value" }));
    expect(queries(statements).length).to.equal(0);

    await writer.apply(row(RecordAction.Insert, { id: null, some: "value" }));
    expect(queries(statements).length).to.equal(1);
  });

  it("flushes whatever is left when it is closed", async () => {
    const { db, statements } = recording("mysql");
    const writer = new TableWriter(db, "mysql", "my_table", false, 100);

    await writer.apply(row(RecordAction.Insert, { id: null, some: "value" }));
    await writer.close();

    expect(queries(statements).length).to.equal(1);
  });

  /**
   * A flush of any size is several statements once the rows bind more values than one may, and a
   * retry after a lock error sends all of them again - so a chunk that committed on its own would be
   * inserted twice, which the eight tables with no key have no constraint to absorb.
   */
  it("writes a flush inside a transaction, so a retry starts from nothing", async () => {
    const { db, statements } = recording("mysql");
    const writer = new TableWriter(db, "mysql", "my_table", false, 2);

    await writer.apply(row(RecordAction.Insert, { id: null, some: "value" }));
    await writer.apply(row(RecordAction.Insert, { id: null, some: "other" }));

    expect(statements).to.deep.equal([
      "begin",
      "insert into `my_table` (`some`) values (?), (?) on duplicate key update `some` = `some`",
      "commit"
    ]);
  });

  // each database spells "insert unless it is already there" differently
  it.each([
    ["mysql" as DialectName, "insert into `my_table` (`some`) values (?) on duplicate key update `some` = `some`"],
    ["sqlite" as DialectName, 'insert into "my_table" ("some") values (?) on conflict do nothing'],
    ["postgres" as DialectName, 'insert into "my_table" ("some") values ($1) on conflict do nothing']
  ])("leaves an existing row alone on %s", async (name, sql) => {
    const { db, statements } = recording(name);
    const writer = new TableWriter(db, name, "my_table", false, 1);

    await writer.apply(row(RecordAction.Insert, { id: null, some: "value" }));

    expect(queries(statements)[0]).to.equal(sql);
  });

  // the id is the database's to hand out unless the feed generated one, and Postgres rejects a null there
  it("leaves out a null id but keeps a generated one", async () => {
    const { db, statements } = recording("postgres");

    await new TableWriter(db, "postgres", "t", false, 1)
      .apply(row(RecordAction.Insert, { id: null, some: "value" }));

    await new TableWriter(db, "postgres", "t", false, 1)
      .apply(row(RecordAction.Insert, { id: 7, some: "value" }));

    expect(queries(statements)[0]).to.contain('("some")');
    expect(queries(statements)[1]).to.contain('("id", "some")');
  });

  it("matches each row on its key when deleting", async () => {
    const { db, statements } = recording("mysql");
    const writer = new TableWriter(db, "mysql", "my_table", false, 2);

    await writer.apply(row(RecordAction.Delete, {}, { a: 1, b: 2 }));
    await writer.apply(row(RecordAction.Delete, {}, { a: 3, b: 4 }));

    expect(queries(statements)[0]).to.equal(
      "delete from `my_table` where ((`a` = ? and `b` = ?) or (`a` = ? and `b` = ?))"
    );
  });

  // `column = null` is unknown rather than true, so the row would be left where it is
  it("matches a null key column with is null", async () => {
    const { db, statements } = recording("mysql");
    const writer = new TableWriter(db, "mysql", "my_table", false, 1);

    await writer.apply(row(RecordAction.Delete, {}, { a: 1, b: null }));

    expect(queries(statements)[0]).to.equal(
      "delete from `my_table` where (`a` = ? and `b` is null)"
    );
  });

  /**
   * One bracketed group per row, ORed together, is a tree to SQLite, and it refuses one deeper than
   * 1000 - which a two column key reaches at 999 rows, inside a chunk the parameter limit allows.
   */
  it("caps how many rows a delete matches in one statement", async () => {
    const { db, statements } = recording("sqlite");
    const writer = new TableWriter(db, "sqlite", "my_table", false, 1200);
    const rows = Array.from({ length: 1200 }, (_, i) => row(RecordAction.Delete, {}, { a: i, b: i }));

    for (const each of rows) {
      await writer.apply(each);
    }

    expect(queries(statements).length).to.equal(3);
  });

  it("refuses to delete a row it has no key for, rather than emptying the table", async () => {
    const { db } = recording("mysql");
    const writer = new TableWriter(db, "mysql", "my_table", false, 1);

    await expect(writer.apply(row(RecordAction.Delete, {}, {}))).rejects.toThrow(/no key/);
  });

  /**
   * MySQL and SQLite would do this with REPLACE, which Postgres has no equivalent for, so it is spelled
   * out as a delete and an insert and every database ends up with the same rows.
   */
  it("replaces by deleting and inserting inside a transaction", async () => {
    const { db, statements } = recording("postgres");
    const writer = new TableWriter(db, "postgres", "my_table", false, 1);

    await writer.apply(row(RecordAction.Update, { id: 1, some: "value" }, { some: "value" }));

    expect(statements).to.deep.equal([
      "begin",
      'delete from "my_table" where "some" = $1',
      'insert into "my_table" ("id", "some") values ($1, $2) on conflict do nothing',
      "commit"
    ]);
  });

  it("writes and replaces rows in a real database", async () => {
    const db = new Kysely<any>({ dialect: nodeSqliteDialect(":memory:") });

    await db.schema.createTable("t")
      .addColumn("id", "integer", column => column.primaryKey())
      .addColumn("name", "text")
      .addUniqueConstraint("t_key", ["name"])
      .execute();

    const writer = new TableWriter(db, "sqlite", "t", true, 100);

    await writer.apply(row(RecordAction.Insert, { id: 1, name: "first" }));
    await writer.apply(row(RecordAction.Insert, { id: 2, name: "second" }));
    await writer.close();

    // the same key again, with a new id, the way a changes file revises a record
    const update = new TableWriter(db, "sqlite", "t", true, 100);

    await update.apply(row(RecordAction.Update, { id: 3, name: "first" }, { name: "first" }));
    await update.close();

    const rows = await db.selectFrom("t").selectAll().orderBy("id").execute();

    expect(rows).to.deep.equal([{ id: 2, name: "second" }, { id: 3, name: "first" }]);

    await db.destroy();
  });

  /**
   * A duplicate is the one thing the insert is meant to absorb. OR IGNORE absorbed a value that did
   * not fit as well - it skipped the row and said nothing - where MySQL's INSERT IGNORE stored it
   * truncated. A feed whose values have outgrown the columns is worth hearing about.
   */
  it("absorbs a duplicate but not a value that does not fit", async () => {
    const db = new Kysely<any>({ dialect: nodeSqliteDialect(":memory:") });
    const declared = table({ code: varchar(4) }, { key: ["code"] });

    await new SchemaBuilder(db, sqliteSchemaDialect, "t", declared).createSchema();

    const writer = new TableWriter(db, "sqlite", "t", true, 100);

    await writer.apply(row(RecordAction.Insert, { id: null, code: "ABCD" }));
    await writer.apply(row(RecordAction.Insert, { id: null, code: "ABCD" }));
    await writer.close();

    const tooLong = new TableWriter(db, "sqlite", "t", true, 1);

    await expect(tooLong.apply(row(RecordAction.Insert, { id: null, code: "ABCDE" })))
      .rejects.toThrow(/constraint/i);

    expect(await db.selectFrom("t").select("code").execute()).to.deep.equal([{ code: "ABCD" }]);

    await db.destroy();
  });

  /**
   * Deleting by key and inserting would keep the first, because the insert leaves the row it has just
   * written alone, so the flush keeps the last itself - as REPLACE does.
   */
  it("keeps the last revision of a key in one flush", async () => {
    const db = await keyedTable();
    const writer = new TableWriter(db, "sqlite", "t", true, 100);

    await writer.apply(row(RecordAction.Update, { id: 1, k: "A", v: "first" }, { k: "A" }));
    await writer.apply(row(RecordAction.Update, { id: 2, k: "A", v: "second" }, { k: "A" }));
    await writer.close();

    expect(await db.selectFrom("t").selectAll().execute()).to.deep.equal([{ id: 2, k: "A", v: "second" }]);

    await db.destroy();
  });

  // a unique index holds two rows whose keys are null, so nothing else would catch this either
  it("replaces a row whose key column is null", async () => {
    const db = await keyedTable();

    const insert = new TableWriter(db, "sqlite", "t", true, 100);
    await insert.apply(row(RecordAction.Insert, { id: 1, k: null, v: "first" }));
    await insert.close();

    const update = new TableWriter(db, "sqlite", "t", true, 100);
    await update.apply(row(RecordAction.Update, { id: 2, k: null, v: "second" }, { k: null }));
    await update.close();

    expect(await db.selectFrom("t").selectAll().execute()).to.deep.equal([{ id: 2, k: null, v: "second" }]);

    await db.destroy();
  });

  it("deletes more rows than SQLite will take in one expression tree", async () => {
    const db = await keyedTable();

    const insert = new TableWriter(db, "sqlite", "t", true, 5000);
    const update = new TableWriter(db, "sqlite", "t", true, 5000);

    for (let i = 0; i < 1200; i++) {
      await insert.apply(row(RecordAction.Insert, { id: i, k: `K${i}`, v: "value" }));
      await update.apply(row(RecordAction.Delete, {}, { k: `K${i}`, v: "value" }));
    }

    await insert.close();
    await update.close();

    expect(await db.selectFrom("t").selectAll().execute()).to.deep.equal([]);

    await db.destroy();
  });

});

async function keyedTable(): Promise<Kysely<any>> {
  const db = new Kysely<any>({ dialect: nodeSqliteDialect(":memory:") });

  await db.schema.createTable("t")
    .addColumn("id", "integer", column => column.primaryKey())
    .addColumn("k", "text")
    .addColumn("v", "text")
    .addUniqueConstraint("t_key", ["k"])
    .execute();

  return db;
}
