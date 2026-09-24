---
"@gb-transit/feed-parser": patch
"@gb-transit/gtfs": minor
"dtd2mysql": minor
---

Run the import and the GTFS build against Postgres and SQLite as well as MySQL, chosen with
`DATABASE_DIALECT` and defaulting to `mysql`, so an existing install is unaffected.

The tables are declared rather than implied by the feed definitions, and both the schema and the
statements that fill it go through Kysely, so the same declaration produces a MySQL, Postgres or
SQLite table. `--fares-clean`, `--gtfs-import` and the GTFS build follow: the first two were raw
MySQL, and the third reads through the query builder on every database, MySQL included, streaming
the stop times through the driver as it did before.

`pg` and `pg-cursor` are optional peer dependencies, installed by somebody pointing at Postgres.
SQLite needs nothing, so a whole feed can be imported and queried with no server:

```
DATABASE_DIALECT=sqlite DATABASE_NAME=./feed.sqlite dtd2mysql --timetable RJTTFxxx.ZIP
```

Four things in the GTFS queries were MySQL's own spelling rather than portable SQL, and each is
now standard: the null safe `<=>`, `IF`, a fixed link matched on its two codes concatenated, and a
`GROUP BY` naming fewer columns than it selects, which MySQL answers by choosing a row for you and
Postgres rejects. A `char` column is also read the same way everywhere now: MySQL strips the
padding that fills a fixed width field out, Postgres pads it back on, so the import drops it before
writing the row. MySQL's rows do not move.

A value wider than its declared column stops the import of its file with an error naming the
column and the value, on every database. MySQL stored it truncated, which in a key is a different
row; Postgres would refuse it with a less useful message.

`ForeignKeyField` accepts any record with a `lastId` rather than naming the two record classes.

`ScheduleBuilder` gains `loadStream` beside `loadSchedules`, for a source that yields rows rather
than emitting them. The emitter path is untouched.

Fixes a bug in the import: the orphan stop time clean up ran after every feed and named three
timetable tables, so importing any single feed into a database that had never held a timetable
failed on a table that was never created. Invisible where all four feeds share one database.
