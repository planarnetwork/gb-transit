# Baseline changes

Every change to a committed baseline is recorded here, with the reason and the ticket. CI fails a
commit that touches one without an entry.

The baselines capture *current* behaviour, defects included. That is the point: rebaselining is the
normal path for a correctness fix, and the diff is the evidence the fix did what it claimed. The
requirement is that it is deliberate and explained, not that it is rare.

Add an entry to the top. `UPDATE_GOLDEN=1 yarn vitest run apps/cif2gtfs` regenerates the mini
golden; `UPDATE_SURFACE=1 yarn vitest run libs/gtfs` regenerates the type surface. **Read the diff
before committing it** - that is the whole value of the file being text.

---

## A boarding point no longer answers for its station's accessibility

`golden/stops.txt` moves in one column, `wheelchair_boarding`, on 129 of its 345 rows. Every one is
a boarding point; not one station changes, and no other column moves on any row.

On a child stop the spec reads `1` as "there is an accessible path from outside to this platform"
and `0` as "inherit from the parent station". Every source the build has answers for the station as
a whole - a category B3 station is step-free to some of its platforms and nobody publishes which -
so `withStopPoints` copying the station's value down asserted something per platform that nothing
knows. A station with step-free access to two of its four platforms said `1` on all four.

`0` says to read the station, which is where the answer is. The station rows are untouched, so no
information leaves the feed: it stops being claimed in a place it was never true.

The mini fixture runs no enrichers, so the values that moved came from `station-coordinates.ts`.
This is independent of where a station's accessibility comes from.

## Every trip is drawn as a line

`golden/shapes.txt` is new and `golden/trips.txt` gains a `shape_id` column. Both come from
`Schedule.path`, which the builder now carries alongside the calls: every station a train touches,
whether it stops there or runs through.

Three things to check in the diff.

**trips.txt moved in one column and nothing else.** Every other field of every row is unchanged.
The passing points now reach `ScheduleBuilder` in every build rather than being filtered out at the
source, so this is the file that would show it if keeping them had changed which calls are
published. It does not, because the builder drops them from the stop times exactly where the
source used to.

**stop_times.txt did not move at all.** It is the same 1,326 rows. That is the load-bearing
assertion of the whole change: the standard feed still holds only the calls.

**25 shapes for 128 trips, and 111 of those trips are drawn through more stations than they call
at** — one has 19 calls and 51 points. A shape is shared by every stopping pattern that runs over
the same ground, which is why there are fewer shapes than trips, and it follows the passing points,
which is why it has more points than the trip has calls. `build.spec.mts` asserts both, so a build
that quietly went back to drawing through the calls would fail rather than produce a smaller golden.

The ids are twelve hex characters of a digest of the stations the line runs through, so they are
stable across builds and a regenerated golden that changes one is saying the path changed.

---

## The type surface gains gtfs-schema and gtfs-loader

Two added keys in `type-surface.json`, and **the `gtfs` key is byte identical**. That was the point
of the change and it is the thing to check in the diff: `@gb-transit/gtfs` moved its entity types,
row types, enums, `TUID`/`RSID` and the `Duration` and `PlainDate` modules into
`@gb-transit/gtfs-schema` and re-exports every one of them under the same name, so no consumer of
that package sees anything move. If the `gtfs` key ever changes in a diff like this one, the
re-export is not faithful and something has been dropped.

`gtfs-schema` publishes 49 names. All but one were already exported from `@gb-transit/gtfs`; the
exception is `PickupDropOffType`, which `libs/gtfs` was deep importing from `entity/StopTime` and
exporting from nowhere. It is part of the schema, so the schema publishes it. `@gb-transit/gtfs`
still does not, which is why its surface is unmoved.

`gtfs-loader` publishes 53 names, the GTFS reader brought over from raptor. Eight of them collide
with `@gb-transit/gtfs` — `Stop`, `StopTime`, `Trip`, `Transfer`, `Calendar`, `TripLink`, `StopID`,
`FeedInfo` — deliberately: one set is the rows a GB rail feed is written as, the other is what any
feed is read into. They are not to be merged. The surface is wider than raptor's own public API
because raptor's planner reaches into `src/gtfs` directly, and every one of those names has to
survive the move for raptor to be able to consume the package.

No golden changed. The mini feed is unmoved; it is now also read back by
`libs/gtfs-loader/src/GoldenFeed.spec.ts`, which loads it through the reader and asserts the
`transfer_type: 4` rows cif2gtfs writes are the couplings the reader joins.

## The passing points feed accepts 25 backwards times, not 24

**The nightly has failed every night since #152 landed.**
`.github/validator-baseline-passing-points.json` takes
`stop_time_with_arrival_before_previous_departure_time` from 24 to **25**. No code changed under it:
#152 merged at 21:04 on 4 September, after that morning's nightly, so the 5th was the first run to
build the second feed at all. The gate has never passed, rather than having passed and broken. Runs
`33956103396` and `34023683835` both report 25, and both stop before the release step - no feed has
been published from either.

Rebuilt from the 6 September refresh over the same 2026-09-06 to 2026-12-06 window and validated
with the same 8.0.1 jar: **25**, with `point_near_origin` holding at 2 and no other error. The
standard feed is unmoved at 1, so this is the passing points alone.

Enumerated rather than counted. 24 of the 25 are a passing point followed by a call, which is the
two-clocks disagreement the baseline already describes; the 25th is `Z03536`, the one the standard
baseline accepts. Six schedules produce all of them - `C02034`, `C02035`, `C04552`, `C17075`,
`C31860` and `Z03536` - and a schedule contributes one occurrence per dated trip it runs, which is
why the total wanders without anything being wrong.

Against the 22 measured on #160's branch, the 3 are `C31860`, which is new to the refresh and passes
`BLAYDON` at `1646H` before calling at `GTSHDMC1` with a public arrival of `1646`, and two more
dated trips of `C02034` on 8 and 29 November. Both are the same shape as the 22, so nothing here is
a defect that appeared - it is the calendar under five schedules moving.

Raised rather than given headroom. The number is a function of how many days those five run, so it
will move again; the `why` now names them, so the next recount is a rebuild and a diff of that list
rather than a rediscovery. A cap that is a known quantity is the whole value of the file.

## An overnight portion is published once, on its own day

**#160, following #158.** A schedule that runs the day after its base was published twice: once told
in the base's service day, at times past 24:00, and once on the day its own record gives. Both are
the same train, so a departure board built from the timetable showed it leaving twice.

Only the second is published now. `golden/trips.txt` goes from 150 back to **128** and
`golden/stop_times.txt` from 1,590 to 1,326: every `C04543_*` and `C04577_*` told in the base's day
is gone, and the Tuesday 04:28 the Aberdeen portion actually leaves Edinburgh at is what remains.
This supersedes the second half of the F4 entry below, which recorded the double publication when it
arrived.

`golden/transfers.txt` **stays at 293 rows** and every one of them still resolves; 22 of them now
name the next day's trip - `C04569_20260518_20261207` couples to `C04543_20260519_20261208` rather
than to a copy dated the 18th. A transfer carries no calendar and GTFS does not ask the two trips it
names to run on one service day, so this is the correct reading of a coupling that happens over
midnight, and `applyAssociations` still cuts the associated schedule to the days the association is
in force.

Journey planners that cannot follow a coupling across a service day get the copy back behind
`--duplicate-overnight-associations` / `duplicateOvernightAssociations: true`, which is off. With it
on the coupling names the copy rather than the dated trip, and the feed carries the same train twice
on purpose. The nightly does not pass it, so no published feed moves except as described above.

Feed-wide it is 108 trips and 1,057 stop times, with `transfers.txt` unchanged at 7,732.

**All three validator baselines are unchanged, measured rather than assumed.** The mini feed raises
the same twelve accepted notice types and no error. Both feed-wide baselines were checked by
building the whole network on this branch and on master and validating all four feeds: no notice
type appears or disappears, the two errors either baseline caps hold at their maxima
(`point_near_origin` 2, `stop_time_with_arrival_before_previous_departure_time` 1 standard and 22
with passing points), and the only counts that move are two INFO types neither file lists -
`big_gap_in_service` 3,690 to 3,689 and `service_window_outside_feed_period` 5,394 to 5,393, one
each for the duplicate that is gone.

The passing points feed reports 22 against a baseline of 24. Master reports 22 too, so that is the
refresh moving under it rather than anything here, and it is left for whoever recounts it next.

## Passing points, available and off

**No change to any feed by default**, and the mini golden is untouched: `--remove-passing-points` is
on, so a build that says nothing drops the locations a service runs through exactly as it did.

`validator-baseline.json` moves to `.github/`, beside the workflows that are the only things that
read it, and `.github/validator-baseline-passing-points.json` joins it. The second baseline holds the
feed built with `--remove-passing-points=false`, which the nightly now publishes as
`gtfs-passing-points.zip` alongside the standard one.

It accepts 24 `stop_time_with_arrival_before_previous_departure_time` against the standard feed's 1.
The 23 extra are the CIF's two clocks disagreeing: a call publishes its public time and a passing
point has only its working time, so `C17075` passes `SELYOAK` at `2116H` and then calls at `UNVRSYB`
with a public arrival of `2115`. Correcting it would mean inventing a time for one of them.

Measured after merging master, where F4 took the standard feed from 4 to 1 by decomposing the
`G38297`/`G38968` join at Swansea into two trips that each read forwards. The same three go from this
feed, so it is 24 rather than the 27 this branch was written against; the 23 the passing points
themselves bring are unchanged.

A passing point names its platform, per review on #152. The first version dropped it on the grounds
that a train runs through on a line rather than a platform. Measured, that is wrong twice over: 89%
of passing calls land on a boarding point something already stops at, so the platform is real and the
id is the one a stopping call uses; and dropping it produced *more* stops, not fewer, because 99
station-level children had to be minted with nothing but passing calls to host. Keeping it reuses
what is there and adds 12 - `stops.txt` is 9,241 against 9,328, and 9,182 in the standard feed. The
validator counts are unchanged either way, so the baseline above holds.

Also fixed, and visible in neither baseline because the fixture has no case of it: where two of a
service's timing points share a CRS, a request stop is `pickup_type` 3 rather than 0 and so had
nothing to win the station with. 28 of them were displaced by the point the service passes on the way
in, which moved `3,3` on the full feed from 17,363 to 17,335. Both feeds now agree at 17,363. The
count moved with #162 and #163, which changed what an activity maps to; the 28 did not.

## An unadvertised stop is not a drop off either

**#162.** Activity `N`, "stop not advertised", gated `pickup_type` and not `drop_off_type`, so a
stop the public cannot use was published as one they could alight at. It now gates both, and it
takes precedence over `R` - an unadvertised request stop is no stop at all, where it used to come
out as `3`, "coordinate with the driver".

`golden/stop_times.txt` moves **23 rows from `1,0` to `1,1`**, and nothing else in the feed moves.
Every one of them is the last stop of a linked trip leg, activity `TF N`: `C04558` at Carstairs
(12 rows) and `C04551` at Edinburgh (11). Those are the joining stops F4 created - the passenger
stays in their seat across the `transfer_type=4` link rather than getting off, which is exactly
what the source says by not advertising the call. The legs are pick up only for their whole length
and now have no drop off at all, which reads oddly in isolation and is correct: the drop off is on
the trip they are coupled to.

Entered after the commit rather than with it. The CI step that requires this file to move ran on a
shallow checkout, where `git diff base...HEAD` fails with `no merge base` and the `|| true` on it
turned the failure into "no baselines changed" - the guard has passed every pull request without
checking one.

## F4 · Splits and joins as linked trips

*Superseded in part by the overnight entry above: a coupling now names the associated schedule on
the day its own record gives, and neither the 28:28 copy nor the second publication described below
is in the feed. What this entry says about concatenation, `transfers.txt` and the MySQL table still
holds.*

**Closes #81 and #80.** Associated schedules are no longer concatenated into their base. Both
schedules keep their own stops and their own trip, and the association is written as a
`transfers.txt` row with `transfer_type=4` and `from_trip_id`/`to_trip_id`.

`golden/trips.txt` **stays at 128 trips**. The 56 concatenated ones - `C04547_C04566`,
`C04551_C04566`, `C04558_C04561`, `C04569_C04543`, `C04569_C04577` - are replaced one for one by the
associated schedule under its own TUID, and `golden/transfers.txt` gains 56 `transfer_type=4` rows.
The trip count does not move because the base was always emitted alongside the concatenation; what
goes is the duplication, and `golden/stop_times.txt` loses the leg that was written twice.

`transfers.txt` gains **`from_trip_id` and `to_trip_id`**, in the spec's field order after
`to_stop_id`. Both are empty on every interchange and fixed-link row. `min_transfer_time` is now
empty on a linked-trips row, where the passenger does not get off. The MySQL `transfers` table takes
the two columns into its primary key, because the pair of stops is only unique once the trips are
part of it - a coupling happens at a station the feed already gives an interchange time for.

**`C04569`/`C04543` is the case to read.** The Aberdeen portion is now its own trip, dated on the
Monday the sleeper left Euston and departing Edinburgh at **28:28**, linked from the base's 28:20.
A transfer carries no calendar, so the two trips have to agree which day they are coupled on, and
the day the base ran is the one they share - `applyAssociations` cuts the associated schedule to the
days the association is in force, so the days the two trips share are the days the coupling happens.

`validator-baseline.json` (root) drops `stop_time_with_arrival_before_previous_departure_time` from
4 to 1. Three of the four were `G38297`/`G38968` at Swansea, where the source has the joining train
arriving after the train it joins has left; that contradiction is still in the feed, but it is now a
coupling between two trips that each read forwards.

**A schedule that runs the day after its base is published twice.** The coupling wants both trips on
one service day, so the associated schedule is told in the base's - which turns a Swansea departure
at 08:41 into 32:41 the day before, no use to anyone boarding it there. It is now also published on
the day its own record gives, at its own times, every day it runs. `golden/trips.txt` goes from 128
to 150: `C04543` is a Monday at 28:28 for the coupling and a Tuesday at 04:28 for a passenger.

Not where it departs before 02:00, because `shiftLateNightServices` would move that copy straight back
onto the base's day and leave the same trip twice. Feed-wide: 155 trips and 1,479 stop times more,
`transfers.txt` unchanged.

**A trip that joins another is headed for where it ends up.** The Carstairs portion terminated at
Carstairs in the timetable and read that way, when everyone on it carries on to Euston - 1,537 trips
feed-wide. Unlike a divide the answer does not change partway along, so it is `trip_headsign` rather
than the stops. A divide whose base terminates at the divide keeps its own destination and says the
rest with `stop_headsign`, as any divide does.

**`stop_times.txt` gains `stop_headsign`, which was empty on every row.** A trip is headed for where
it ends, so the London Bridge to Caterham says Caterham - and stops naming the front half coming off
at Purley for Tattenham Corner. The concatenation used to say it by accident, in a trip that ran
through to one of the two, so this is information the change would otherwise lose. `stop_headsign`
overrides the trip headsign at a stop, which is where the answer belongs, because it changes partway
along: **"Caterham and Tattenham Corner" as far as Purley Oaks, and nothing from Purley on**, where
the trip headsign is right by itself.

In the fixture that is the Highlander, headed **"Inverness, Aberdeen and Fort William"** to Carlisle
and Inverness alone from Edinburgh, where both divides happen. Feed-wide it is 8,744 stop times
across 1,264 trips and 58 distinct headsigns, at most three destinations. A destination is named once
however many trips divide off for it - a schedule with a permanent record and an overlay of it is two
trips going to the same place. Joins get nothing: once two trains are one they have one destination,
which the trip headsign already gives.

**It is the first quoted value in the feed.** `"Inverness, Aberdeen and Fort William"` has a comma in
it, so the CSV writer quotes it, and nothing in any file has ever needed that. The `columns` helper
in `build.spec.mts` split on every comma and now parses quoted fields; a consumer doing the same will
need the same fix.

**What a split cannot say.** The coupling reads "stay on board and you are on the portion", while the
base carries on to its own destination as well. Which of the two a passenger stays on depends on
which coaches they are in, and GTFS has no way to say that - so a planner may offer both. Publishing
the portions separately is still nearer the truth than a concatenation that offered only one of
them, but it is a limitation rather than a complete answer.

The fixture baseline accepts **`transfer_with_suspicious_mid_trip_in_seat`** (WARNING, 56). The
coupling is anchored part way along the base on purpose, because the base is not cut at it. The
validator says intentional mid-trip transfers can ignore this, and cutting the bases to silence it
would add a trip per association and turn a through journey into a change of trains for anything
that does not read `transfers.txt`.

`type-surface.json` gains `AssociationApplication`, `AssociationLink`, `AssociatedSchedules`,
`TripLink` and `linkedTrips`. `applyAssociations` now returns the schedules and the links rather
than the schedule index alone.

## NaPTAN station names, available and off

**No change to any feed by default.** `type-surface.json` gains `stationName` from `enrich-naptan`;
`NaptanEnricher` gains a fourth constructor argument, defaulted to the behaviour it already had.

With `options: {names: true}` the enricher takes NaPTAN's station names, stripped of the
"Rail Station" suffix - `NEWCASTLE AIRPRT` becomes `Newcastle Airport`. See `docs/station-names.md`
for where the two sources disagree, and D7 for why it matters.

## D8 · attributions.txt

`golden/` gains **`attributions.txt`**, with one row: Rail Delivery Group, the source of the
timetable. Nothing else in the feed moves.

It is written whatever ran, because the timetable always needs crediting. With an enricher
configured it gains a row per source - the nightly, which runs NaPTAN as of #143, now credits the
Department for Transport under the Open Government Licence. **That was the point of the ticket: OGL
makes acknowledgement a condition of use.** This landed before the first nightly that would have
used NaPTAN, so no published feed ever carried DfT coordinates uncredited.

`attribution_licence` is a producer extension. The spec has `organization_name` and a URL and no
field for the terms, which is the one thing an attribution statement has to say. `unknown_column`
is already accepted for the twelve columns B2 added to `transfers.txt`.

`type-surface.json` gains `AttributionRow`, `AttributionRole`, `createAttributions` and
`TIMETABLE_ATTRIBUTION`; `Attribution` gains an optional `role`. All additions.

## D12 · the extension SPI and station groups

`type-surface.json` gains the extension exports from `libs/gtfs` - `Extension`, `ExtensionFile`,
`ExtensionOutput`, `ExtensionReport`, `FeedView`, `extend`, `checkKeys` and `ExtensionConfig` - the
Fares v2 entities `Area`, `AreaID`, `AreaRow`, `StopArea` and `StopAreaRow`, and the whole surface
of the new `extend-station-groups` package. `MutableFeed` gains `station()`, which finds a station
by CRS rather than by the ATCO code the feed publishes.

Every entry is an addition; nothing is renamed or removed, so no consumer breaks.

**No feed output changes unless an extension is configured.** `extensions:` was validated and
dropped before this, so a config naming one was already doing nothing.

## D1 · the enricher SPI

`type-surface.json` gains the enrichment exports from `libs/gtfs`: `Enricher`, `EnrichmentReport`,
`Attribution`, `MutableFeed`, `Provenance`, `Write`, `FieldHistory`, `enrich`, `order` and
`provenanceFile`, plus the build config types. `GTFSOutput` also gains `write`, for files that are
documents rather than tables. No feed output changes unless an enricher is configured.

This is the surface other packages implement against, so from here a rename is somebody else's
build breaking, which is the reason the snapshot exists.

## B23 · platforms as child stops, in NaPTAN's identifiers

**Every id in the feed changed.** `stop_id` is the ATCO code - `910G` and the TIPLOC for a station,
`9100` and the TIPLOC of the timing point and the platform for a place a passenger boards - and
`agency_id` is the NOC code, `=SN` rather than `SN`. `stop_code` is the CRS, which was `stop_id`.

`stops.txt` goes from 195 rows to 345 in the fixture: all 195 stations become `location_type=1` and
every distinct timing point and platform called at becomes a child - 150 of them, of which 26 carry
no platform, for the calls that name none. `stop_times.stop_id` points at the child, `transfers.txt` at
the station, and `routes.txt` carries the prefixed agency. Nothing else moves.

## B10, B11, B12 · places that do not exist

`stops.txt` loses the `XAG` CIE station, which has an all-zero coordinate and nothing calling at it,
and the `QXD`/`QXO` operator placeholders. `transfers.txt` loses their three self-transfer rows.
`routes.txt` loses the XC placeholder route and renumbers the two after it. `trips.txt` loses the
two trips that called only at placeholders.

## B1, B2 · transfers and feed_info

`links.txt` is gone by default and its rows are in `transfers.txt` with the mode, window and days as
extension columns. `feed_info.txt` is new.

## B15 · stops the feed does not declare

No change to the fixture, which has no dangling calls. Recorded so the absence is deliberate.

## Reading publishes its junction rather than its station

`stops.txt`: Reading is `910GRDNGSTN` in place of `910GRDNGORJ`, and gains `stop_desc` 2 in place of
9. A CRS can have several TIPLOCs and whichever arrived first used to win; a
`cate_interchange_status` of 9 marks a subsidiary location, so the station is now preferred over the
junction sharing its code. 75 stations change on the full feed, one in the fixture.

The TIPLOC was `stop_code` when this landed and is the station's half of `stop_id` now, which is
what makes it worth getting right: it is the id NaPTAN and the DfT's GTFS use.

## B4, B7, B8, B9, B13 · things that are not true

`trips.txt` gains real headsigns and loses the `wheelchair_accessible=1` claim. `stop_times.txt`
loses the platform from `stop_headsign`. `stops.txt` loses the MSN header record, stop `4/0`.
