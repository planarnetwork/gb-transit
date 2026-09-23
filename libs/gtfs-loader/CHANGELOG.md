# @gb-transit/gtfs-loader

## 1.6.0

### Minor Changes

- 575a170: Pass through the columns a merge does not write of its own.

  **gtfsmerge** writes a column a feed carries after its own columns, as the feed wrote it, rather
  than dropping it. The rail feed's `transfers.txt` says which mode a fixed link is and when it runs,
  and those twelve columns used to stop at the merge. Every input's header rows are read before
  anything is written, because each file is opened with its header and a column only the last feed
  has would otherwise arrive too late to be in it. They are read from the zip's central directory and
  the first few kilobytes of each entry, so a national feed's stop_times.txt costs a read of its first
  line rather than a decompression of all of it.

  Columns that name something the merged feed would not have are not passed through: a transfer's
  `from_route_id` and `to_route_id`, since the routes are renumbered and transfers are kept one per
  pair of stops; `level_id`, `network_id` and the flexible services' locations and booking rules,
  whose files the merge does not write; and `shape_id` in a merge without shapes.

  **The rail feed's windows now reach the merged feed.** 1,578 of its 1,664 fixed links run only at
  some times or on some days, and a planner that reads the window - raptor-journey-planner does -
  now honours it in the merged feed as it does in the rail feed. Before, the columns were dropped and
  every link was available all day. Where two transfers describe the same pair of stops the one kept
  is the shorter, available whenever either is.

  **@gb-transit/gtfs-loader**: `readFeed` gains an `extraColumns` option that reads named columns the
  schema does not know onto the row as text, and `CSVParser` says the header it read. Both opt in: no
  other caller reads anything it did not before.

## 1.5.0

### Minor Changes

- 8020652: Give the trip a coupling makes a route, a headcode, a headsign and a shape.

  `linkTrips` made the trip a passenger stays on across a join or split out of the two trips' calls
  and calendars and nothing else, so it had no route, no headcode, no headsign and no shape. A journey
  planner showing one said "Unknown operator", and a map had nothing to draw it along.

  The through trip is the train the passenger boarded, so it now keeps the arriving trip's `routeId`
  and `shortName`, and goes where the departing trip goes, so it takes that one's `headsign`.

  Its `shapeId` names a shape the loader makes: the arriving trip's shape as far as the coupling, then
  the departing trip's from it. `linkShapes` makes those, and a loaded feed's `shapes` now holds them
  alongside its own, so every shape a trip names is in the feed whether or not the timetable has been
  built. A shape rarely says how far along it each call is, so the coupling is found by where it is:
  the point of each shape nearest the stop the link names. The same two trains can couple at one
  station on some dates and another on others, so the stops are part of the name.

  Over the GB rail feed all 3,662 through trips now name a route and a shape, and every call of every
  one of them lies on its shape.

## 1.4.0

### Minor Changes

- d16b874: Read the line a trip runs over.

  `shapes.txt` was one of the files `loadGTFS` did not open, so a feed that carried geometry was read
  back without it and nothing built from a loaded feed could draw a trip on a map. Now the feed has a
  `shapes` index and each trip a `shapeId`.

  The points are sorted by `shape_pt_sequence` rather than taken in file order. GTFS does not require
  `shapes.txt` to be sorted — the rail feed's is only sorted because the producer chose to — and a
  caller drawing an unsorted one gets a scribble.

  A point is latitude and longitude and nothing else. `shape_dist_traveled` is not read, for the
  reason the loader already skips four of `stop_times.txt`'s ten columns: nothing drawing a line needs
  it, this is the file a national feed has millions of rows of, and a caller that does need it has
  `loadGTFS(source, {raw: true})`, which reads every column a file has. That is also the path
  `gtfsmerge` takes, so a merge still carries the column through untouched.

  `shapes` is `{}` for a feed with no `shapes.txt` and `shapeId` is undefined on a trip that names
  none, so nothing changes for a feed without geometry beyond one more empty index.

  Every field of a point is checked before it is kept, which the rows around it are not. All four are
  load bearing and none is recoverable: `Number(undefined)` is NaN, NaN compares false against
  everything, and a comparator that returns NaN leaves the sort unspecified - so a single row with no
  `shape_pt_sequence` produces the scribble the sort exists to prevent, silently. A bad point is
  dropped; a bad line is not.

  Reading the published rail feed back: 241,669 trips, every one of them resolving to one of 12,077
  shapes over 176,403 points, and no trip pointing at a shape that is not there.

## 1.3.0

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

### Patch Changes

- Updated dependencies [315fec8]
  - @gb-transit/gtfs-schema@2.2.0

## 1.2.0

### Minor Changes

- bdc3387: Read the operator, the trip names, the transfer mode and the areas.

  A feed loaded as a timetable could say which trip a journey was on and nothing else about it. Four
  files were never opened and four columns of two that were went unsliced, so who ran a train, what
  it was called, and how a change between two stations was made all had to be recovered by reading
  the zip a second time.

  `GTFSFeed` gains `routes`, `agencies` and `areas`; `Trip` gains `routeId`, `shortName` and
  `headsign`; `Transfer` gains `mode`. Nothing an existing caller receives changes shape, and a feed
  missing any of these files loads as before with the indexes empty and the fields undefined.

  `areas.txt` and `stop_areas.txt` are one index rather than two, because neither is any use without
  the other. Either may arrive first — this feed writes `stop_areas.txt` ahead of `areas.txt` — so
  both sides fill in an entry the other may already have made.

  The cost is 9MB on a 290MB load of the GB feed, and no measurable time. That is small because all
  three trip fields go through `intern`: 290,640 trips name 98 routes and 869 headsigns between them.
  `trip_short_name` is the headcode and barely repeats, but a field is a slice of the chunk it was
  decoded from and 290,640 of them would hold the whole of an 18MB `trips.txt` alive, so it has to be
  copied out either way. Interning it costs a lookup and recovers the two thirds that do repeat.

  `agency_id` is handed back exactly as the feed wrote it, `=GW` and not `GW`. The equals sign is the
  National Operator Catalogue form that tells a rail operator from the airline with the same two
  letters, so stripping it would reintroduce the collision it exists to prevent and leave the ids
  disagreeing with the ones `@gb-transit/gtfs` composes.

  `mode` is the raw string, with `transferModes` to split it. The compound form is the sorted union of
  every link describing a stop pair, since `transfers.txt` is keyed on the pair and can hold one row
  for it, so `BUS|WALK` means the change can be made either way rather than that the bus comes first.
  Which one a journey should be shown as depends on what the caller is optimising, and the feed has
  not ranked them. It travels with a footpath between two stops and nowhere else: a same-stop row
  becomes that stop's interchange time, and a type 4 row becomes a coupling.

## 1.1.1

### Patch Changes

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

- Updated dependencies [4941620]
  - @gb-transit/gtfs-schema@2.1.0

## 1.1.0

### Minor Changes

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

### Patch Changes

- Updated dependencies [610f8ef]
  - @gb-transit/gtfs-schema@2.0.0

## 1.0.0

### Major Changes

- First release. A GTFS reader, brought over from
  [raptor](https://github.com/planarnetwork/raptor), where it had grown into a general
  purpose one that a journey planner happened to own.

  It reads a zip as the bytes arrive rather than after they have all been collected, so the
  source can be a stream, a `Response`, a `Blob` or the bytes themselves, and it works in a
  browser as well as in node. `normalise` puts the feed into the terms a planner works in;
  `linkTrips` turns a `transfer_type: 4` coupling into the through trip a passenger stays
  on, which is the same row `@gb-transit/gtfs` writes.

  Two things changed on the way over. Times are now read by `parseDuration` from
  `@gb-transit/gtfs-schema`, so a time this reads and a time the feed build writes mean the
  same thing: `"HH:MM"` is accepted where it used to silently yield `NaN`, and a string that
  cannot be read now throws instead of carrying `NaN` into a planned journey. And a
  calendar date is now indexed by number rather than by the string the feed gave, which is
  what `Service.runsOn` was always looking it up with.
