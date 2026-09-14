import {DialectName, dialectNames} from "./SchemaDialect";

/**
 * What to hand each database driver, taken from the environment.
 *
 * Kysely models no connection configuration of its own: every dialect takes the driver's object and
 * says nothing about how it was built. This follows that. Rather than a shared shape that has to be
 * translated into each driver's, the consumer configures the driver directly and this only supplies
 * what the rest of the code depends on being true.
 *
 * Three ways in, most specific last:
 *
 *   DATABASE_URL         a connection string, for the drivers that parse one. Everything mysql2 and
 *                        pg accept is reachable through it, including a unix socket, without this
 *                        having to know the option exists.
 *   DATABASE_*           host, port, username, password and name, for the common case.
 *   DATABASE_OPTIONS     JSON merged into whatever the driver is given. The escape hatch for the
 *                        options the two above cannot express, whichever driver it is.
 *
 * Two settings are not preferences and are applied over the top of all of it: MySQL's dateStrings
 * and the Postgres date and timestamp parsers. Both exist so that reading a date back does not
 * depend on the timezone of the machine reading it, and the declared schema types say a date column
 * is a string. Overriding them would not configure the database, it would make the types wrong.
 */

/**
 * The connection string, if the consumer gave one
 */
export function databaseUrl(): string | undefined {
  return process.env.DATABASE_URL || undefined;
}

/**
 * Anything else the consumer wants to hand the driver
 */
export function consumerOptions(): Record<string, unknown> {
  const json = process.env.DATABASE_OPTIONS;

  if (!json) {
    return {};
  }

  try {
    return JSON.parse(json) as Record<string, unknown>;
  }
  catch (err) {
    throw new Error(`DATABASE_OPTIONS is not valid JSON: ${err instanceof Error ? err.message : err}`);
  }
}

/**
 * The database the CLI is pointed at.
 *
 * Taken from the URL's scheme when there is one, so a consumer who gives a URL does not also have to
 * say which database it is for. DATABASE_DIALECT still wins, and is still what an install without a
 * URL sets.
 */
export function dialectName(): DialectName {
  const name = process.env.DATABASE_DIALECT || dialectFromUrl() || "mysql";

  if (!dialectNames.includes(name as DialectName)) {
    throw new Error(`Unknown DATABASE_DIALECT "${name}", expected one of ${dialectNames.join(", ")}.`);
  }

  return name as DialectName;
}

const SCHEMES: { [scheme: string]: DialectName } = {
  "mysql:": "mysql",
  "mariadb:": "mysql",
  "postgres:": "postgres",
  "postgresql:": "postgres",
  "sqlite:": "sqlite",
  "file:": "sqlite"
};

/**
 * The scheme is read with a pattern rather than with URL, which rejects the hostless form a socket
 * connection uses - postgresql://user@/database?host=/var/run/postgresql is how pg names one.
 *
 * A scheme with no dialect is an error rather than a fall back to the default: a Postgres URL quietly
 * handed to mysql2 fails somewhere much less obvious than here.
 */
function dialectFromUrl(): DialectName | undefined {
  const url = databaseUrl();

  if (!url) {
    return undefined;
  }

  const scheme = /^([a-z][a-z0-9+.-]*):/i.exec(url)?.[1].toLowerCase();
  const dialect = scheme && SCHEMES[`${scheme}:`];

  if (!dialect) {
    throw new Error(`DATABASE_URL has the scheme "${scheme}", which is not one of ${Object.keys(SCHEMES).join(" ")}.`);
  }

  return dialect;
}

/**
 * The options for a mysql2 pool.
 *
 * mysql2 parses the uri itself and copies every query parameter into its options, so the whole
 * driver surface is reachable through DATABASE_URL. It only takes a parsed value where the option is
 * not already set, which is what makes the ordering here hold.
 */
export function mysqlOptions(): Record<string, unknown> {
  return {
    connectionLimit: 20,
    multipleStatements: true,
    ...(databaseUrl() ? { uri: databaseUrl() } : fields()),
    ...consumerOptions(),
    // see the note at the top: this one is not a preference
    dateStrings: true
  };
}

/**
 * The options for a pg pool.
 *
 * pg reads a connection string the same way, including a host that names a socket directory. Its
 * pool size is max rather than mysql2's connectionLimit.
 */
export function postgresOptions(): Record<string, unknown> {
  return {
    max: 20,
    ...(databaseUrl() ? { connectionString: databaseUrl() } : fields()),
    ...consumerOptions()
  };
}

/**
 * Where the SQLite file lives, and what to open it with.
 *
 * There is no server to address, so a URL only says which file. node:sqlite takes its own options -
 * readOnly, timeout, enableForeignKeyConstraints - which come through DATABASE_OPTIONS.
 */
export function sqliteOptions(): { filename: string, options: Record<string, unknown> } {
  const url = databaseUrl();

  return {
    filename: url ? url.replace(/^(sqlite|file):(\/\/)?/, "") : databaseName(),
    options: consumerOptions()
  };
}

/**
 * The connection fields, for an install that names them rather than giving a URL
 */
function fields(): Record<string, unknown> {
  return {
    host: process.env.DATABASE_HOSTNAME || "localhost",
    port: +(process.env.DATABASE_PORT || defaultPort()),
    user: process.env.DATABASE_USERNAME || "root",
    password: process.env.DATABASE_PASSWORD || undefined,
    database: databaseName()
  };
}

/**
 * The database name is only needed when there is no URL to take it from
 */
function databaseName(): string {
  if (!process.env.DATABASE_NAME) {
    throw new Error("Please set the DATABASE_NAME environment variable, or DATABASE_URL.");
  }

  return process.env.DATABASE_NAME;
}

function defaultPort(): number {
  return dialectName() === "postgres" ? 5432 : 3306;
}
