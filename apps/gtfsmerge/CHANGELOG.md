# gtfsmerge

## 4.3.0

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

- 2c7f00f: Convert TfL's Journey Planner Timetables.

  **`--supersede-by-line`.** TfL publishes a line's engineering works timetable as a service of its own
  on top of the base timetable it interrupts, with a different service code and the same revision
  number, so a conversion that reads both runs the line twice: the Circle, Hammersmith & City and
  Metropolitan on a weekday, the Central, Jubilee and trams on a Saturday. With the flag, where two
  services of one operator and line overlap, only the one that starts latest runs on the days they
  share - the later start being the more specific timetable. Every document is scanned for its services
  before the conversion. Off by default, because in a BODS dataset an operator can run two unrelated
  services under one line name.

  **A metro, tram or ferry platform is under its station.** NaPTAN numbers a platform after the stop
  area it belongs to - `9400ZZLUKSX1` is platform 1 of `940GZZLUKSX` - and the feed now publishes that
  station and puts its platforms under it, so changing lines at King's Cross is an interchange rather
  than a walk between two places. A platform the timetable calls at that NaPTAN does not list, which is
  87 of TfL's, is put under its station and stands at it rather than having no position. The platform
  number is the last digit only, so Heathrow's Terminal 4 and Terminal 5 - `9400ZZLUHR41` and
  `9400ZZLUHR51` - stay two stations, and a station whose platforms are named for their direction, as
  Sheffield's tram stops are, is named without it.

  A service only replaces another on the days of the week its journeys run, so a weekday timetable
  starting later does not take the Saturdays, and a service whose `EndDate` is empty runs indefinitely
  in the scan as it does in the conversion.

  **gtfsmerge exports `readHeaders`**, which gives the columns of each file in a feed from the start
  of each zip entry, for `scripts/combine-rail-and-tfl.mjs` to carry every column of both feeds.

### Patch Changes

- Updated dependencies [ee175f3]
- Updated dependencies [3948a50]
- Updated dependencies [575a170]
  - @gb-transit/gtfs@3.6.0
  - @gb-transit/gtfs-loader@1.6.0

## 4.2.0

### Minor Changes

- 3ce9736: Keep the stop hierarchy, and generate transfers through a grid.

  A merge published only stations, moved every call onto them, and cleared `location_type` and
  `parent_station` on the way out. So a merged feed could say which station a train called at and not
  which platform, and it threw away the grouping a bus feed publishes for its own stops as well as the
  rail feed's. Merging the published rail feed with the national Bus Open Data Service feed produced
  311,736 stops, every one of them `location_type` 0 with no parent — against BODS London on its own,
  which has 24,348 stops, 452 stations and 865 stops that name one.

  That grouping is what tells a journey planner that a stand outside a station and a platform inside
  it are one place to change at. Without it the only interchange left is where two feeds happen to
  share an ATCO code — 1,863 stops out of 311,736 — and everything else has to be rediscovered from
  coordinates.

  A call now stays where its feed put it, a platform keeps its `parent_station`, a station keeps
  `location_type` 1, and a stop is published if something calls at it **or** it is the station above
  one that does. The old comment predicted three validator errors; there are none, because the errors
  came from moving calls onto stations rather than from publishing stations.

  Two things follow:

  - **A walk transfer is generated between stations, not between platforms.** A platform's interchange
    is its station's, because `parent_station` already says that reaching the station reaches every
    platform under it. A stop with a station above it therefore takes no part in generation; without
    that, one walk is written once per platform and offered as several journeys.
  - **Transfers are generated through a spatial grid.** `addNearbyStops` compared each stop against
    every stop already seen, which over 321,570 stops is 51.7 billion pairs and about four hours — the
    reason a national merge has been run with `--no-extra-transfers` until now. Cells one transfer
    distance wide reduce it to nine lookups per stop.

  **A stop code that names more than one station is left out.** A code is kept only where every stop
  carrying it is part of one station: swap a stop for its `parent_station` where it has one, and see
  whether more than one id is left. Merging the rail feed with the national bus feed, 2,777 codes are
  used by more than one stop — 2,740 of them a rail station and its own platforms sharing a CRS code,
  which is right, and 37 that are not. Of those, 27 name places miles apart (`74020` is Northlands
  Avenue and Borkwood Way) and 10 name two stops of one place the source gives no station to group
  them under. Neither kind can tell a rider which stop is meant, so the code goes.

  The stops are written by `end` rather than by `write` for that reason: a code can be shared across
  feeds, so the answer is not known until the last has been read.

  `StopTimesMerger.begin` no longer takes the parent map, since it no longer moves a call.

### Patch Changes

- Updated dependencies [8020652]
  - @gb-transit/gtfs-loader@1.5.0

## 4.1.0

### Minor Changes

- 531238f: Add `--no-shapes`, for a merged feed that does not need the geometry.

  `shapes.txt` is the line a vehicle is drawn along on a map, and nothing else — no journey planner
  reads one, and nothing in this repository consumes them. It is also the largest file a bus feed has:
  in a merge of the rail feed and the national Bus Open Data Service feed it is 1.24GB of a 4.31GB
  feed, a third of the archive.

  It is also asymmetric. Nothing in the CIF describes track geometry, which the published feed says in
  as many words, so a merged feed carries geometry for the buses and none for the trains — a map drawn
  from it shows buses following roads and trains as straight lines between stations.

  So it can be left out, and leaving it out means three things rather than one:

  - `shapes.txt` is not opened at all, rather than written empty.
  - `shape_id` leaves `trips.txt`, because a column naming a shape that is not in the feed is a
    dangling reference rather than a missing extra. `block_id` stays.
  - The reader is never asked for `shapes.txt`, so the 2.5GB in a national feed is read past rather
    than inflated and parsed.

  `merge({shapes: false})` on the API. The default is unchanged, so a merge that says nothing about
  this produces the feed it always did.

### Patch Changes

- 531238f: Take a review of the merge.

  **An option nobody knows is now an error.** `positionalArgs` treated any unrecognised `--flag` as a
  flag without a value, so its value became an input feed: `gtfsmerge --stop-prefix x_ a.zip out.zip`,
  the invocation the last release removed, merged a feed called `x_` and failed on a missing file
  rather than on the option. It now says `Unknown option --stop-prefix`, which is what every future
  removal wants too. A run with no feeds to merge prints the help rather than failing on an undefined
  output.

  **A membership is checked against the whole merged feed.** `stop_areas.txt` dropped a membership
  naming a stop nothing calls at, but decided that against the feed being written rather than the
  merged one — so the rail feed naming a stop only the bus feed serves lost the membership while the
  stop itself was published. They are filtered once, at the end, against every feed's calls.

  **An area named twice is reported once.** The collision warning fired per row, which a bus feed
  publishing Fares v2 over four digit NLCs would turn into thousands of lines; it counts and reports
  in `end`, as the shapes one does. It also used a nullish assignment, so an area whose name is an
  empty string was treated as never seen and every later feed appeared to disagree with it.

  **Two attributions that say the same thing collapse.** The dedup key was `String(field)` joined,
  where an absent field is the word `null` or `undefined` depending on how it arrived, so the same
  statement could survive twice — and a comma inside a licence could run two different statements
  together.

  **A calendar naming no day is dropped without walking its range.** `runsAtAll` stepped a day at a
  time through a range it was going to reject, which for the synthesised calendar of a service that is
  nothing but removals is however far apart those removals are.

  Also: `CalendarFactory` no longer computes a date range for a calendar that never runs and nothing
  reads, `FeedIndex.stopArea` no longer carries a comment describing what another class does, and five
  lines that ran past the width this codebase wraps at are wrapped.

- Updated dependencies [d16b874]
- Updated dependencies [d16b874]
- Updated dependencies [531238f]
  - @gb-transit/gtfs-loader@1.4.0
  - @gb-transit/gtfs@3.4.0
  - @gb-transit/gtfs-output@2.1.1

## 4.0.0

### Major Changes

- 315fec8: Remove `--stop-prefix`.

  The flag prepended a prefix to every stop id, for merging feeds that do not share an id space. It
  did not work, and had not for as long as it has existed: merging the published rail feed with it
  produces a feed with **no stops at all**.

  ```
  gtfsmerge --stop-prefix x_ gtfs.zip out.zip
    stops.txt         0 rows
    stop_times.txt    2,991,962 rows, every one of them pointing at a stop that is not in the feed
  ```

  `FeedIndex.stop` prefixed a stop it published, and recorded a platform's parent station under the
  unprefixed id:

  ```ts
  else {
    this.result.parentStops[row.stop_id] = row.parent_station;   // neither prefixed
  }
  ```

  Everything that reads that map has been prefixed by then, so a call at a platform never found its
  station and kept the platform's id — an id that is never published, because a platform is not a stop
  the merged feed writes. `usedStops` then held platform ids while the stops to publish were stations,
  the two sets did not intersect, and the test that decides which stops to write matched none of them.
  The rail feed has 9,257 platforms.

  It could have been fixed with two more prefixes. It is removed instead, because nothing needs it: GB
  feeds all name a stop by its ATCO code, which is the whole reason a rail feed and a bus feed from
  this repository merge without reconciliation, and no test has ever exercised the flag.

  **Breaking:** `MergeOptions.stopPrefix` is gone, and `MergeCommand.run` no longer takes it. Feeds
  that disagree about what a stop id means have to be reconciled before they reach a merge.

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

- 315fec8: Carry attributions, fare areas and feed info through a merge.

  The merge opened eight writers and dropped everything else, so merging the published rail feed with
  a bus feed lost four files:

  - `attributions.txt`, which is where the Open Government Licence and the Rail Settlement Plan
    licence are stated. NaPTAN's licence makes acknowledgement a condition of use, so a merged feed
    was being published without the one file that keeps it inside its terms — and adding a second
    source is when that file needs another row, not deleting.
  - `areas.txt` and `stop_areas.txt`, the GTFS Fares v2 station groups. "London Terminals is these
    eighteen stations" is what they say, and a merged feed could no longer answer it.
  - `feed_info.txt`, where a feed says who made it, what it covers and which version it is. The
    validator warns without it.

  All four now survive. Attributions are the union of the inputs', deduplicated on the whole statement
  rather than on the organisation, because the same body can be the authority for two things under two
  licences. A stop area follows the same rules a transfer does: a membership naming a platform is
  written as the station above it, and one naming a stop nothing calls at is dropped.

  `feed_info.txt` has no answer that is simply correct, since two feeds have two publishers and the
  merged one is neither. It takes the publisher of the first input, the widest window across the
  inputs, and every input's version joined — `RAIL001+BUS001`. Anything publishing a merged feed as
  its own should write this file itself rather than take what falls out here.

  The end-to-end test listed the files it checked, so the four could have gone missing again without
  anything noticing. It now reads the golden directory and asserts the merge produced exactly those
  files.

- 680677d: Read a feed's stop times in a pass of their own, rather than holding them.

  A merge held every input feed whole, and `stop_times.txt` is almost all of a feed. Held the way the
  merge held them, one national bus feed's 59,129,908 calls cost 18.0GB against 0.7GB for the
  1,854,991 rows of everything else — 96% of the memory for one file. Merging that feed with the
  published rail one peaked at 22.1GB and ended, at the 8GB `bin/gtfsmerge.sh` allows:

  ```
  Loading rail.zip / Processing rail.zip / Loading bus.zip
  FATAL ERROR: Ineffective mark-compacts near heap limit - JavaScript heap out of memory
  ```

  The order the merge already worked in is why they need not be held at all. Nothing can be done with
  a call until its trip has been numbered, and the trips are numbered from the routes and calendars;
  nothing needs the call afterwards. So `readMergeInput` now reads everything but the stop times, and
  `stopTimesOf` reads the file again for those alone, handing each call to `StopTimesMerger` to remap
  and write as it arrives.

  The second read is what this costs, and it is a read of a file rather than a copy of it in memory.

  `GTFSOutput.write` takes a `StopTimeReader` alongside the feed, and `GTFSZip` no longer has a
  `stopTimes` field. Anything embedding gtfsmerge rather than running it will notice; the CLI is
  unchanged.

  Backpressure moved with it. The rows of a chunk arrive from a synchronous parser that cannot be made
  to wait for a writer partway through, so a chunk's calls are collected and written between one chunk
  of the zip and the next, which is where the reader can be paused. A feed's last calls arrive after
  its last chunk, as the inflater and the parser give up what they were holding, and are written after
  the read rather than lost.

### Patch Changes

- 315fec8: Make a merged calendar say what the feed it came from said.

  A service the feed describes only by its exception dates has no calendar row to carry across, so
  `CalendarFactory` works one out from the dates. It read every date as a date the service runs on:

  ```js
  if (calendarDateIndex[i]) {          // presence, not exception_type
    daysRunning[dow].push(...)
  ```

  A feed lists both the dates a service runs and the dates it does not, and the second kind was being
  read as the first. Merging the published rail feed with the Bus Open Data Service's Wales feed, 1,613
  trips came out running on days they do not run, and the days they gained were 24, 25, 26 and 28
  December, New Year's Day and Easter — the bank holidays an operator writes down as removals. Across
  the national bus feed it is 959 services and 26,908 days.

  None of it showed on a rail feed, because every service in the CIF has a calendar of its own and the
  synthesised path is never reached. It is reached 1,489 times by the national bus feed.

  Four fixes, all in the calendar:

  - Only an addition is a date the service runs on. A removal now falls where it belongs, among the
    days the service does not run, and comes back out as an exclusion wherever the calendar's own days
    would otherwise include it. The range is taken from the dates it runs rather than from every date
    mentioned.
  - A service whose dates are all removals never runs, and used to build a calendar out of whatever
    those dates happened to be. It gets a calendar of no days.
  - A service that runs on no day at all is dropped, along with its trips and their calls. A feed says
    this in more than one way — a calendar naming no day, a range whose every running day is excluded,
    nothing but removals — and none of them can be planned onto. The Wales merge carried 78 such trips.
  - `getCalendarHash` compared the exception dates in the order the feed listed them, so two identical
    services written down in a different order stayed two services. They are sorted first. The fields
    around them were taken from the row with `Object.values`, which follows the order the object was
    built in — a parsed calendar in the order of its columns, a synthesised one in the order
    `CalendarFactory` writes it — so a service published as a row by one feed and described only by
    its dates in another hashed two ways. They are named instead. Merging the rail feed with BODS
    Wales, 15 services were being written twice.

  `CalendarFactory` now steps between dates with `addDays` from `@gb-transit/gtfs-loader`, which works
  in UTC so that a clock change cannot move a date onto the day either side of it, rather than with a
  local-time `Date`. `toGTFSDate` stays where it is and stays local: it answers "what is today" for the
  default `--date-filter`, which is a question about the caller's day.

  Checked by merging the rail feed with BODS Wales and comparing the exact set of dates every one of
  the 334,972 trips runs on, before and after: every trip runs on exactly the days it ran on.

- Updated dependencies [315fec8]
- Updated dependencies [5be51bc]
- Updated dependencies [28cac53]
  - @gb-transit/gtfs-schema@2.2.0
  - @gb-transit/gtfs-loader@1.3.0
  - @gb-transit/gtfs-output@2.1.0
  - @gb-transit/gtfs@3.3.0

## 3.0.1

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
  - @gb-transit/gtfs@3.1.0
  - @gb-transit/gtfs-loader@1.1.1
  - @gb-transit/gtfs-output@2.0.1

## 3.0.0

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

### Patch Changes

- Updated dependencies [610f8ef]
- Updated dependencies [33612ec]
  - @gb-transit/gtfs-schema@2.0.0
  - @gb-transit/gtfs-loader@1.1.0
  - @gb-transit/gtfs@3.0.0
  - @gb-transit/gtfs-output@2.0.0
