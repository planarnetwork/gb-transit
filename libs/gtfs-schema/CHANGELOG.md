# @gb-transit/gtfs-schema

## 2.3.0

### Minor Changes

- fdd54c1: Updated dependencies. `adm-zip` 0.6.1 is a security fix, and since it is pinned to an exact version,
  installing an earlier release of `dtd2mysql`, `transxchange2gtfs` or `@gb-transit/dtd-source` still
  brings in the vulnerable 0.6.0.
  
  - `dtd2mysql`: `adm-zip` 0.6.1, `kysely` 0.29.7, `mysql2` 3.24.6, `proj4` 2.22.0,
    `temporal-polyfill` 1.0.6, and `pg` 8.23.1 and `pg-cursor` 2.22.1 for the optional Postgres support.
  - `gtfsmerge`: `cheap-ruler` 4.1.1, a new major. The distances it measures between stops are
    unchanged, but it is now published only as an ES module, which `gtfsmerge` loads with `require`.
    Node only does that unflagged from 22.12, so `gtfsmerge` now requires Node 22.12 or later; on 22.0
    to 22.11 it would fail with `ERR_REQUIRE_ESM` as it started.
  - `transxchange2gtfs`: `adm-zip` 0.6.1, `proj4` 2.22.0.
  - `@gb-transit/dtd-source`: `adm-zip` 0.6.1, `temporal-polyfill` 1.0.6.
  - `@gb-transit/gtfs`: `proj4` 2.22.0, `temporal-polyfill` 1.0.6.
  - `@gb-transit/gtfs-schema`: `temporal-polyfill` 1.0.6.

## 2.2.0

### Minor Changes

- 315fec8: Keep the blocks, the shapes and the frequencies a bus feed has.

  `trips.txt` dropped `block_id` and `shape_id` as something "a merge has nothing to put in". That was
  true of two rail feeds and is not true of a bus feed, where both are populated — and dropping
  `shape_id` is what made `shapes.txt` impossible to carry, since nothing would have referenced it.

  Both are now kept, and both are renumbered rather than carried across. A block is one vehicle
  working through a day and a shape is one line on the ground, each named by the feed that published
  it and by nobody else, so two feeds numbering a block `1` do not mean the same vehicle. Carried
  across unchanged they would say a bus continues as a train.

  `shapes.txt` is read in the same pass as the calls, because it needs the same thing to have happened
  first — the trips renumbered — and it is streamed for the same reason they are: a national bus feed's
  shapes.txt is 2.5GB, more than the calls. A shape no surviving trip is drawn along is dropped.

  `frequencies.txt` is held rather than streamed, because the whole national bus feed has 81 of these
  rows, and each is renumbered onto its trip's new id or dropped with a trip that did not survive.

  `frequencies.txt` was not a file `@gb-transit/gtfs-schema` or `@gb-transit/gtfs-loader` knew about.
  Both now do: the schema gains `Frequency`, `FrequencyRow` and the file's columns, and the loader
  reads it.

  Merging the published rail feed with the Bus Open Data Service's Wales feed now produces fourteen
  files rather than eight, and every reference in it — 334,972 trips, 4,561,198 calls, 2,859,358 shape
  points, 1,204 area memberships — points at a row that is in the feed.

## 2.1.0

### Minor Changes

- 4941620: Lower the engine floor from Node 26 to Node 22, with Temporal from `temporal-polyfill`.

  Node 26 was required for one reason: it is the first release to expose `Temporal` as a global,
  and the calendar is written against it. That put every package on a runtime that will not be LTS
  until October, for an API the rest of the code does not care about the provenance of.

  `temporal-polyfill` provides it, and hands over to the built-in global wherever there is one, so
  Node 26 runs exactly the implementation it ran before — the import resolves to the same object.
  Where `Temporal` was reached as a global it is now imported, which is the whole of the change to
  the date handling: the polyfill exports it as a namespace, so the declarations still read
  `Temporal.PlainDate`, and the pinned type surface has not moved.

  CI runs 22 and 26 rather than 26 alone. `lib` drops from `esnext` to `es2024` so that an API the
  floor does not have cannot be typed as though it did — which is also what proves the global is
  gone, since a missed call site no longer compiles.

  One thing was genuinely broken below Node 24 rather than merely unavailable. `FeedZip` reports
  the file and the line a CIF record failed to parse on by throwing from a `data` listener, and an
  error thrown there only reaches `finished()` from Node 24 onwards; on 22 it escaped as an uncaught
  exception and the stream never settled. It destroys the stream with that error instead, which
  reports the same thing on every version.

## 2.0.0

### Major Changes

- 610f8ef: Absorb gtfsmerge and transxchange2gtfs, and give every producer one schema

  The GTFS schema was written down four times across three repositories, in
  three incompatible ways, and only one of them type checked. It is now written
  once, in `@gb-transit/gtfs-schema`, and a producer declares which columns of
  which file it writes.

  **`@gb-transit/gtfs-schema`** — `GTFSOutput` moves here from `@gb-transit/gtfs`,
  which re-exports it. New `Columns`, `FileSchema` and `fileSchema`, and a new
  `Shape`/`ShapeRow`. `StopTime.stop_headsign` was typed `null` and is now
  `string | null` — `Headsigns.ts` already put a string there through
  `Object.assign`, so this is a correction. `Trip` gains optional `block_id` and
  `shape_id` and its `service_id` accepts a string; `StopRow` loosens
  `location_type`, `zone_id`, `stop_code`, `stop_desc` and `stop_url`, and its
  coordinates accept text so a value that arrived as `51.50740` does not
  re-serialise a digit short; `Transfer`'s twelve producer extensions and its two
  trip ids become optional; `RouteType` gains `Air`.

  **`@gb-transit/gtfs` and `@gb-transit/gtfs-output`** — `GTFSOutput.open` takes
  the columns and returns a `RowWriter<R>` rather than a `Writable`, and
  `extensionFile` takes columns. `csv-write-stream` is replaced by `CSVRowWriter`, which
  writes the header when the file is opened - so a file with no rows is an empty
  table rather than an empty file. Its escaping is a transcription of
  csv-write-stream's rule rather than a differential result: the committed goldens
  are unchanged, and the cases they do not reach are written down in
  `CSVRowWriter.spec.ts`.
  `writeZip` is exported so all three tools share one deterministic archiver.

  **`@gb-transit/gtfs-loader`** gains `readFeed` and `readFeedRows`: the same feed
  read as the rows it was written as, every file and every column, for a tool that
  rewrites a feed rather than plans over one. Built from the parts `loadGTFS`
  already used.
  **`@gb-transit/naptan`** is new: the NaPTAN download, cache and CSV read, with
  no other dependency, so a bus converter does not inherit a rail transit model to
  get them.

  **`cif2gtfs` and `dtd2mysql`** — the SPI change, and `cif2gtfs`'s `main` points
  at `dist/api.js` so requiring the package no longer runs a build.

  **`transxchange2gtfs`** — behaviour is the same except: a file with no rows now
  has a header rather than being empty; a value containing a newline is quoted;
  an absent value is empty rather than the text `undefined`; NaPTAN is read by
  column name from the current DfT endpoint rather than by slicing the national
  CSV at fixed positions, and `--naptan <file>` reads it from disk; the zip is
  written in process, so `zip` is no longer required on PATH; and
  `bin/transxchange2gtfs.sh` required a path the build never produced, so the
  published CLI could not have run at all.

  **`gtfsmerge`** — behaviour is the same except for five fixes, each written up
  in `apps/gtfsmerge/fixtures/BASELINE.md`. Generated walk transfer distances were
  wrong twice over: the ruler was calibrated at 46°N, central France, and the
  coordinates were passed to it as `[latitude, longitude]` where it takes
  `[longitude, latitude]` — together about 70% too long. `--no-date-filter`
  dropped every calendar in every feed rather than keeping them. Transfers to a
  stop nothing calls at were written, leaving dangling references. A call moved
  from a platform onto its station left the station as `location_type` 1, which
  GTFS forbids for a stop something calls at. `transfers.txt` now carries
  `from_trip_id` and `to_trip_id` and renumbers them, so a coupling survives the
  merge, and `stops.txt` carries `platform_code`. `--ruler-latitude` and
  `--date-filter` are new, `zip` is no longer required on PATH, and `main` points
  at `dist/api.js`.

## 1.0.0

### Major Changes

- Split the GTFS vocabulary out of `@gb-transit/gtfs`.

  The entity types, the row types, the three coded-column enums and the two scalar modules
  (`Duration` and `PlainDate`) now live here, in a package that depends on nothing.
  `@gb-transit/gtfs` re-exports all of them, so nothing that imported them from there needs
  to change.

  The reason is `@gb-transit/gtfs-loader`, which reads a feed in a browser. It wants to
  agree with this project about what a duration is and what a day of the week is numbered,
  and for those four declarations it would otherwise have taken proj4, a memoisation
  decorator and a calendar typed against `Temporal` — none of which it uses, and none of
  which a CommonJS-only package can be tree-shaken free of.
