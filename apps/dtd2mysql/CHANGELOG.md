# dtd2mysql

## 11.3.0

### Minor Changes

- f3f8eb9: Publish a passing point between the calls either side of it.

  A build with `--remove-passing-points=false` put a call at its public time and a pass at its working
  time, and the CIF's two clocks can be a quarter of an hour apart. C02035 sets down at Doncaster from
  a public 00:35 and a working 00:49½, so its working pass of Adwick at 00:55½ was published after its
  public arrival at Wakefield Westgate, 00:52. The validator raised 24 of those in the nightly's feed,
  and they stopped it publishing when two new overlays made the count 26. A train that runs backwards
  is the ones that showed; a pass fifteen minutes out that happened not to overtake a call was just as
  wrong and nothing said so.

  A pass now keeps its share of the working time between the calls either side, laid over their public
  times: Adwick, 4 of the 15 working minutes out of Doncaster, is published at 00:41. Where the two
  clocks agree nothing moves. A call published at only one end - set down only or picked up only - is
  placed on the public clock by the end of its working dwell that time is nearer, so the Night Riviera
  standing at Reading from 03:12 to 04:18 is not spread back to 03:12, and the sleeper that reaches
  Preston at 03:51 and sets down from 04:20 is not stretched forward to it. No pass is published before
  the call behind it, after the call ahead of it, or before the pass ahead of it.

  Built from `RJTTF918`, 203,373 of 625,583 passes move, 188,680 of them by a minute or less. The
  validator raises 1 `stop_time_with_arrival_before_previous_departure_time` rather than 27 - Z03536,
  which the standard feed raises too - and `fast_travel_between_consecutive_stops` and
  `fast_travel_between_far_stops` fall from 206 and 180 to 56 and 53. The calls are unchanged, and a
  build that removes passing points is unchanged.

  A passing point is now `timepoint` `0`, which GTFS reads as an approximate time.

### Patch Changes

- Updated dependencies [f3f8eb9]
  - @gb-transit/gtfs@3.5.0

## 11.2.0

### Minor Changes

- d16b874: Draw every trip as a line through the stations it passes.

  The feed publishes `shapes.txt` and a `shape_id` on every trip. The line runs through every station
  a train touches — calling or running through — which is what makes it worth drawing: on the calls
  alone a King's Cross to Newcastle service is a single 395 km straight line, and with the passing
  points it is twenty-odd hops that trace the East Coast Main Line. Across a national feed it takes
  the straight-line hops longer than 50 km from 4,751 down to 404, and the 99th percentile hop from
  74 km to 37 km.

  **It is a sketch of the route, not the track.** 2,170,472 of the CIF's 3,062,488 passing points are
  junctions, loops and signal boxes and the DTD gives no coordinate for any of them, so what is left
  is station to station. The median hop is a 4.8 km straight line over ground the rails curve across.
  Enough to tell a Bristol train from a Birmingham one on a map; not enough to draw the railway.
  `Shapes.ts` says so, and so does the published documentation, because a consumer who mistakes this
  for geometry will draw trains through fields.

  A shape belongs to the ground, not the train. One line carries every stopping pattern that runs
  over it, so a national feed has 13,722 shapes for 278,794 trips, and the id is twelve hex characters
  of a digest of the stations it runs through — the same id in every build, so something outside the
  feed can refer to a line by it.

  `Schedule` gains a `path`: every timing point, kept apart from the calls so that nothing about a
  route, a headsign or a coupling can start depending on a station the train does not stop at. It
  survives `clone` unchanged, because a schedule cut to other days is the same train over the same
  ground.

  The two places that rebuilt a schedule field by field - `mergeSchedules`'s `withTripId` and
  `CifFileSource`'s `offsetId` - now go through `clone` instead. Both were listing nine of a
  schedule's ten fields to change one, which is nine chances to forget the tenth, and `offsetId`
  duly forgot `path` the day it was added. Nothing caught it: the argument is optional, so the call
  compiled, and a z-train with no path draws its shape from its calls - the same list, until a ZTR
  carries a pass time.

  `removePassingPoints` moves from the sources to `ScheduleBuilder`. The passenger query and the CIF
  read now hand over every location either way — 3.8 million rows rather than 2.9 million — and the
  builder decides which of them become stop times. That is what makes **both** published feeds carry
  the identical `shapes.txt` whether or not they publish the passes as calls, which the nightly checks
  with `cmp` before releasing.

  `gtfs.zip` grows by 1.73 MB, 9.6%. That is measured rather than estimated: the same build zipped
  with the shapes and with them stripped out, over RJTTF918 alone — 241,669 trips, 12,077 shapes,
  176,403 points, and every one of those trips drawn. `shapes.txt` is 6.3 MB of it before compression
  and the rest is the id on the trips. Coordinates are written to six decimal places — eleven
  centimetres, against a line already wrong by kilometres wherever the track bends.

  No `shape_dist_traveled`: GTFS only reads one where `stop_times.txt` carries it too, and putting a
  distance on 2.9 million calls is not worth it. The validator raises no new notice of any kind on the
  real feed with the shapes in it — not one `stop_too_far_from_shape`, not one
  `stops_match_shape_out_of_order` — so the baselines are unchanged.

  The MySQL import reads the file it has always had a table for. `shapes` was created empty because
  "this feed has no geometry to put in it"; it now loads, with a `char(12)` id, a
  `(shape_id, shape_pt_sequence)` key and a `smallint` sequence, none of which the stub had right.
  `trips` gains a nullable `shape_id`.

### Patch Changes

- Updated dependencies [d16b874]
- Updated dependencies [531238f]
  - @gb-transit/gtfs@3.4.0
  - @gb-transit/dtd-source@1.3.0
  - @gb-transit/gtfs-output@2.1.1

## 11.1.0

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

### Patch Changes

- Updated dependencies [4941620]
  - @gb-transit/dtd-source@1.2.0
  - @gb-transit/gtfs@3.1.0
  - @gb-transit/gtfs-output@2.0.1

## 11.0.0

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
  - @gb-transit/gtfs@3.0.0
  - @gb-transit/gtfs-output@2.0.0
  - @gb-transit/dtd-source@1.1.1

## 10.0.1

### Patch Changes

- c696f32: Keep the trains that run in the repeated hour of the autumn clock change on the day they run.

  On the last Sunday of October 01:00 to 01:59 happens twice, once in BST and again in GMT.
  `shiftLateNightServices` moves anything departing before 02:00 onto the previous service day, which
  reads every such departure as the first pass. That is right for a service day that ends before the
  change, and wrong for one that runs through it: an 01:05 GMT departure is 26:05 of the Saturday
  service day, and telling it as 25:05 puts it alongside the train that already ran an hour earlier.

  The London Overground Windrush line is the only service in Great Britain that runs through the
  change, and it covers the repeated hour with new short term plan schedules dated to that Sunday
  alone - four in each direction between Highbury & Islington and New Cross Gate. A schedule of that
  shape - operator `LO`, on the Windrush line, a new schedule rather than an overlay, departing
  between 01:00 and 01:59, and whose own record is dated to the last Sunday of October and nothing
  else - is now left where that record puts it. The standard schedules cover the first pass and are
  shifted as before, as is an overlay on that Sunday, which is how the departure already in the
  timetable gets retimed. The count is logged when it is not zero, because the rule is expected to
  stop matching if the operator changes how it publishes these.

  `Association.apply` now asks whether the shift will move the schedule of `asDated` rather than of
  `assoc`. `asDated` is the one that reaches the shift, and it carries the calendar `coupled` has just
  narrowed, which is what the answer now depends on.

- Updated dependencies [c696f32]
  - @gb-transit/gtfs@2.0.1

## 10.0.0

### Major Changes

- 783c178: Publish an overnight associated schedule once, on the day its own record dates it.

  A schedule that runs the day after its base was published twice: once told in the base's service
  day, at times past 24:00, and once on the day its own record gives. Both are the same train, so a
  departure board built from the feed showed it leaving twice, and the copy told in the base's day was
  the one a coupling named. Over three months of the whole network that is 108 trips and 1,057 stop
  times, measured against RJTTF847/918; the mini fixture goes from 150 trips and 1,590 stop times to
  128 and 1,326.

  The associated schedule now stays where its own record puts it and the transfer names it there.
  GTFS does not ask the two trips a coupling names to run on one service day - a transfer carries no
  calendar, and `to_trip_id` is defined against the stop rather than the start of the trip - so a
  coupling that happens over midnight is now read as one, and the Aberdeen portion of the sleeper is
  the Tuesday 04:28 out of Edinburgh rather than a Monday 28:28.

  **Breaking for consumers whose planner cannot follow a transfer across a service day.**
  `--duplicate-overnight-associations`, `duplicateOvernightAssociations: true` in a config, or
  `GTFS_DUPLICATE_OVERNIGHT_ASSOCIATIONS=1` publishes the copy as well and points the coupling at it,
  which is the previous behaviour. It is off by default, and a feed built with it carries the same
  train twice on purpose.

  **Breaking for `@gb-transit/gtfs`.** `applyAssociations` and `Association.apply` take the setting as
  a further argument. `AssociationApplication` replaces `associated`/`asDated` with `asDated`,
  `duplicated` and `unassociated`, which say which of the three copies each one is rather than leaving
  two of them to overlap. `addLateNightServices` is now `shiftLateNightServices`, and no longer takes
  an `IdGenerator`: it replaces each schedule with the shifted copy, which keeps the id it was given.
  `Schedule.copyToPreviousServiceDay` is the one implementation of the day shift both it and an
  overnight duplicate use.

### Minor Changes

- 0f6bf84: Add `--remove-passing-points`, which defaults to `true`, so the feed is unchanged by default.

  Half the CIF's intermediate location records are places a service runs through without stopping,
  and 892,000 of them are at a station the feed publishes. They have always been dropped at the source
  query, so the only calls with no pickup and no drop off in the feed were the 4,800 operational stops
  where a service stops but nobody boards.

  `--remove-passing-points=false`, `removePassingPoints: false` in a config, or
  `GTFS_REMOVE_PASSING_POINTS=0` keeps them, as calls with `pickup_type` and `drop_off_type` of `1`
  and the pass time as both the arrival and the departure. Over three months of the whole network that
  is 3.43 million stop times against 2.84 million. Trips, routes and calendars are identical;
  `stops.txt` gains 59 stops. A passing point names its platform like any other call, falling back to
  the station where the pass record gives none: 89% of passing calls land on a boarding point the feed
  already publishes because something stops there, so the id a passing call carries is the one a
  stopping call at that platform carries.

  Fixes a bug it uncovered: where two of a service's timing points share a CRS, the one that boards or
  alights wins, but a request stop has `pickup_type` 3 rather than 0 and so had nothing to win with. 28
  of them were displaced by the point the service passes on the way in.

  The nightly workflow now publishes both feeds, `gtfs.zip` and `gtfs-passing-points.zip`, each gated
  by its own validator baseline.

### Patch Changes

- Updated dependencies [783c178]
- Updated dependencies [0f6bf84]
  - @gb-transit/gtfs@2.0.0
  - @gb-transit/dtd-source@1.1.0
  - @gb-transit/gtfs-output@1.0.1

## 9.0.0

### Major Changes

- 2a1ca37: Emit splits and joins as GTFS linked trips instead of concatenating them

  A DTD association is two trains sharing a vehicle for part of their run. Folding the associated
  schedule into its base said something else - that a passenger boarding the associated train rides
  through to the base's destination on one train - and where it arrives back where it came from, that
  trip doubles back on itself. Both schedules now keep their own stops and their own trip, and the
  association is a `transfers.txt` row with `transfer_type=4` and `from_trip_id`/`to_trip_id`.

  `transfers.txt` gains `from_trip_id` and `to_trip_id` after `to_stop_id`, empty on every interchange
  and fixed-link row, and `min_transfer_time` is empty on a linked-trips row.

  **Breaking for consumers.** A through journey over a join or a split is no longer one trip, so
  anything that does not read `transfers.txt` will show a change of trains where it used to show a
  through service.

  **Breaking for `--gtfs-import`.** `trips.trip_id` and `stop_times.trip_id` were `mediumint(12)
unsigned` while the build has always written a string, so every trip id loaded as `0` and the two
  tables never joined. Both are now `varchar(32)`, as are the two new `transfers` columns, and all
  four are in a primary key. `min_transfer_time` becomes nullable. A database imported with an earlier
  version has to be reimported, and anything reading these tables - a view, a foreign key, a join
  treating a trip id as a number - has to be updated with it.

  `stop_times.txt` gains `stop_headsign`, which was empty on every row. A train that divides names
  every destination it is still carrying at the stops before it does - "Caterham and Tattenham Corner"
  as far as Purley Oaks, and nothing from Purley on, where the trip headsign is right by itself. This
  is what the concatenation used to say by accident. Note it is the first value in the feed that needs
  CSV quoting, because a headsign naming three destinations has a comma in it.

  A schedule that runs the day after its base is published twice: on the base's service day, which is
  what the coupling names, and on the day its own record gives, which is where a passenger boarding it
  looks. Without the second an 08:41 departure is only findable as 32:41 the day before.

  A trip that joins another is headed for where it ends up rather than where it is attached, so the
  Tattenham Corner portion reads London Bridge instead of Purley.

### Patch Changes

- b675f63: Publish routes as the brands a passenger sees, with stable ids.

  A route used to be one operator's journey between two places - `SE:TON->SEV:2` -
  numbered in the order the routes were written, so `routes.txt` ran to thousands
  of rows and a `route_id` meant nothing outside the build it came from. A route
  is now the brand on the departure board: `GW` is Great Western Railway, `WIN` is
  the Windrush line, `SX` is the Stansted Express. The id is worked out from the
  schedule, so it is the same id in every build and can be referred to from
  outside the feed.

  `route_short_name` and `route_long_name` are the operator's own names for the
  brand, `route_color` is the colour it uses on a route map and
  `route_text_color` is black or white, whichever can be read on it. The six
  operators that run more than one line - London Underground, the Overground,
  Merseyrail, the Tyne & Wear Metro, West Midlands Trains and Greater Anglia's
  Stansted Express - have their line worked out from where the service calls;
  `libs/gtfs/src/data/route.ts` holds the rules and the branding, and is the one
  file to edit when a brand changes. Buses and replacement buses keep routes of
  their own, because neither runs on the line its operator's trains do.

  `route_desc` is no longer written. It carried the class and reservation
  availability of a train, which is a property of the train and not of the line it
  runs on: trips sharing a route disagreed about it.

  For a consumer of `@gb-transit/gtfs`: `RouteID` is a string rather than a
  number, `Trip.route_id` with it, and the optional fields of `Route` are `null`
  rather than `undefined`, as everywhere else in the feed. `Schedule.toTrip` no
  longer takes a route number, and `Schedule.routeShortName` is `Schedule.routeId`.

  An operator the build has no agency for keeps its ATOC code, so it gets a route
  of its own named after that code and attributed to the catch-all `ZZ` agency.
  That route keeps its id when the agency list catches up with the operator, which
  is the case a stable id is for: `LF` ran before the software knew about Lumo
  (West Coast).

- Updated dependencies [b675f63, 2a1ca37]
  - @gb-transit/dtd-schema@1.0.0
  - @gb-transit/dtd-source@1.0.0
  - @gb-transit/feed-parser@1.0.0
  - @gb-transit/gtfs@1.0.0
  - @gb-transit/gtfs-output@1.0.0

## 8.0.1

### Patch Changes

- 500de2a: Credit the sources the feed is built from, in `attributions.txt`.

  NaPTAN is Open Government Licence v3.0, and the licence makes acknowledgement a
  condition of use rather than a courtesy. NaPTAN was turned on for the nightly
  and this landed before the first run that would have used it, so no published
  feed ever carried DfT coordinates without crediting the DfT - but it was one
  night away from doing so.

  Each enricher and extension already declared an `attribution` - who the source
  belongs to, on what terms, and whether the licence is share-alike - and nothing
  read it. Now every one that runs becomes a row, along with the timetable itself,
  which is not an enricher and so declares nothing: a feed that credits the source
  of its coordinates but not the source of its trains reads as a complete list and
  is not one.

  The declaration stays on the enricher rather than in a list kept centrally,
  because the thing that knows a source's licence is the code that fetches it. A
  central list goes stale the first time somebody adds a package and forgets, and
  the failure is silent.

  `attribution_licence` is a producer extension. The spec has `organization_name`
  and a URL and no field for the terms, which is the one thing an attribution
  statement has to say; the alternative was to bury it in `attribution_url` where
  nothing could read it.

- 6757892: Add the seam external data sources plug into.

  The core build turns the DTD into GTFS and nothing else. Real coordinates,
  step-free access and station groups come from elsewhere, each with its own
  licence and its own idea of what a station is. An enricher is one of those
  sources, and it writes through a ledger: every change has an author and a
  declared priority, higher priority wins whatever order they ran in, and every
  write that lost is kept in `provenance.json` so "why does the feed say that" has
  an answer.

  No enricher is configured yet, so the feed is unchanged.

  A build can also be described in a `gtfs.config.yaml` and run with
  `dtd2gtfs build --config`, which is how a nightly gets to differ from yesterday
  by a diff somebody approved rather than by an edited command line.

  Station coordinates come from NaPTAN when it is enabled. 2,622 of 3,054 stations
  match; the rest are buses, trams, ferries and Underground stops that NaPTAN's
  rail records do not cover. Most stations move a couple of metres, a few by
  kilometres.

- 2590b7b: Publish what the sources actually did, and let the page say who they are.

  `enrich()` printed matched, unmatched and conflicts to the console and nowhere
  else, so the one number D1 was designed around - the unmatched count a source is
  tempted not to report - survived only in a workflow log that expires in a
  fortnight. Nobody was ever going to compare last month's against this month's.

  The build now writes `enrichment-report.json` beside the feed: what each
  enricher and extension matched, missed and dropped, with their notes, and the
  sources the feed is built from. It is attached to the release rather than zipped
  into the feed, alongside `validation.json`. Distinct from `provenance.json`,
  which answers "why does this feed say that" in thousands of entries; this
  answers "did the sources work".

  The download page's sources list was hardcoded to one line naming the Rail
  Delivery Group. It now renders whatever the feed was actually built from, so
  turning an enricher on credits it without anybody remembering to edit the site -
  which matters because NaPTAN is OGL and acknowledgement is a condition of use,
  not a courtesy. A release published before the build declared its sources falls
  back to naming the timetable rather than showing an empty list.

- 2d684ab: NaPTAN can supply readable station names, if a config asks for it.

  MSN station names are upper case and truncated to sixteen characters, so the
  feed calls Newcastle Airport `NEWCASTLE AIRPRT`. The readable names come from a
  hand-maintained override file, which is the reason D7 cannot retire it.

  D3 declined NaPTAN's names because its `CommonName` is "Aberdare Rail Station"
  where the departure boards say "Aberdare". That suffix is the whole of the
  objection: strip it and 2,454 of the 2,580 names both sources describe are
  identical. Of the 126 that differ, 98 are a parenthesised county qualifier, 6
  are case - with NaPTAN the better of the two - and 22 are genuinely different.
  `docs/station-names.md` lists every one.

  `options: {names: true}` turns it on, off by default because renaming every
  station in the feed is a decision to make deliberately. Enricher `options:` was
  parsed and then dropped on the floor; it now reaches the enricher.

- 20b14df: Keep the feed releases worth keeping.

  A release a day, each carrying a 20 MB zip, accumulates forever. The last month
  is what anybody fetches; past that what is wanted is the ability to say what the
  feed looked like in April, and one release a month answers that as well as
  thirty do. The nightly now keeps the last 30 dailies plus the earliest release
  of each month.

  The earliest of the month rather than whichever is dated the 1st, so a night
  that failed to publish does not cost the whole month its record.

  The selection is a pure function with tests. A rule that deletes published
  artifacts should not be discoverable only by watching it run, and it considers
  `feed-` tags alone: the npm version tags share the release list, and a pruner
  that could reach them is one bad regular expression from deleting a release of
  the software.

  `provenance.json` is attached to the release too, alongside the validation and
  enrichment reports. All four describe the feed rather than being part of it, so
  they are assets rather than zip contents - somebody unzipping a GTFS feed should
  get GTFS.

- 732fd43: Publish RDG group stations as GTFS Fares v2 `areas.txt` and `stop_areas.txt`.

  A group station is a set of stations a ticket is valid to or from - `1072`
  "London Terminals" is Euston, Waterloo, King's Cross and fifteen others - and a
  rider holding one needs to know which stations that is.

  GTFS has no station-of-stations: `parent_station` is forbidden on a station and
  the hierarchy is one level deep, so a group cannot be modelled as nesting.
  `transfers.txt` is the wrong tool too, because it asserts you can walk between
  the stops, which is false for Euston and Waterloo. An area is a flat set with no
  nesting rules and no exclusivity, so a station can sit in London Terminals and a
  travelcard zone at once - which is what the source data actually says.

  Areas are published under the four digit NLC, the identity the rest of the rail
  industry uses and the one the timetable feed already carries as the `TI`
  record's `nalco`.

  This arrives through a new `Extension` seam, alongside the existing `Enricher`.
  An enricher improves an entity the DTD already produced; an extension
  contributes whole files the core build has no concept of. Neither can do the
  other's job, and an extension gets a read-only view of the feed rather than the
  ledger, because field-level provenance means nothing for a file that has no
  prior value to lose.

  Off unless a config asks for it, so the feed is unchanged by default.

## 8.0.0

### Major Changes

- 1d05d5b: Put the fixed links where GTFS expects them, say what the feed covers, and check it.

  **Major, because every identifier in the feed changes.** A consumer joining on a
  three letter `stop_id` or a bare ATOC `agency_id` has to move to `stop_code` and
  the NOC form, and there is no flag to keep the old ones - see below.

  - **`links.txt` is now `transfers.txt`.** The fixed links were in a file of this
    project's own invention that no consumer reads. They are transfers with a
    minimum time, merged with the station interchange rows. GTFS has nowhere to
    put a time window or a mode in a standard field, so they are producer
    extension columns, and 8,514 records become 2,406 rows because the stop pair
    is the primary key - the shortest wins, and the modes and window are the
    envelope of the records that describe the pair. `--links` still writes the old
    file for one release.
  - **`feed_info.txt` is written**, with the publisher, the language, the source
    feed as `feed_version`, and the window the feed can actually be trusted for.
  - **CI runs the MobilityData validator** over the mini fixture and fails on any
    error. The accepted warnings are committed with a reason each, so a new one
    fails the build and a fixed one has to be taken off the list.
  - **The feed no longer points at stops it does not declare.** 36 calls named
    `QHA` and `ZUX`, which appear in the z-train stop times and nowhere else in
    the feed - no name, no coordinate, nothing to publish a stop from. The calls
    are dropped and counted; the 31 trips that had nothing left are dropped with
    them.
  - **The CLI exits when it is finished.** The download commands left a database
    pool open, so the process hung after the transfer completed - harmless at a
    prompt, fatal for a scheduled job.
  - **Platforms are stops, and the stops are the ones the rest of the country
    uses.** A station is a `location_type=1` stop with a child per place a train
    calls, which is the structure the GTFS best practices describe, and both are
    identified by their NaPTAN ATCO code: `910GCLPHMJC` for Clapham Junction, with
    `9100CLPHMJC15`, `9100CLPHMJW3` and `9100CLPHMJM11` beneath it. A call that
    names no platform points at `9100` and the TIPLOC of the timing point.
    **`stop_id` is no longer a CRS code, so this breaks any consumer joining on
    one - the CRS is now `stop_code`**, on the station and on every stop beneath
    it. `transfers.txt` references stations. The ids are a function of the TIPLOC
    the timetable already carries, so nothing external is needed to produce them,
    and a feed in them can be merged with the DfT's bus and metro data as it is.
  - **`agency_id` is the National Operator Catalogue code**: `=SN`, `=AW`, `=GW`.
    A bare two letter code is an airline in the NOC - `BA` is British Airways -
    and rail operators are distinguished by the equals sign.
  - **An incremental's stop times and z-trains reach the database.** Records that
    generate their own id counted from zero on every import, and since `id` is the
    primary key, `INSERT IGNORE` silently dropped every row an earlier feed had
    already numbered - so an incremental's schedules landed and their stop times
    did not. Every counter is now continued from the table, not just the one for
    schedules.

### Minor Changes

- 4feaed6: Make the feed reproducible: same input, same bytes.

  `route_id` and `service_id` were counters that advanced in whatever order the
  schedules came back in, so the same timetable could be numbered differently from
  one run to the next and was numbered differently by different sources. `route_id`
  now comes from a sort of the route's name - operator, origin, destination, mode -
  and `service_id` from a sort of the calendar's date range, day mask and
  exclusions.

  Every output file is now written in a declared order as well: stops by `stop_id`,
  trips by `trip_id`, stop times by `(trip_id, stop_sequence)`, and so on.

  **Identifiers and row order both change with this release.** The trips, calendars
  and stop times are the same; they are numbered and ordered differently. Anything
  storing a `route_id` or `service_id` from a previous feed has to re-read them,
  which is what GTFS expects of a dataset-internal id but is worth knowing before
  you upgrade.

  One piece of content changes with them. `route_desc` says whether first class is
  available, which is a property of a train rather than of the line it runs on, and
  trips on the same route can disagree - **352 of the 6,184 routes do**. Whichever
  trip reached the route first used to decide it; now the description that sorts
  first does. The value was arbitrary either way, but it no longer depends on the
  order the rows came back in. Nothing else about a route changes.

- 5c7f1ad: Stop the feed containing places that do not exist.

  - **Twelve operator placeholders are gone.** `CH ORIGIN`, `XC DESTINATION` and
    the rest are in the MSN so a schedule has somewhere to start and end when the
    real terminus is not known. They were stops in the North Sea, and 18 trips
    called at them. Every one of those trips had two stops and both were
    placeholders, so the trips go too. Both counts are logged.
  - **Tottenham Court Road is no longer in the Indian Ocean.** Its override entry
    had the latitude and longitude the wrong way round. All 2,594 entries are
    checked against the bounds of the feed now, so the next transposition fails a
    test rather than shipping.
  - **43 Irish stations are no longer in the South Atlantic.** Their easting and
    northing are all zeroes, which is the feed saying it has no coordinate rather
    than a coordinate of zero. No train in the feed calls at any of them, so they
    are left out until a source can locate them, instead of being published at a
    made-up point. Two Blackpool bus-tram stops that fixed links do reference are
    published at 0,0 and named in a warning.

- 2ad1529: Give the GTFS build a clock, and honour the range everywhere.

  `--today` fixes the date the build covers, so a feed can be regenerated tomorrow
  and compared to the one generated today; without it the output is a function of
  the day it ran. `--range` sets how far ahead to build. Both are also read from
  `GTFS_TODAY` and `GTFS_RANGE`, and the flags override the variables.

  `--range` fixes a live bug. `GTFS_RANGE` only ever reached the passenger schedule
  query: the replacement bus and association queries hardcoded three months, so
  `GTFS_RANGE=6 MONTH` produced six months of trains with three months of
  associations - on the current feed, 93,348 extra schedules against 846
  associations silently dropped. All three now derive their window from one value.
  At the default of three months the output is unchanged.

- 0130710: Stop the feed asserting things that are not true.

  - **`trip_headsign` is where the train is going.** It was the TUID - an internal
    identifier like `C00049` - in a passenger-facing field. It is now the name of
    the last stop: "London Paddington". The TUID is still in `trip_id`, and
    `trip_short_name` still carries the RSID.
  - **`wheelchair_accessible` is 0.** Every trip in GB claimed to be wheelchair
    accessible. Nothing in the DTD feed says so, and 0 is what GTFS uses for "no
    information". `bikes_allowed` was already 0 and means the same thing.
  - **`stop_headsign` is empty.** It held the platform number, but the field
    overrides the trip headsign from that stop onwards - it means "this service
    terminates here", not "platform 3". With the trip headsign now saying
    something real, leaving the platform there would override it at every call.
    The platform needs a platform-level stop, which needs the station hierarchy.
  - **The MSN header record is no longer a station.** It begins with `A`, like
    every station record, so it was read as one: stop `4/0`, named "F", off the
    coast of West Africa. This one is in the import, so a database needs
    re-importing to lose it.
  - **An empty `schedule` table gives an error that says so**, rather than a
    `TypeError` from the export.

### Patch Changes

- a3c697c: Stop `--gtfs-zip` producing a truncated feed.

  The build wrote each file through a CSV writer piped into a file and waited on
  the writer, which finishes when it has handed on its last row rather than when
  the row is on disk. A one second sleep stood in for the difference. That is not
  long enough to flush a 164 MB `stop_times.txt`, so the archive could be sealed
  around a partial file with nothing to indicate it.

  The output now waits for the files themselves, and the zip is written in process
  and awaited, so the command returns only once the archive is complete.

- Updated dependencies [b2d81cf]
- Updated dependencies [1d05d5b]
  - @gb-transit/feed-parser@0.2.0
  - @gb-transit/dtd-schema@0.2.0
  - @gb-transit/gtfs-output@0.2.0
  - @gb-transit/gtfs@0.2.0
  - @gb-transit/dtd-source@0.2.0

## 7.0.0

### Major Changes

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

### Patch Changes

- Updated dependencies [0f61a32]
  - @gb-transit/feed-parser@0.1.0
  - @gb-transit/dtd-schema@0.1.0
  - @gb-transit/dtd-source@0.1.0
  - @gb-transit/gtfs@0.1.0
  - @gb-transit/gtfs-output@0.1.0
