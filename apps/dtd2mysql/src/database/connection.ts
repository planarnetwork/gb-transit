import mysql2 from "mysql2";
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
 * say which database it is for. DATABASE_DIALECT is what an install without a URL sets, and naming a
 * different database from the URL's scheme is an error.
 */
export function dialectName(): DialectName {
  // read whether or not DATABASE_DIALECT is set, so an unreadable scheme is reported rather than
  // skipped - a Postgres URL handed to mysql2 because the dialect said mysql fails somewhere much
  // less obvious than here, which is the failure this exists to catch
  const fromUrl = dialectFromUrl();
  const named = process.env.DATABASE_DIALECT;

  if (!named) {
    return fromUrl ?? "mysql";
  }

  if (!dialectNames.includes(named as DialectName)) {
    throw new Error(`Unknown DATABASE_DIALECT "${named}", expected one of ${dialectNames.join(", ")}.`);
  }

  if (fromUrl && fromUrl !== named) {
    throw new Error(`DATABASE_DIALECT says ${named}, but DATABASE_URL is a ${fromUrl} URL.`);
  }

  return named as DialectName;
}

/**
 * Whether the consumer has named a database at all.
 *
 * What a command asks before deciding there is one to read: downloading does not need a database,
 * and it is answered here because this is what reads the environment. Either a URL or a name counts,
 * so an install configured by URL alone still has a feed cursor.
 */
export function databaseConfigured(): boolean {
  return databaseUrl() !== undefined || process.env.DATABASE_NAME !== undefined;
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
 * The URL is read by mysql2's own parser, which copies every query parameter into its options, so
 * the whole driver surface is reachable through DATABASE_URL. It is parsed here rather than handed
 * over as a uri because mysql2 merges a uri over its options on truthiness - `if (options[key])
 * continue` - so a false or an empty string in DATABASE_OPTIONS would lose to the URL, which is the
 * opposite of what this file and the README promise. Parsed first and spread over, the ordering is
 * the ordering.
 */
export function mysqlOptions(): Record<string, unknown> {
  const url = databaseUrl();

  return {
    connectionLimit: 20,
    ...(url ? parseMysqlUrl(url) : fields()),
    ...consumerOptions(),
    // see the note at the top: this one is not a preference
    dateStrings: true
  };
}

/**
 * mysql2's own URL parser, which is what it runs over a uri it is handed.
 *
 * The package exports it; its typings describe only the interface of the same name, so the shape is
 * stated here. Using it rather than writing one means every URL mysql2 accepts still works,
 * including the query parameters it reads as options.
 */
const parseMysqlUrl: (url: string) => Record<string, unknown> =
  (mysql2 as unknown as { ConnectionConfig: { parseUrl(url: string): Record<string, unknown> } })
    .ConnectionConfig.parseUrl;

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
 *
 * The busy timeout defaults to none at all, which makes a lock held by anything else an immediate
 * failure rather than a wait, so one is set here. A consumer who wants a different wait, or none,
 * says so in DATABASE_OPTIONS.
 */
export function sqliteOptions(): { filename: string, options: Record<string, unknown> } {
  return {
    filename: sqliteFilename(),
    options: { timeout: SQLITE_BUSY_TIMEOUT, ...consumerOptions() }
  };
}

/**
 * The file a URL names.
 *
 * node:sqlite opens a path rather than a URI, so a query string is not something it can be given -
 * left on, `file:feed.db?mode=ro` opens a file called `feed.db?mode=ro`. The scheme is checked
 * where the dialect is read, so a URL for another database cannot reach this.
 */
function sqliteFilename(): string {
  const url = databaseUrl();

  if (!url) {
    return databaseName();
  }

  const [filename, query] = url.replace(/^(sqlite|file):(\/\/)?/, "").split("?");

  if (query !== undefined) {
    throw new Error(`DATABASE_URL carries "?${query}", which node:sqlite does not read. Use DATABASE_OPTIONS.`);
  }

  return filename;
}

const SQLITE_BUSY_TIMEOUT = 5000;

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
