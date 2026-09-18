import {DatabaseSync, DatabaseSyncOptions, SQLInputValue} from "node:sqlite";
import {Dialect, SqliteDatabase, SqliteDialect, SqliteStatement} from "kysely";

/**
 * node:sqlite as the database Kysely's own SQLite dialect takes.
 *
 * That dialect does not depend on better-sqlite3 - it asks for anything with close() and prepare(),
 * which is why the driver, the transactions, the savepoints and the streaming do not have to be
 * written again here. The two differ in three small ways, and this is those three:
 *
 *   better-sqlite3 takes bound parameters as an array, node:sqlite as arguments
 *   better-sqlite3 says whether a statement returns rows with reader, node:sqlite with columns()
 *   node:sqlite binds a narrower set of values than the query builder produces
 */
export function nodeSqliteDatabase(filename: string, options: DatabaseSyncOptions = {}): SqliteDatabase {
  const database = new DatabaseSync(filename, options);

  return {
    close: () => database.close(),
    prepare: (sql: string): SqliteStatement => {
      const statement = database.prepare(sql);

      return {
        // a statement with no result columns is an insert, update, delete or DDL statement
        get reader() {
          return statement.columns().length > 0;
        },
        all: parameters => statement.all(...bind(parameters)),
        run: parameters => statement.run(...bind(parameters)),
        iterate: parameters => statement.iterate(...bind(parameters)) as IterableIterator<unknown>
      };
    }
  };
}

/**
 * node:sqlite binds null, numbers, bigints, strings and buffers, so the values the feed produces are
 * converted to the closest equivalent.
 *
 * Anything else is refused here rather than passed on, because the values are spread into the call as
 * arguments and node:sqlite reads an object in the first of them as a set of named parameters. A Date
 * bound to the first placeholder is therefore read as no named parameters at all, every later value
 * slides one place towards it, and the row is stored wrong without an error. In any other position
 * the same value is refused, which is what this makes it everywhere.
 */
function bind(parameters: ReadonlyArray<unknown>): SQLInputValue[] {
  return parameters.map((parameter, position) => {
    if (parameter === undefined) return null;
    if (typeof parameter === "boolean") return parameter ? 1 : 0;

    if (parameter !== null && typeof parameter === "object" && !isBuffer(parameter)) {
      throw new TypeError(
        `Parameter ${position + 1} is a ${parameter.constructor?.name ?? "object"}, which SQLite cannot store.`
      );
    }

    return parameter as SQLInputValue;
  });
}

const isBuffer = (value: object): boolean => ArrayBuffer.isView(value) || value instanceof ArrayBuffer;

/**
 * Kysely's SQLite dialect, over the SQLite built in to Node
 */
export function nodeSqliteDialect(filename: string, options: DatabaseSyncOptions = {}): Dialect {
  return new SqliteDialect({ database: nodeSqliteDatabase(filename, options) });
}
