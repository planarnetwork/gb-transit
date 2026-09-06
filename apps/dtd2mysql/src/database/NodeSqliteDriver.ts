import {DatabaseSync, SQLInputValue} from "node:sqlite";
import {
  CompiledQuery,
  DatabaseConnection,
  DatabaseIntrospector,
  Dialect,
  Driver,
  Kysely,
  QueryCompiler,
  QueryResult,
  SqliteAdapter,
  SqliteIntrospector,
  SqliteQueryCompiler
} from "kysely";

/**
 * A Kysely dialect for the SQLite implementation built in to Node.
 *
 * Kysely ships a SQLite dialect but it requires the better-sqlite3 native module. Using node:sqlite keeps the
 * CLI installable without a build toolchain, which matters for the in memory one shot use case.
 */
export class NodeSqliteDialect implements Dialect {

  constructor(private readonly filename: string) {}

  public createAdapter(): SqliteAdapter {
    return new SqliteAdapter();
  }

  public createDriver(): Driver {
    return new NodeSqliteDriver(this.filename);
  }

  public createIntrospector(db: Kysely<any>): DatabaseIntrospector {
    return new SqliteIntrospector(db);
  }

  public createQueryCompiler(): QueryCompiler {
    return new SqliteQueryCompiler();
  }

}

export class NodeSqliteDriver implements Driver {

  private database?: DatabaseSync;
  private connection?: DatabaseConnection;
  // node:sqlite is synchronous and holds a single handle, so connections are handed out one at a time
  private readonly mutex = new Mutex();

  constructor(private readonly filename: string) {}

  public async init(): Promise<void> {
    this.database = new DatabaseSync(this.filename);
    this.connection = new NodeSqliteConnection(this.database);
  }

  public async acquireConnection(): Promise<DatabaseConnection> {
    await this.mutex.lock();

    if (!this.connection) {
      this.mutex.unlock();

      throw new Error("The SQLite driver has not been initialised");
    }

    return this.connection;
  }

  public async releaseConnection(): Promise<void> {
    this.mutex.unlock();
  }

  public async beginTransaction(connection: DatabaseConnection): Promise<void> {
    await connection.executeQuery(CompiledQuery.raw("begin"));
  }

  public async commitTransaction(connection: DatabaseConnection): Promise<void> {
    await connection.executeQuery(CompiledQuery.raw("commit"));
  }

  public async rollbackTransaction(connection: DatabaseConnection): Promise<void> {
    await connection.executeQuery(CompiledQuery.raw("rollback"));
  }

  public async destroy(): Promise<void> {
    this.database?.close();
    this.database = undefined;
    this.connection = undefined;
  }

}

class NodeSqliteConnection implements DatabaseConnection {

  constructor(private readonly database: DatabaseSync) {}

  public async executeQuery<O>(compiledQuery: CompiledQuery): Promise<QueryResult<O>> {
    const statement = this.database.prepare(compiledQuery.sql);
    const parameters = toSqliteValues(compiledQuery.parameters);

    // a statement with no result columns is an insert, update, delete or DDL statement
    if (statement.columns().length > 0) {
      return { rows: statement.all(...parameters) as O[] };
    }

    const { changes, lastInsertRowid } = statement.run(...parameters);

    return {
      rows: [],
      insertId: BigInt(lastInsertRowid),
      numAffectedRows: BigInt(changes)
    };
  }

  public async* streamQuery<O>(compiledQuery: CompiledQuery): AsyncIterableIterator<QueryResult<O>> {
    const statement = this.database.prepare(compiledQuery.sql);

    for (const row of statement.iterate(...toSqliteValues(compiledQuery.parameters))) {
      yield { rows: [row as O] };
    }
  }

}

/**
 * Serialises access to the single underlying database handle
 */
class Mutex {

  private promise?: Promise<void>;
  private resolve?: () => void;

  public async lock(): Promise<void> {
    while (this.promise) {
      await this.promise;
    }

    this.promise = new Promise(resolve => this.resolve = resolve);
  }

  public unlock(): void {
    const resolve = this.resolve;

    this.promise = undefined;
    this.resolve = undefined;

    resolve?.();
  }

}

/**
 * node:sqlite only binds null, numbers, bigints, strings and buffers so the values the feed produces are
 * converted to the closest equivalent.
 */
function toSqliteValues(parameters: readonly unknown[]): SQLInputValue[] {
  return parameters.map(parameter => {
    if (parameter === undefined) return null;
    if (typeof parameter === "boolean") return parameter ? 1 : 0;

    return parameter as SQLInputValue;
  });
}
