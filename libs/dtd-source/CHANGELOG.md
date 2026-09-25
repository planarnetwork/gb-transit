# @gb-transit/dtd-source

## 1.4.0

### Minor Changes

- 85add7a: `DownloadAndProcessCommand` stops at the first file that fails to process and rejects with its error,
  rather than logging it and going on to the next. The files are changes applied in order, so going on
  recorded a later one as processed and the failed one was never taken again.

### Patch Changes

- 85add7a: `CifFileSource.getTransfers` takes each station's minimum change time from the TIPLOC `getStops`
  chooses for it - the station rather than a subsidiary junction sharing its CRS - rather than from
  whichever rated TIPLOC the file lists first, and leaves out TIPLOCs with no CRS. A feed built from
  the files and one built from the database now agree on transfers.txt.
- Updated dependencies [85add7a]
  - @gb-transit/feed-parser@1.0.1
  - @gb-transit/gtfs@3.7.0

## 1.3.0

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
  - @gb-transit/gtfs@3.4.0

## 1.2.0

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
  - @gb-transit/gtfs@3.1.0

## 1.1.1

### Patch Changes

- Updated dependencies [610f8ef]
- Updated dependencies [33612ec]
  - @gb-transit/gtfs@3.0.0

## 1.1.0

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

### Patch Changes

- Updated dependencies [b675f63, 2a1ca37]
  - @gb-transit/dtd-schema@1.0.0
  - @gb-transit/feed-parser@1.0.0
  - @gb-transit/gtfs@1.0.0

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

### Patch Changes

- Updated dependencies [b2d81cf]
- Updated dependencies [1d05d5b]
  - @gb-transit/feed-parser@0.2.0
  - @gb-transit/dtd-schema@0.2.0
  - @gb-transit/gtfs@0.2.0

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
