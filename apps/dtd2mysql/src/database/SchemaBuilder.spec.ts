import {describe, it, expect} from 'vitest';
import {Kysely} from "kysely";
import {SchemaBuilder} from "./SchemaBuilder";
import {SchemaDialect} from "./SchemaDialect";
import {mysqlSchemaDialect, postgresSchemaDialect, sqliteSchemaDialect} from "./dialect";
import {NodeSqliteDialect} from "./NodeSqliteDriver";
import {recording} from "./testing/recording";
import {Table} from "./Schema";
import {feedTables, intTable, testTable} from "./testing/records";

describe("SchemaBuilder", () => {
  const test = testTable();

  it("drops a table", async () => {
    const [statement] = await compile(mysqlSchemaDialect, "test", test, schema => schema.dropSchema());

    expect(statement).to.equal("drop table if exists `test`");
  });

  it("creates a mysql table", async () => {
    const [create, ...indexes] = await compile(mysqlSchemaDialect, "test", test, schema => schema.createSchema());

    expect(create).to.equal(
      "create table if not exists `test` (" +
      "`id` int(11) unsigned not null primary key auto_increment, " +
      "`field` smallint(4) unsigned not null, " +
      "`field2` char(3) not null, " +
      "`field3` char(5) not null, " +
      "`field4` varchar(5) not null, " +
      "`field5` date not null, " +
      "`field6` time, " +
      "`field7` tinyint(1) unsigned not null, " +
      "`field8` double(7, 5) unsigned not null, " +
      "constraint `test_key` unique (`field`, `field4`))"
    );

    expect(indexes).to.deep.equal([
      "create index `test_field5_idx` on `test` (`field5`)",
      "create index `test_field6_idx` on `test` (`field6`)"
    ]);
  });

  it("creates a postgres table without unsigned types", async () => {
    const [create] = await compile(postgresSchemaDialect, "test", test, schema => schema.createSchema());

    expect(create).to.equal(
      'create table if not exists "test" (' +
      '"id" serial primary key, ' +
      '"field" smallint not null, ' +
      '"field2" varchar(3) not null, ' +
      '"field3" varchar(5) not null, ' +
      '"field4" varchar(5) not null, ' +
      '"field5" date not null, ' +
      '"field6" time, ' +
      '"field7" smallint not null, ' +
      '"field8" double precision not null, ' +
      'constraint "test_key" unique ("field", "field4"))'
    );
  });

  it("creates a sqlite table using storage classes", async () => {
    const [create] = await compile(sqliteSchemaDialect, "test", test, schema => schema.createSchema());

    expect(create).to.equal(
      'create table if not exists "test" (' +
      '"id" integer primary key autoincrement, ' +
      '"field" integer not null, ' +
      '"field2" text not null, ' +
      '"field3" text not null, ' +
      '"field4" text not null, ' +
      '"field5" text not null, ' +
      '"field6" text, ' +
      '"field7" integer not null, ' +
      '"field8" numeric not null, ' +
      'constraint "test_key" unique ("field", "field4"))'
    );
  });

  it("picks the smallest mysql integer type that fits", async () => {
    const types = await Promise.all([2, 4, 7, 9, 12].map(async length => {
      const [create] = await compile(mysqlSchemaDialect, "ints", intTable(length), schema => schema.createSchema());

      return create.match(/`sized` (\w+)/)?.[1];
    }));

    expect(types).to.deep.equal(["tinyint", "smallint", "mediumint", "int", "bigint"]);
  });

  it("creates the schema in a real sqlite database", async () => {
    const db = new Kysely<any>({ dialect: new NodeSqliteDialect(":memory:") });
    const schema = new SchemaBuilder(db, sqliteSchemaDialect, "test", test);

    await schema.createSchema();
    // a full refresh drops and recreates, so both have to work against a live database
    await schema.dropSchema();
    await schema.createSchema();

    await db.insertInto("test").values({
      field: 1, field2: "002", field3: "three", field4: "four", field5: "2023-11-20",
      field6: "09:15:00", field7: 1, field8: 1.5
    }).execute();

    const rows = await db.selectFrom("test").selectAll().execute();

    expect(rows.length).to.equal(1);
    expect(rows[0].id).to.equal(1);
    expect(rows[0].field5).to.equal("2023-11-20");

    await db.destroy();
  });

  it("creates the schema twice without failing on the indexes", async () => {
    const db = new Kysely<any>({ dialect: new NodeSqliteDialect(":memory:") });
    const schema = new SchemaBuilder(db, sqliteSchemaDialect, "test", test);

    await schema.createSchema();
    await schema.createSchema();

    expect((await db.selectFrom("test").selectAll().execute()).length).to.equal(0);

    await db.destroy();
  });

  it("creates every declared table", async () => {
    const tables = feedTables();

    expect(tables.length).to.be.greaterThan(0);

    // sqlite is executed for real and the others are compiled, so a column with no type fails either way
    const sqlite = new Kysely<any>({ dialect: new NodeSqliteDialect(":memory:") });

    for (const [name, feedTable] of tables) {
      await new SchemaBuilder(sqlite, sqliteSchemaDialect, name, feedTable).createSchema();
      await compile(mysqlSchemaDialect, name, feedTable, schema => schema.createSchema());
      await compile(postgresSchemaDialect, name, feedTable, schema => schema.createSchema());
    }

    expect((await sqlite.introspection.getTables()).length).to.be.greaterThan(0);

    await sqlite.destroy();
  });

});

/**
 * Run a schema operation against a driver that records the SQL instead of executing it
 */
async function compile(dialect: SchemaDialect, name: string, table: Table, operation: (schema: SchemaBuilder) => Promise<void>): Promise<string[]> {
  const { db, statements } = recording(dialect.name);

  await operation(new SchemaBuilder(db, dialect, name, table));
  await db.destroy();

  return statements;
}
