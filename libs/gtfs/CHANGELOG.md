# @gb-transit/gtfs

## 3.6.0

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

## 3.5.0

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

## 3.4.0

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

## 3.3.0

### Minor Changes

- 28cac53: Couple the two halves of a Sutton loop working with an in-seat transfer.

  A Thameslink service runs out of London via Wimbledon, terminates at Sutton, and starts again from
  the same platform two minutes later back towards London via Hackbridge. It is one unit and the
  passengers stay in their seats, but the CIF publishes it as two schedules with no association
  between them, so the only thing joining them in the feed was Sutton's interchange time — five
  minutes, against a two minute turnaround. A journey planner could not use the loop at all.

  `reversingTrips` writes those pairs as `transfer_type=4` rows, the same kind `linkedTrips` already
  writes for a split or a join, so a reader that already builds a through trip across a coupling
  builds one here without being told anything new. `libs/gtfs/src/data/reversal.ts` holds the two
  rules — one per direction round the loop — and says why the list is a whitelist: an in-seat transfer
  asserts the same unit carries on, which is true of the loop and is not true of every train that
  turns round quickly.

  A pair is coupled when both trains are the operator the rule names, the first ends where the second
  starts, each came in and left by the arm the rule names, both name the same platform there, the
  second leaves between one and ten minutes after the first arrives, and their calendars have a day in
  common. Neither schedule is narrowed to those days and the row carries no calendar of its own: the
  days the turnback happens are the days both trips run, which each trip already says.

  Two calls that name no platform are left alone rather than read as one place. `platformOf` answers
  null both to a call the source gave no platform and to one that named a running line, so a pair of
  nulls is the source saying nothing rather than the source putting two trains on one platform. It
  also makes the rule fail closed: if the CIF stops publishing Sutton platforms this writes nothing
  rather than inventing couplings, and says so in the build log.

  A pair a CIF association already couples is left to `linkedTrips`, whatever stop the association
  named, so the two cannot write the same row twice.

### Patch Changes

- Updated dependencies [315fec8]
  - @gb-transit/gtfs-schema@2.2.0

## 3.2.0

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

- d2c3ff6: Make the boarding points after the stations are final, not before.

  A station with platforms is published as a station row and a boarding point beneath each platform
  a train calls at, and each boarding point is a copy of its station with an id, a name and a platform
  code of its own. The copies were taken before the enrichers ran. An enricher is handed the stations
  alone — a source that knows where Clapham Junction is should not have to know it has sixteen
  platforms — so NaPTAN's surveyed position landed on the station and the copies underneath kept the
  DTD's rounded grid reference. Two rows for the same place, disagreeing, and `stop_times.txt`
  references the stale one.

  NaPTAN and the override file differ by more than 100 metres at 125 stations and by up to 3.2km, so
  that is the error a journey was planned from. It would have grown: retiring the override file leaves
  the boarding points on a grid reference rounded to 100 metres while their stations take NaPTAN.

  The stations are now enriched first and everything derived from them follows: the boarding points,
  and the headsigns, which named a train after the station as the DTD left it. Both now say what the
  station says. The boarding points are also derived from the schedules the feed publishes rather than
  from the schedules as they arrived, so a call dropped for referencing a station that is not in
  `stops.txt` no longer leaves a boarding point behind that nothing references.

  An extension still reads the whole feed, boarding points included. `MutableFeed.stations` is
  unchanged and enrichers see exactly what they saw before.

- 5d6c481: Put Bond Street back in Mayfair.

  Bond Street and both of its Elizabeth line platforms were published 21km east, in Dagenham. The
  override in `station-coordinates.ts` read `"stop_lon": 0.15`, which is the "51.514°N 0.15°W" of the
  station's Wikipedia infobox copied without the W. Canary Wharf had the same injury from the same
  source and was published 2.5km out, in the river off Blackwall. Both signs are now negative.

  Neither station could be rescued by anything downstream. NaPTAN ships its rail records for both with
  the position left blank, so they are two of the fourteen stations still relying on the override
  file, and the bounds check cannot see a London longitude with its sign lost — it is comfortably
  inside Great Britain.

  The DTD can. Its own grid reference put Bond Street on Davies Street all along, and `toStop`
  discarded it for the override without ever comparing the two. It now does: where an override and the
  grid reference disagree by more than 5km, the DTD's position is kept and the station is named on
  stderr, while the name and the accessibility the override also carries still apply. 5km is chosen to
  sit above every honest disagreement — the grid reference is rounded to 100m and Birmingham New
  Street's is 1.3km from the platforms, with the override in the right — and the largest across all
  2,764 stations both sources describe is 3.3km. A station the DTD could not locate at all has only
  the override, so it is taken as given.

## 3.1.0

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
  - @gb-transit/gtfs-schema@2.1.0

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

### Minor Changes

- 33612ec: Move the GTFS vocabulary into `@gb-transit/gtfs-schema` and re-export it.

  The entity types, the row types, `RouteType`, `TransferType`, `PickupDropOffType`, the
  `TUID`/`RSID` identifiers and the two scalar modules — `Duration` and `PlainDate` — now live
  in a package that depends on nothing. Every one of them is still exported from
  `@gb-transit/gtfs` under the same name, so no consumer needs to change and the pinned type
  surface of this package is unmoved.

  The reason is `@gb-transit/gtfs-loader`, which reads a GTFS feed and runs in a browser as
  well as in node. It wants to agree with the feed build about what a duration is and how a
  day of the week is numbered — four declarations, worth sharing precisely because the two
  sides must not drift. Taking them from `@gb-transit/gtfs` would have meant taking proj4,
  `memoized-class-decorator` and a calendar typed against `Temporal` along with them: none of
  it used, none of it removable, because a CommonJS-only package cannot be tree-shaken.

  Splitting downwards was the alternative to duplicating the declarations, and duplication is
  what the shared vocabulary exists to prevent. `libs/gtfs` keeps everything that has a
  dependency: the transit model, the schedule transforms, the source SPI and the build.

### Patch Changes

- Updated dependencies [610f8ef]
  - @gb-transit/gtfs-schema@2.0.0

## 2.0.1

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

## 2.0.0

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

## 1.0.0

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

### Minor Changes

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

## 0.2.0

### Minor Changes

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
