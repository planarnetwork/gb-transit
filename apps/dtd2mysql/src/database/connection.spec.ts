import {afterEach, beforeEach, describe, expect, it} from "vitest";
import {consumerOptions, databaseUrl, dialectName, mysqlOptions, postgresOptions, sqliteOptions} from "./connection";

describe("the database connection", () => {
  const environment = process.env;

  beforeEach(() => {
    process.env = {...environment};

    for (const name of Object.keys(process.env).filter(n => n.startsWith("DATABASE_"))) {
      delete process.env[name];
    }
  });

  afterEach(() => {
    process.env = environment;
  });

  describe("the dialect", () => {

    it("defaults to mysql, so an install that says nothing is unaffected", () => {
      process.env.DATABASE_NAME = "feed";

      expect(dialectName()).to.equal("mysql");
    });

    it("comes from the URL's scheme", () => {
      for (const [url, dialect] of [
        ["mysql://localhost/feed", "mysql"],
        ["mariadb://localhost/feed", "mysql"],
        ["postgres://localhost/feed", "postgres"],
        ["postgresql://localhost/feed", "postgres"],
        ["sqlite:/tmp/feed.db", "sqlite"],
        ["file:/tmp/feed.db", "sqlite"]
      ] as const) {
        process.env.DATABASE_URL = url;

        expect(dialectName(), url).to.equal(dialect);
      }
    });

    it("reads the scheme of a URL that names a socket rather than a host", () => {
      // URL rejects this shape, and it is how pg names a unix socket
      process.env.DATABASE_URL = "postgresql://postgres:postgres@/feed?host=/var/run/postgresql";

      expect(dialectName()).to.equal("postgres");
    });

    it("refuses a scheme it has no dialect for, rather than falling back", () => {
      process.env.DATABASE_URL = "oracle://localhost/feed";

      expect(() => dialectName()).to.throw(/scheme "oracle"/);
    });

    it("is overridden by DATABASE_DIALECT", () => {
      process.env.DATABASE_URL = "postgres://localhost/feed";
      process.env.DATABASE_DIALECT = "mysql";

      expect(dialectName()).to.equal("mysql");
    });

    it("rejects a dialect it does not have", () => {
      process.env.DATABASE_DIALECT = "oracle";

      expect(() => dialectName()).to.throw(/Unknown DATABASE_DIALECT/);
    });

  });

  describe("mysql", () => {

    it("hands the URL to the driver rather than taking it apart", () => {
      process.env.DATABASE_URL = "mysql://root@localhost/feed?socketPath=/var/run/mysqld/mysqld.sock";

      // the socket is the driver's option, and nothing here had to know it exists
      expect(mysqlOptions().uri).to.equal(process.env.DATABASE_URL);
      expect(mysqlOptions().host).to.equal(undefined);
    });

    it("uses the named fields when there is no URL", () => {
      process.env.DATABASE_HOSTNAME = "db";
      process.env.DATABASE_PORT = "3307";
      process.env.DATABASE_USERNAME = "feed";
      process.env.DATABASE_NAME = "feed";

      expect(mysqlOptions()).to.include({host: "db", port: 3307, user: "feed", database: "feed"});
    });

    it("merges whatever else the consumer asks for", () => {
      process.env.DATABASE_NAME = "feed";
      process.env.DATABASE_OPTIONS = '{"connectionLimit":5,"charset":"utf8mb4","ssl":{"rejectUnauthorized":false}}';

      expect(mysqlOptions()).to.include({connectionLimit: 5, charset: "utf8mb4"});
      expect(mysqlOptions().ssl).to.deep.equal({rejectUnauthorized: false});
    });

    it("keeps dateStrings whatever the consumer says, because the column types depend on it", () => {
      process.env.DATABASE_NAME = "feed";
      process.env.DATABASE_OPTIONS = '{"dateStrings":false}';

      expect(mysqlOptions().dateStrings).to.equal(true);
    });

  });

  describe("postgres", () => {

    it("hands the URL to the driver", () => {
      process.env.DATABASE_URL = "postgresql://postgres@/feed?host=/var/run/postgresql";

      expect(postgresOptions().connectionString).to.equal(process.env.DATABASE_URL);
    });

    it("sizes the pool with pg's own name for it", () => {
      process.env.DATABASE_NAME = "feed";

      expect(postgresOptions().max).to.equal(20);

      process.env.DATABASE_OPTIONS = '{"max":4,"application_name":"dtd2mysql"}';

      expect(postgresOptions()).to.include({max: 4, application_name: "dtd2mysql"});
    });

  });

  describe("sqlite", () => {

    it("takes the file from DATABASE_NAME", () => {
      process.env.DATABASE_NAME = "/tmp/feed.db";

      expect(sqliteOptions().filename).to.equal("/tmp/feed.db");
    });

    it("takes the file from a URL, whichever scheme names it", () => {
      for (const url of ["sqlite:/tmp/feed.db", "file:/tmp/feed.db", "sqlite:///tmp/feed.db"]) {
        process.env.DATABASE_URL = url;

        expect(sqliteOptions().filename, url).to.equal("/tmp/feed.db");
      }
    });

    // node:sqlite waits no time at all by default, so a lock another writer holds is an instant failure
    it("waits for a lock rather than failing on it, unless the consumer says otherwise", () => {
      process.env.DATABASE_NAME = ":memory:";

      expect(sqliteOptions().options.timeout).to.equal(5000);

      process.env.DATABASE_OPTIONS = '{"timeout":0}';

      expect(sqliteOptions().options.timeout).to.equal(0);
    });

    it("passes the driver's own options through", () => {
      process.env.DATABASE_NAME = ":memory:";
      process.env.DATABASE_OPTIONS = '{"readOnly":true,"timeout":5000}';

      expect(sqliteOptions().options).to.deep.equal({readOnly: true, timeout: 5000});
    });

  });

  it("says so when DATABASE_OPTIONS is not JSON", () => {
    process.env.DATABASE_OPTIONS = "max=4";

    expect(() => consumerOptions()).to.throw(/DATABASE_OPTIONS is not valid JSON/);
  });

  it("asks for a name only when there is no URL to take one from", () => {
    expect(() => mysqlOptions()).to.throw(/DATABASE_NAME/);

    process.env.DATABASE_URL = "mysql://localhost/feed";

    expect(databaseUrl()).to.equal("mysql://localhost/feed");
    expect(() => mysqlOptions()).to.not.throw();
  });

});
