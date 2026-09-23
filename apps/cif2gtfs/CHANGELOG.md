# cif2gtfs

## 2.4.0

### Minor Changes

- ee175f3: Enforce the `apply:` lists a build config declares.

  `MutableFeed` has always been able to hold an enricher to a set of fields, and
  `parseConfig` has always read `apply:` into the config it returns. The two were
  never connected: `BuildFeed` built its `MutableFeed` without an allowlist, so a
  config that read as taking NaPTAN's coordinates and not its names took both.

  `BuildFeed` now accepts the allowlist, `applyLists` turns the parsed config into
  the shape it wants, and `cif2gtfs` passes it. An enricher the config says
  nothing about stays unrestricted, which is what an absent `apply:` means; an
  empty list would mean the opposite.

  Nothing about the published feed moves. Both configured enrichers write exactly
  the fields their lists name, so the two nightly feeds are byte identical either
  way - which is what makes this safe to land on its own.

  Refusals are counted per enricher rather than as a total, reported in the build
  log and carried in `provenance.json`. Nothing checks the field names themselves

  - `parseConfig` validates the enricher key and the option names, not the
    contents of `apply:` - so a typo turns every write away and the count is what
    says so. A silently ineffective source is the thing this whole seam exists to
    prevent.

- 3948a50: Leave a fixed link out of `transfers.txt` by its mode.

  `exclude.links: [TUBE]` drops the DTD's tube links before they are merged into `transfers.txt`, for a
  feed that is combined with the Underground's own timetable - where a link saying the tube takes 23
  minutes from Euston to London Bridge competes with the trains that actually run. Only the links named
  go: a pair that is also a `TRANSFER` or a `WALK` keeps it, at its own time, which is why this happens
  before the links are merged rather than after, when a pair's time is already the shorter of the two.

- ee175f3: Take station accessibility from the National Rail Enquiries Knowledgebase.

  The DTD says nothing about whether a wheelchair user can get to a platform, so
  `wheelchair_boarding` has been coming from a hand-maintained table of 2,442
  entries that nothing checked and nothing refreshed. The Knowledgebase is the
  industry's own record of it - 2,613 stations, each with the step-free category
  its operator declared and the ORR audits, updated daily - and RSPS5050 publishes
  it as a JSON product of the Rail Data Marketplace.

  It joins on CRS. Every record has one, no two records share one, and the feed
  already identifies a station by it, so unlike NaPTAN there is nothing to
  reconcile.

  **Four of the five categories are `1`.** GTFS asks one question of a station -
  is there an accessible path from outside to at least one platform - which is
  coarser than the category answers. A is step-free to every platform, B1 and B2
  are step-free to every platform under a constraint, and B3 reaches only some; in
  all four a path exists. Only C, no step-free access at all, is `2`. The table
  this replaces read `2` as "partial" and put B3 and a third of B2 there, which is
  the opposite of what a consumer acts on: `2` is what tells a wheelchair user not
  to travel.

  The 37 stations the Knowledgebase has not classified are left exactly as they
  were rather than being set to the `0` that means "no information". Overwriting a
  value another source does have with an assertion that nobody knows is a loss
  dressed up as an enrichment.

  `stop_url` becomes the station's page on nationalrail.co.uk, which has the
  lifts, the ramps and the opening times the feed has nowhere to put. It was empty
  before, so this adds rather than replaces.

  The package is named for the feed rather than for the source, and the enricher
  key is `KNOWLEDGEBASE_STATIONS`: the Knowledgebase publishes several feeds, and
  incidents, ticket restrictions and the rest are different data arriving on
  different terms.

  Nothing goes in `stop_desc`. The feed has a paragraph of authored HTML about
  each station's step-free access, and that column already carries the CATE
  interchange status.

  Needs a Rail Data Marketplace subscription to the stations feed, read from
  `KNOWLEDGEBASE_API_KEY`. The 54MB response is cached for a week, and only a
  download needs the key.

### Patch Changes

- Updated dependencies [ee175f3]
- Updated dependencies [3948a50]
- Updated dependencies [ee175f3]
  - @gb-transit/gtfs@3.6.0
  - @gb-transit/enrich-knowledgebase-stations@1.0.0

## 2.3.0

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

## 2.2.0

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

## 2.1.0

### Minor Changes

- f9a4260: Leave the services National Rail does not run out of a feed, when a config asks.

  The CIF is the National Rail timetable and it carries services National Rail does not hold
  authority over: the tube, the Tyne & Wear Metro, the ferries and the scheduled buses. A feed
  combined with other sources has better answers for those elsewhere — TfL names the NaPTAN stop a
  replacement bus calls at and the letter route code it runs under, neither of which the CIF has — so
  publishing them here describes the same journey worse.

  A build config can now say what to leave out:

  ```yaml
  exclude:
    modes: [metro, bus, ship] # replacement buses are their own mode and stay
    operators: [ES, LT, TW, ZZ] # everything they run, replacement buses included
    replacementBuses: [LO, XR] # only their replacement buses; the trains stay
  ```

  Three lists rather than one switch, because they are three questions. The operators are a blacklist
  so that a National Rail operator this build has never heard of is published rather than silently
  dropped, and the mode rule cannot say what the operator rule does: a London Underground replacement
  bus is a replacement bus, and TfL is the one publishing it. Every list is empty unless a config says
  otherwise, so a build that says nothing about this produces the feed it always did.

  Config only. Everything else a build decides is a single value that a flag or an environment
  variable could also say; these are three lists of codes.

  `@gb-transit/gtfs` gains `excludeServices`, `ServiceExclusions`, `NO_EXCLUSIONS` and `MODES`, and
  `BuildContext` an optional `exclude`. The schedules are dropped after the overlays are applied, so a
  train replaced on some days by a service the rules exclude does not come back on those days, and
  before the associations, so a portion is not cut into coupled and uncoupled days for a base that is
  then excluded.

  The nightly publishes a third feed, `gtfs-national-rail-only.zip`, built from
  `gtfs.national-rail-only.config.yaml` with all three rules on. `gtfs.zip` and
  `gtfs-passing-points.zip` are unchanged.

### Patch Changes

- Updated dependencies [d2c3ff6]
- Updated dependencies [5d6c481]
- Updated dependencies [f9a4260]
  - @gb-transit/gtfs@3.2.0

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
  - @gb-transit/dtd-source@1.2.0
  - @gb-transit/gtfs@3.1.0
  - @gb-transit/gtfs-output@2.0.1

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
  - @gb-transit/gtfs@3.0.0
  - @gb-transit/gtfs-output@2.0.0
  - @gb-transit/enrich-naptan@1.1.0
  - @gb-transit/dtd-source@1.1.1
  - @gb-transit/extend-station-groups@1.0.2

## 1.0.1

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

## 1.0.0

### Major Changes

- First published release. `npm install -g cif2gtfs`.

  The package was private while there was no published feed to point people at. There is one now, so
  it goes to npm alongside the `@gb-transit` libraries it was held back with. No behaviour changes:
  the CLI, its flags and the feed it produces are what 0.1.0 built, and the mini fixture's golden is
  untouched.

  It now declares `main`, `types` and a `files` list of `dist` and `bin`, so the tarball is the built
  output rather than the working directory.

## 0.1.0

### Minor Changes

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
  - @gb-transit/enrich-naptan@1.0.1
  - @gb-transit/extend-station-groups@1.0.1
  - @gb-transit/gtfs-output@1.0.1

## 0.0.2

### Patch Changes

- Updated dependencies [b675f63, 2a1ca37]
  - @gb-transit/dtd-source@1.0.0
  - @gb-transit/enrich-naptan@1.0.0
  - @gb-transit/extend-station-groups@1.0.0
  - @gb-transit/gtfs@1.0.0
  - @gb-transit/gtfs-output@1.0.0

## 0.0.1

### Patch Changes

- Updated dependencies [b2d81cf]
- Updated dependencies [1d05d5b]
  - @gb-transit/gtfs-output@0.2.0
  - @gb-transit/gtfs@0.2.0
  - @gb-transit/dtd-source@0.2.0
