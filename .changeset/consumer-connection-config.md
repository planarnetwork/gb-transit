---
"dtd2mysql": minor
---

Let the consumer configure the database connection directly, with `DATABASE_URL` for a connection
string and `DATABASE_OPTIONS` for anything else, both handed to the driver as they are.

Kysely models no connection configuration of its own - every dialect takes the driver's object and
says nothing about how it was built - and this now follows it. The shared `DatabaseConfiguration`
was mysql2's shape under a neutral name: it carried `multipleStatements` and `dateStrings`, which
only mysql2 has, and `connectionLimit`, which pg calls `max`. MySQL took it through a double cast
and Postgres destructured six fields out of it and dropped the rest, so anything a driver supported
beyond those six was unreachable. A unix socket was the example: `socketPath` is a mysql2 option and
a host naming a directory is a pg one, and neither could be asked for.

The dialect comes from the URL's scheme, so `postgresql://` needs no `DATABASE_DIALECT` beside it.
A scheme with no dialect is an error rather than a fall back to MySQL. The named variables still
work unchanged, and `DATABASE_DIALECT` still wins, so an existing install is unaffected.

SQLite has no server to address, so a URL only names its file; `DATABASE_OPTIONS` carries the
options `node:sqlite` itself takes, such as `readOnly` and `timeout`.

`dateStrings` and the Postgres date and timestamp parsers are applied over whatever is given. They
are not preferences: the declared column types say a date is a string, and reading one should not
depend on the timezone of the machine reading it.
