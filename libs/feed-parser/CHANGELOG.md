# @gb-transit/feed-parser

## 1.0.1

### Patch Changes

- 85add7a: Run the import and the GTFS build against Postgres and SQLite as well as MySQL, chosen with
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

## 1.0.0

### Major Changes

- Realign the published version with the registry.

  `yarn release` published every workspace whether or not its version had moved, so a
  package with nothing to say failed the run on "cannot publish over the previously
  published versions" and took the packages that did have something to say down with it.
  Five releases died that way, from 2 September on: the registry stayed where it was while
  master went on bumping numbers that nobody could install.

  Those numbers are abandoned rather than published. Every `@gb-transit` package is
  released here at 1.0.0 - a major, because the last version installable from npm is
  0.2.0 and this is not what that number promises.

  Nothing in this package has changed since 0.2.0. The version moves so that
  the set is on one number again, and so that the next change to it is described against a
  version that exists.

## 0.2.0

### Minor Changes

- b2d81cf: Republish the workspace libraries, which the CLI can no longer run without.

  Every `@gb-transit` package is published at 0.1.0 and every one of them has
  changed since, but the changesets to date bump only `dtd2mysql`. `dtd2mysql`
  depends on them with `workspace:^`, which packs as `^0.1.0`, so releasing the
  CLI on its own would resolve the libraries from the registry at the version that
  predates the restructure - and 0.1.0 does not export `interchange`,
  `withStopPoints`, `toStopRow`, `mergeTransfers` or `createFeedInfo`, all of
  which the CLI now imports. The installed CLI would not start.

  The `package` CI job installs from tarballs built in the same run, so it proves
  the packaging metadata and cannot see this. Nothing has been released yet, so
  the fix is to publish the libraries alongside the CLI rather than to repair
  anything.

## 0.1.0

### Minor Changes

- 0f61a32: Split the tool into a monorepo.

  `dtd2mysql` is now assembled from five `@gb-transit` packages rather than one flat tree,
  and they are published in their own right: a GTFS build that reads from somewhere other
  than this tool's MySQL schema can depend on `@gb-transit/gtfs` without the CLI.

  **The command line is unchanged.** Same flags, same environment variables, same GTFS
  output - verified byte-identical against the same database before and after the move. If
  you install `dtd2mysql` to run it, nothing about this release asks anything of you.

  **The package layout is not**, which is why this is a major. Anything importing from the
  package rather than running it has to move:

  - `dtd2mysql/dist/src/...` and `dtd2mysql/dist/config/...` no longer exist. That code is
    in the `@gb-transit` package that now owns it - record layouts in `dtd-schema`, the
    parser in `feed-parser`, the GTFS model, transforms and build in `gtfs`, the writers in
    `gtfs-output`, SFTP and feed sequencing in `dtd-source`.
  - `files` is `dist` and `bin`. `main` and `types` resolve to `dist/index.js` and
    `dist/index.d.ts`, which is where they are emitted - `main` previously named a path that
    the `files` list did not ship, so `require("dtd2mysql")` never worked.
