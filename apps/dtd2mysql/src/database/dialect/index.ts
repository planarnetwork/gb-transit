import {DialectName, SchemaDialect} from "../SchemaDialect";
import {mysqlSchemaDialect} from "./MySQL";
import {postgresSchemaDialect} from "./Postgres";
import {sqliteSchemaDialect} from "./SQLite";

export {mysqlSchemaDialect, postgresSchemaDialect, sqliteSchemaDialect};

const schemaDialects: { [name in DialectName]: SchemaDialect } = {
  mysql: mysqlSchemaDialect,
  postgres: postgresSchemaDialect,
  sqlite: sqliteSchemaDialect
};

export function getSchemaDialect(name: DialectName): SchemaDialect {
  return schemaDialects[name];
}
