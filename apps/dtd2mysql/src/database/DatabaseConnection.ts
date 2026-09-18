export interface DatabaseConnection {
  getConnection(): Promise<DatabaseConnection>;
  query<RowType = unknown>(sql: any, parameters?: any[]): Promise<[RowType[], any]>;
  end(): Promise<void>;
  release(): Promise<void>;
}
