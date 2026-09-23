![gtfsmerge](logo.png)

![npm](https://img.shields.io/npm/v/gtfsmerge.svg?style=flat-square)

gtfsmerge merges multiple GTFS feeds into a single one.

- Transfers are created between stops close enough to walk between
- Duplicate stops, agencies and routes are assumed to be the same and written once
- Calendars, calendar dates, routes, trips and stop times are re-indexed
- Identical calendars are merged into a single entry
- Calendars and calendar dates in the past are removed, along with their trips
- A calendar date with no calendar has one synthesised for it
- Unused stops are removed, and a transfer to one goes with it
- A call at a platform becomes a call at the station above it
- A `transfer_type` 4 coupling is carried through, pointing at the renumbered trips
- Routes can be removed based on their type (bus, rail, etc)
- Fares files are not processed. Please raise an issue if you would like this feature

## Installation

```
npm install -g gtfsmerge
```

Requires [node 22](https://nodejs.org) or above. No `zip` binary is needed — the archive is written
in process.

## Usage

Every argument but the last is a feed to merge; the last is where the merged feed goes, as a `.zip`
or a directory:

```
gtfsmerge input1.zip input2.zip output.zip
```

The distance in kilometres within which transfers are generated for nearby stops:

```
gtfsmerge --transfer-distance 2 input1.zip input2.zip output.zip
```

A column a feed carries that the merge does not write of its own is passed through as the feed
wrote it, after the merge's own columns - the rail feed's transfers say which mode a fixed link is and
when it runs, and those arrive in the merged feed. A column only one of the feeds has is empty in the
rows of the others. A column naming something the merged feed does not have is not passed through: a
transfer's route ids, which the merge renumbers, and `level_id`, `network_id` and the flexible
services' locations and booking rules, whose files it does not write.

Stops with the same id in different feeds are assumed to be the same stop, and there is no way to
say otherwise. A GB rail feed from [`cif2gtfs`](../cif2gtfs) and a GB bus feed from
[`transxchange2gtfs`](../transxchange2gtfs) both name a stop by its ATCO code, so they merge without
any reconciliation. Feeds that disagree about what an id means have to be reconciled before they get
here.

Routes can be removed based on their type:

```
gtfsmerge --remove-route-types 0,1,4 input1.zip input2.zip output.zip
```

Anything that finished before today is dropped. `--no-date-filter` keeps it all; `--date-filter
20260601` pins the cutoff, which is what you want for a reproducible merge:

```
gtfsmerge --date-filter 20260601 input1.zip input2.zip output.zip
```

Generated transfer distances use a flat-earth approximation calibrated at one latitude, 54 by
default, which is the middle of Great Britain. Elsewhere:

```
gtfsmerge --ruler-latitude 40 input1.zip input2.zip output.zip
```

`gtfsmerge --help` lists everything.

## Memory

A whole feed is held in memory while it is merged, so `bin/gtfsmerge.sh` runs node with
`--max-old-space-size=8000`. `stop_times.txt` is the only file that has to be buffered, and only
because the stop times cannot be renumbered until the trips have been — a two pass read would remove
the largest allocation in the tool.

## Contributing

This lives in the [dtd2mysql monorepo](../..). See its README for how to run the tests.

`fixtures/tiny` is two hand-written feeds covering the edges that merging two real feeds does not
reach, and `fixtures/tiny/golden` is what they merge to, committed as text so a change in behaviour
arrives as a readable diff. `UPDATE_GOLDEN=1 yarn vitest run` regenerates it; every movement needs an
entry in [`fixtures/BASELINE.md`](fixtures/BASELINE.md), and CI checks that it has one.

## License

This software is licensed under [GNU GPLv3](https://www.gnu.org/licenses/gpl-3.0.en.html).
