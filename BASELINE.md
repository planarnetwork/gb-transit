# Baseline changes

The baselines that belong to no single package: [`type-surface.json`](type-surface.json), which
records every name the libraries export, and
[`.github/validator-baseline*.json`](.github), which records what the nightly's real feed is allowed
to raise.

Each entry says what moved and why, so a diff in review can be checked against a reason rather than
taken on trust. CI fails a pull request that moves one without adding an entry here. A baseline
belonging to one package is explained in that package's own `fixtures/BASELINE.md` instead — an
entry here does not excuse a golden feed moving, and an entry there does not excuse this.

## The type surface

**Passing columns through a merge.** `@gb-transit/gtfs-loader` gains `readHeaders`, the header row of
each file in a feed, decompressing each entry only as far as its first line. An addition only.
`ReadFeedOptions` gains an optional `extraColumns`, which the surface records by name and so does
not show: the named columns the schema does not know, read onto the row as text. Without it
`readFeed` reads what it always did.

**Naming and drawing the trips couplings make.** `@gb-transit/gtfs-loader` gains `linkShapes`, which
makes the shapes of the trips `linkTrips` makes out of joins and splits. An addition only: `Trip` is
unchanged, and the through trip now fills the optional `routeId`, `shortName`, `headsign` and
`shapeId` it already had.

**Reading the lines back.** `@gb-transit/gtfs-loader` gains `ShapeID`, `ShapeIndex` and
`ShapePoint` — the id of a line, the lines of a feed indexed by it, and one point on one. Additions
only. `GTFSFeed` gains a required `shapes` and `Trip` an optional `shapeId`, which the surface
records by name and so does not show; `shapes` being required rather than optional is deliberate,
because a feed with no `shapes.txt` has no lines rather than an unknown number of them, and `{}`
says that without every caller writing `?? {}`.

**Drawing the line in the explorer.** No surface change: `@gb-transit/website` is private and is
not in the snapshot. `Tiles.ts` gains exported `unit` and `zoomFor` so the projection and the zoom
can be unit tested, which is the only part of `ui/` that is testable without a browser.

**Drawing the trips as lines through the passing points.** `@gb-transit/gtfs` gains `shapes` and
`FeedShapes` — the transform that turns each schedule's path into a `shapes.txt` polyline, and what
it returns. Additions only.

`Schedule` gains a `path` constructor parameter and property, and `Schedule.toTrip` gains a third
argument, neither of which this snapshot records: it pins the names a library exports and not their
shapes. Both are optional, so existing callers still compile — a `Schedule` built without a path
gets its shape from its calls, which is the same line minus whatever the caller never had.
`ScheduleBuilder`'s constructor gains a second optional argument for the same reason.

**Leaving the non-National Rail services out (#176).** `@gb-transit/gtfs` gains `excludeServices`,
`ServiceExclusions`, `NO_EXCLUSIONS` and `MODES` — the transform that drops the metro, bus and ship
services a config asks it to, the rules it reads, and the mode names those rules are written in.
Nothing is removed.

`BuildContext` and `BuildConfig` also gain an `exclude` field, which this snapshot does not record:
it pins the names a library exports and not their shapes. `BuildContext.exclude` is optional for
that reason — a caller constructs one to reach `BuildFeed` or `dateRange`, so a required field would
stop existing code compiling and the snapshot would not have said so. `BuildConfig.exclude` is
required, because `parseConfig` returns that type rather than taking it.

**Absorbing gtfsmerge and transxchange2gtfs.** `@gb-transit/gtfs-schema` gains `Columns`,
`FileSchema`, `fileSchema`, `GTFS_COLUMNS`, `GTFSFileName`, `GTFSColumn`, `RowWriter`, and
`Shape`/`ShapeID`/`ShapeRow`; `GTFSOutput` moves into it from `@gb-transit/gtfs`, which re-exports
it. `@gb-transit/gtfs-output` gains `CSVRowWriter`, `field`, `writeZip`, `deliverFeed` and
`workingDirectory`. Three packages are new: `@gb-transit/naptan`, `@gb-transit/txc-source` and
`@gb-transit/gtfs-read`.

**Keeping the TransXChange parsing in its app.** `@gb-transit/txc-source` is removed — it was never
published — and its source moves into `apps/transxchange2gtfs`. It had one consumer, its own app,
where `libs/dtd-source` has three; the symmetry with that package was the whole argument for it and
the symmetry does not hold.

**Folding the row reader into the loader.** `@gb-transit/gtfs-read` is removed — it was never
published — and its surface moves into `@gb-transit/gtfs-loader` as `readFeed`, `readFeedRows`,
`FEED_FILES`, `READ_COLUMNS`, `feedFileOf`, `toRow`, `RawFeed` and `RawOptions`, reached through
`loadGTFS(source, {raw: true})`. Nothing else moved: the reader is the same code under a different
name, and `loadGTFS`'s own surface is unchanged.

**Reading the operator, the trip names, the transfer mode and the areas** (#180, #181, #182).
`@gb-transit/gtfs-loader` gains ten names for the four files it now opens: `Route`, `RouteID` and
`RouteIndex` for routes.txt, `Agency`, `AgencyID` and `AgencyIndex` for agency.txt, `Area`, `AreaID`
and `AreaIndex` for areas.txt and stop_areas.txt read as one index, and `transferModes` for splitting
the pipe separated mode of a transfer. Additions only. The types already exported gained fields —
`GTFSFeed` has `routes`, `agencies` and `areas`, `Trip` has `routeId`, `shortName` and `headsign`,
`Transfer` has `mode` — which the surface records by name and so does not show.

**Coupling the two halves of a Sutton loop working (#161).** `@gb-transit/gtfs` gains
`reversingTrips`, `reversalRules` and `ReversalRule` — the transform that writes an in-seat transfer
between a train that terminates and the one it turns back as, the table of the places that happens,
and the shape of an entry in it. The table is a parameter of the transform so that a caller can pass
its own; it is exported for the same reason. Additions only.

**Reading a frequency-based trip.** `@gb-transit/gtfs-schema` gains `Frequency` and `FrequencyRow`,
and `frequencies.txt` joins the files it declares columns for; `@gb-transit/gtfs-loader` reads it.
It is a standard GTFS file that nothing here modelled, and a merge that dropped it lost the only
thing saying a bus comes every twelve minutes rather than at written down times. Additions only:
the file was previously unknown to both packages, so nothing that read a feed before reads one
differently now, beyond `readFeedRows` with no argument returning one more key.

## The validator baselines

**No passing points feed.** `.github/validator-baseline-passing-points.json` is gone, because the
nightly no longer builds or publishes `gtfs-passing-points.zip`. Its baseline accepted 25
`stop_time_with_arrival_before_previous_departure_time` by count — passes on the working clock
published between calls on the public one — and two new overlays of C17075 took that to 26 and
stopped every feed publishing on 12 and 13 September 2026. The standard and National Rail only
baselines are unchanged. `cif2gtfs --remove-passing-points=false` still builds the feed; nothing
publishes or validates it.

**A baseline for the National Rail only feed (#176).**
[`.github/validator-baseline-national-rail-only.json`](.github/validator-baseline-national-rail-only.json)
is new, for the third feed the
nightly publishes. Seeded from `validator-baseline.json`, which is the ceiling this feed cannot
exceed: it is the standard feed with services taken out, so nothing it accepts is new. Either may
turn out to be zero here — `QBN`/`QBS` are Blackpool bus-tram stops and the services reaching them
may be among the excluded — and `check-validation.mjs` reports a count under the baseline rather
than failing on it, which is the moment to tighten this file. A baseline of its own rather than a
shared one, for the reason the passing points feed has its own: a shared baseline accepts in one
feed what only happens in another, which is not a gate.
