# @gb-transit/gtfs

GTFS entities, the GB rail transit model, the schedule transforms and the feed build.

```
npm install @gb-transit/gtfs
```

This is the core of the GB rail GTFS toolchain: the shape of every output file, the domain objects
the DTD timetable becomes, the transforms that turn one into the other, and the orchestrator that
runs a build. It has no IO dependencies — where the schedules come from and where the feed is
written are both interfaces.

A consumer building GTFS from something other than this project's MySQL schema needs this package,
not the `dtd2mysql` CLI.

## Building a feed

```ts
import {BuildFeed, buildContext, dateRange, stationCoordinates} from "@gb-transit/gtfs";
import {CifFileSource, timetableFeeds} from "@gb-transit/dtd-source";
import {FileOutput} from "@gb-transit/gtfs-output";

const context = buildContext(process.argv, process.env);

const feed = new BuildFeed(
  new CifFileSource(timetableFeeds(["./feeds"]), stationCoordinates, dateRange(context)),
  new FileOutput(),
  context
);

await feed.build("./gtfs");
```

`buildContext` settles the date the feed is built for and how far ahead it runs, from flags
(`--today`, `--range`) or the environment (`GTFS_TODAY`, `GTFS_RANGE`). Pinning `today` is what
makes a build reproducible: without it the feed is a function of the day it ran and cannot be
compared to yesterday's.

## What is in it

**Entities** — a type per output file: `Agency`, `Stop`, `Route`, `Trip`, `StopTime`, `Calendar`,
`CalendarDate`, `Transfer`, `FixedLink`, `Area`, `StopArea`, `Attribution` and `FeedInfo`, each with
its `*Row` form as written to text.

**The transit model** — `Schedule`, `ScheduleCalendar`, `Association` and the date and duration
helpers. Pure domain objects, no IO.

**Transforms** — the operations that make a publishable feed out of DTD records: `applyOverlays`
for short-term plan overlays, `applyAssociations` and `linkedTrips` for splits and joins,
`mergeSchedules`, `createCalendar`, `mergeTransfers`, `withStopPoints` for platforms, and the
identifier schemes in `stopId`, `stationId`, `agencyId` and `toRouteRow`.

**The build** — `BuildFeed`, `BuildContext`, `ScheduleBuilder` and `buildReport`.

## The two extension points

A source supplies the timetable:

```ts
interface TimetableSource {
  getStops(): Promise<Stop[]>;
  getSchedules(): Promise<ScheduleResults>;
  getAssociations(): Promise<Association[]>;
  getTransfers(): Promise<Transfer[]>;
  getFixedLinks(): Promise<FixedLink[]>;
  getFeedVersion(): Promise<string | null>;
  end(): Promise<any>;
}
```

An enricher adds detail the DTD does not carry:

```ts
interface Enricher<T = unknown> {
  readonly key: string;
  readonly dependsOn: readonly string[];
  readonly priority: number;
  readonly attribution?: Attribution;
  fetch(): Promise<T>;
  apply(feed: MutableFeed, data: T): EnrichmentReport;
}
```

`fetch` is separated from `apply` so the network happens once, up front; `dependsOn` orders the
enrichers, because one cannot join platforms that another has not created yet.

Enrichment records provenance rather than overwriting. Every write carries the enricher that made
it and its priority; the higher priority wins and the loser is kept, so a field can always be traced
to the source that set it.  `EnrichmentReport` — matched, unmatched and conflict counts — is a
first-class output rather than a log line, because it is the best signal that an upstream source has
changed under you. `@gb-transit/enrich-naptan` and `@gb-transit/enrich-knowledgebase-stations` are the
implementations.

An `Extension` is the other seam: whole files the core build has no concept of, such as the Fares v2
`areas.txt` written by `@gb-transit/extend-station-groups`.

## Licence composition

The sources a feed can be built from carry different terms — the DTD is under RSP terms, NaPTAN and
CORPUS are OGL, OpenStreetMap is ODbL and share-alike. `BuildConfig` takes a `licence` tier and a
build that would mix a share-alike source into an OGL feed fails rather than producing output whose
terms nobody can state.

## Requirements

Node.js 22 or later. Date handling uses `Temporal`, through
[`temporal-polyfill`](https://www.npmjs.com/package/temporal-polyfill), which hands over to the
built-in global on the versions that have one - Node 26 and later.

## Contributing

Issues, pull requests and the source live at
[planarnetwork/gb-transit](https://github.com/planarnetwork/gb-transit). This is `libs/gtfs` in that
repository.

## License

This software is licensed under [GNU GPLv3](https://www.gnu.org/licenses/gpl-3.0.en.html).

Copyright 2017 Linus Norton.
