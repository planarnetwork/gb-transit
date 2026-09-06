import {DialectName} from "./SchemaDialect";

export interface DatabaseConnection {
  getConnection(): Promise<DatabaseConnection>;
  query<RowType = unknown>(sql: any, parameters?: any[]): Promise<[RowType[], any]>;
  end(): Promise<void>;
  release(): Promise<void>;
}

export interface DatabaseConfiguration {
  dialect: DialectName,
  host: string,
  user: string,
  password: string | null,
  database: string,
  connectionLimit: number,
  multipleStatements: boolean,
  port: number,
  dateStrings: boolean,
  promise?: any
}
