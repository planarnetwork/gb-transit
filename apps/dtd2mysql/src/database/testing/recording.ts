import {
  CompiledQuery,
  DatabaseConnection,
  DatabaseIntrospector,
  Dialect,
  Driver,
  Kysely,
  MysqlAdapter,
  MysqlIntrospector,
  MysqlQueryCompiler,
  PostgresAdapter,
  PostgresIntrospector,
  PostgresQueryCompiler,
  QueryResult,
  SqliteAdapter,
  SqliteIntrospector,
  SqliteQueryCompiler
} from "kysely";
import {DialectName} from "../SchemaDialect";

/**
 * A Kysely instance that records the SQL it would run instead of running it, so that the statement each
 * database gets can be asserted without one of each database to hand.
 */
export function recording(name: DialectName): { db: Kysely<any>, statements: string[] } {
  const statements: string[] = [];

  return { db: new Kysely<any>({ dialect: new RecordingDialect(name, statements) }), statements };
}

class RecordingDialect implements Dialect {

  constructor(
    private readonly name: DialectName,
    private readonly statements: string[]
  ) {}

  public createAdapter() {
    switch (this.name) {
      case "mysql": return new MysqlAdapter();
      case "postgres": return new PostgresAdapter();
      case "sqlite": return new SqliteAdapter();
    }
  }

  public createQueryCompiler() {
    switch (this.name) {
      case "mysql": return new MysqlQueryCompiler();
      case "postgres": return new PostgresQueryCompiler();
      case "sqlite": return new SqliteQueryCompiler();
    }
  }

  public createIntrospector(db: Kysely<any>): DatabaseIntrospector {
    switch (this.name) {
      case "mysql": return new MysqlIntrospector(db);
      case "postgres": return new PostgresIntrospector(db);
      case "sqlite": return new SqliteIntrospector(db);
    }
  }

  public createDriver(): Driver {
    return new RecordingDriver(this.statements);
  }

}

class RecordingDriver implements Driver {

  constructor(private readonly statements: string[]) {}

  public async init(): Promise<void> {}

  public async acquireConnection(): Promise<DatabaseConnection> {
    const statements = this.statements;

    return {
      async executeQuery<O>(compiledQuery: CompiledQuery): Promise<QueryResult<O>> {
        statements.push(compiledQuery.sql);

        return { rows: [] };
      },
      async* streamQuery<O>(): AsyncIterableIterator<QueryResult<O>> {}
    };
  }

  // the driver is asked to start and finish a transaction rather than being sent SQL for it, so these
  // are recorded too and a statement that has to be atomic can be told apart from one that does not
  public async beginTransaction(): Promise<void> {
    this.statements.push("begin");
  }

  public async commitTransaction(): Promise<void> {
    this.statements.push("commit");
  }

  public async rollbackTransaction(): Promise<void> {
    this.statements.push("rollback");
  }

  public async releaseConnection(): Promise<void> {}
  public async destroy(): Promise<void> {}

}
