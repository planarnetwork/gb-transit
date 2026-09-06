import {describe, expect, it} from 'vitest';
import {Kysely} from "kysely";
import {TableWriter} from "./TableWriter";
import {NodeSqliteDialect} from "./NodeSqliteDriver";
import {DialectName} from "./SchemaDialect";
import {ParsedRecord, RecordAction} from "@gb-transit/feed-parser";
import {recording} from "./testing/recording";

const row = (action: RecordAction, values: object, keysValues: object = {}): ParsedRecord =>
  ({ action, values, keysValues }) as ParsedRecord;

describe("TableWriter", () => {

  it("buffers until the flush limit is reached", async () => {
    const { db, statements } = recording("mysql");
    const writer = new TableWriter(db, "mysql", "my_table", false, 2);

    await writer.apply(row(RecordAction.Insert, { id: null, some: "value" }));
    expect(statements.length).to.equal(0);

    await writer.apply(row(RecordAction.Insert, { id: null, some: "value" }));
    expect(statements.length).to.equal(1);
  });

  it("flushes whatever is left when it is closed", async () => {
    const { db, statements } = recording("mysql");
    const writer = new TableWriter(db, "mysql", "my_table", false, 100);

    await writer.apply(row(RecordAction.Insert, { id: null, some: "value" }));
    await writer.close();

    expect(statements.length).to.equal(1);
  });

  // each database spells "insert unless it is already there" differently
  it.each([
    ["mysql" as DialectName, "insert ignore into `my_table` (`some`) values (?)"],
    ["sqlite" as DialectName, 'insert or ignore into "my_table" ("some") values (?)'],
    ["postgres" as DialectName, 'insert into "my_table" ("some") values ($1) on conflict do nothing']
  ])("leaves an existing row alone on %s", async (name, sql) => {
    const { db, statements } = recording(name);
    const writer = new TableWriter(db, name, "my_table", false, 1);

    await writer.apply(row(RecordAction.Insert, { id: null, some: "value" }));

    expect(statements[0]).to.equal(sql);
  });

  // the id is the database's to hand out unless the feed generated one, and Postgres rejects a null there
  it("leaves out a null id but keeps a generated one", async () => {
    const { db, statements } = recording("postgres");

    await new TableWriter(db, "postgres", "t", false, 1)
      .apply(row(RecordAction.Insert, { id: null, some: "value" }));

    await new TableWriter(db, "postgres", "t", false, 1)
      .apply(row(RecordAction.Insert, { id: 7, some: "value" }));

    expect(statements[0]).to.contain('("some")');
    expect(statements[1]).to.contain('("id", "some")');
  });

  it("matches each row on its key when deleting", async () => {
    const { db, statements } = recording("mysql");
    const writer = new TableWriter(db, "mysql", "my_table", false, 2);

    await writer.apply(row(RecordAction.Delete, {}, { a: 1, b: 2 }));
    await writer.apply(row(RecordAction.Delete, {}, { a: 3, b: 4 }));

    expect(statements[0]).to.equal(
      "delete from `my_table` where ((`a` = ? and `b` = ?) or (`a` = ? and `b` = ?))"
    );
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
    const db = new Kysely<any>({ dialect: new NodeSqliteDialect(":memory:") });

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

});
