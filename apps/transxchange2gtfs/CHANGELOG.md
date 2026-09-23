# transxchange2gtfs

## 2.2.0

### Minor Changes

- 4b47962: Draw a journey whose route links have no track.

  A route link's ends are elements holding a `StopPointRef`, and were read as the element rather than
  the stop it names. Nothing used them until now, so nothing showed it.

  A route link with no track - every one of TfL's, which say which stops a train calls at and nothing
  of the line between them - is drawn as a straight line from the stop it leaves to the stop it
  reaches, where NaPTAN places them, and a platform NaPTAN does not list is placed at its station.
  Before, trips.txt named a shape for the journey and shapes.txt had no points for it: all 1,791 of the
  shapes TfL's tube, DLR, tram, river and cable car trips named were missing.

  Each link of a shape is measured on its own, so `shape_dist_traveled` only ever increases: a point
  used to be measured from the previous link's last point on top of a total that already included that
  link. A link that gives no distance is as long as it measures, rather than scaled to nothing. A stop
  NaPTAN does not list is placed where its document says, as it already was in stops.txt.

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
  - @gb-transit/gtfs@3.6.0

## 2.1.0

### Minor Changes

- 6fa51c7: Read a whole Bus Open Data Service archive, and say who runs what.

  **A byte order mark no longer stops the conversion.** Two thirds of the documents in a national
  archive begin with one, and an XML parser reads it as content before the first tag and rejects the
  document. Documents are decoded through a `TextDecoder`, which drops it. A document that will not
  parse is now skipped and counted rather than ending the run, and every stage that leaves something
  out reports how much when the feed is built.

  **`agency_id` is the National Operator Code.** It was the `Operator` element's `id`, which means
  something only inside the document it is written in — `tkt_oid` is the id 167 different operators
  give themselves, so keying on it collapsed them into one agency. The operator code and then the
  local id are used where a National Operator Code is missing, and an operator the document describes
  no further is named after its code rather than left blank. A service that names an operator its
  document never declares also gets an agency, instead of leaving the route pointing at one that is
  not in the feed.

  **A stop with no longitude and latitude is placed from its grid reference.** NaPTAN leaves those two
  columns empty for around 37,000 of its 435,000 stops and gives an easting and northing instead, so
  without this they reach the feed with no position at all. A grid reference outside the National Grid
  is refused rather than projected to wherever it lands. A stop the documents give no location is
  written with empty coordinates rather than 0,0, and NaPTAN's padding is trimmed out of stop names.

  **Stops either side of a street are grouped under a station of their own.** NaPTAN records this as a
  GPBS stop area and does not publish the areas in the national CSV, so the grouping is worked out
  from stops that share a name and a locality, stand within 150m of each other and face different
  ways. The stops of a group get a `parent_station`, the group gets a row, and `transfers.txt` walks
  between places rather than between their stops. `--skip-stop-areas` turns it off.

  **`platform_code` is written** where NaPTAN's indicator names a stand rather than a relative
  position. A bare `N` is both a stand at a bus station and a bearing on a street, so a stop whose
  indicator repeats its own bearing is left without one.

  **`--from` and `--to` set the days the feed describes**, defaulting to today and a year out. A
  registration's own dates run from whenever it began to as far out as 2099 and say nothing about what
  the feed can be trusted for, so a journey that runs on no day in the range is dropped and the
  calendars of the rest are clamped to it. A window that ends before it starts is refused rather than
  quietly producing an empty feed.

  **Calendars are clamped before they are compared**, so two registrations that differ only outside
  the window become one service rather than two. Clamping is what makes them coincide: a service
  registered from 2018 and one registered from 2020 describe the same calendar inside a window that
  starts after both. The dates a calendar is compared on are sorted for the same reason - an operating
  profile lists its holidays in whatever order it likes.

  **`feed_info.txt` is written**, with the window as its dates. TransXChange says nothing about what a
  feed covers, and a registration's own dates are not an answer.

  **A coach is `route_type` 200** rather than 3.

## 2.0.1

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
  - @gb-transit/gtfs-output@2.0.1
  - @gb-transit/naptan@1.1.1

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

### Patch Changes

- Updated dependencies [610f8ef]
- Updated dependencies [33612ec]
  - @gb-transit/gtfs-schema@2.0.0
  - @gb-transit/gtfs@3.0.0
  - @gb-transit/gtfs-output@2.0.0
  - @gb-transit/naptan@1.1.0
