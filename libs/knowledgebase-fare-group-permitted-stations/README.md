# @gb-transit/knowledgebase-fare-group-permitted-stations

Read the National Rail Knowledgebase fare group permitted stations reference data.

```
npm install @gb-transit/knowledgebase-fare-group-permitted-stations
```

A reader, not an enricher. It turns `FareGroupPermittedStations_v1.0.xml` into records and stops
there — what a feed builder does with them is its own decision, and this package has no opinion and
no dependency on `@gb-transit/gtfs`.

Named for the feed rather than for who publishes it. The Knowledgebase has several, on different
terms, and this is the fare group one.

## Usage

```ts
import {permittedStations} from "@gb-transit/knowledgebase-fare-group-permitted-stations";

for await (const record of permittedStations("./FareGroupPermittedStations_v1.0.xml")) {
  console.log(record.fareGroup, record.fareLocation, record.routeCode, record.stations);
}
```

```
0254 0035 00000 [ 'CET', 'COL' ]
```

Three ways in, depending on what you already have and what you can afford to hold:

| | takes | gives |
|---|---|---|
| `permittedStations` | a path | an async iterable, one record at a time |
| `loadPermittedStations` | a path | a promise of every record |
| `parsePermittedStations` | the XML as a string | every record |

`inForce(record, "2026-09-23")` says whether a record applies on a day.

## What a record is

```ts
interface PermittedStations {
  fareGroup: NLC;          // "0254"
  fareLocation: NLC;       // "0035"
  routeCode: RouteCode;    // "00000", any permitted route
  startDate: string;       // "2018-05-21"
  endDate: string;         // "2999-12-31"
  stations: CRS[];         // ["CET", "COL"]
}
```

Which stations of a fare group a journey from one location may use, on one route, over one date
range. `stations` is the whole of the answer for that combination rather than an addition to another
record's.

## The feed, as published

Measured against the 1.0 document — 59MB, and every figure here is from it rather than from the
specification:

- **308,907 records** covering **42 fare groups**, 3,287 fare locations, 662 route codes and 111
  distinct station codes, with 688,956 station references between them.
- **Every record ends `2999-12-31`**, the industry's open-ended sentinel. Nothing has been withdrawn
  by an end date, so selecting on a day is in practice selecting on the start date.
- **Nothing is future-dated**, and the earliest start is 1973-05-21.
- **Every record names at least one station** — one to thirteen, two typically.
- The codes are fixed width and the dates are all `YYYY-MM-DD`. Not one record in the published feed
  departs from that.
- **26 combinations of group, location and route appear twice**, with two start dates and both
  ending on the sentinel. 24 of those pairs list identical stations, so the overlap is mostly
  restatement rather than disagreement. This package reports what the feed says and leaves choosing
  between them to the caller.

## Reading it without 551MB of heap

`permittedStations` writes a chunk to the parser and yields what that chunk produced, so the next
chunk is not read until the last one has been drained. On the published feed that is **78MB and 1.6
seconds**, against **264MB** to hold every record and **551MB** for the whole document as a DOM,
which is what `xml2js` would cost.

So the iterable is the one to reach for, and `loadPermittedStations` is there for a consumer that
was going to index the whole set anyway.

## Contributing

Issues, pull requests and the source live at
[planarnetwork/gb-transit](https://github.com/planarnetwork/gb-transit). This is
`libs/knowledgebase-fare-group-permitted-stations` in that repository.

## License

This software is licensed under [GNU GPLv3](https://www.gnu.org/licenses/gpl-3.0.en.html).

Copyright 2017 Linus Norton.
