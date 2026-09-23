# @gb-transit/fares-source

Read the DTD fares feed (RSPS5045) straight from its zips into memory, without a database.

```ts
import {loadFares} from "@gb-transit/fares-source";

const fares = await loadFares("data/feeds", {date: "2026-09-22"});

fares.flows.length;   // 682396
fares.fares.length;   // 7173414
```

`loadFares` takes a fares zip, a list of them or a directory. A directory is read from its most recent full refresh
(`RJFAF847.ZIP`) and the change files that follow it (`RJFAC848.ZIP`, `RJFAC849.ZIP`) are applied the way the dtd2mysql
importer applies them: I inserts unless the key exists, A replaces and D deletes. A change zip can also carry full files
for some extensions (`RJFAF848.TVL` inside `RJFAC848.ZIP`), which replace what came before.

With a `date`, only records valid on that date are kept, and only the fares on those flows.

## What is loaded

| Field | From | Shape |
|---|---|---|
| `locations` | LOC `L` | objects |
| `locationGroups` | LOC `G` and `M` | objects, members nested |
| `stationClusters` | FSC | objects |
| `ticketTypes` | TTY | objects |
| `nonDerivableFares` | NFO | objects |
| `flows` | FFL `F` | typed columns |
| `fares` | FFL `T` | typed columns |

Flows and fares run to millions of rows, so they are held as typed arrays with their codes interned in `codes`:

```ts
const {flows, codes} = fares;

codes.locations.value(flows.origin[0]);   // "0027", an NLC or a cluster ID
codes.routes.value(flows.route[0]);       // "01000"
String.fromCharCode(flows.direction[0]);  // "R" for reversible
```

Dates are numbers in the form `YYYYMMDD`. The record layouts come from `@gb-transit/dtd-schema`.

`FaresFeed` gives the same change-applied lines for any file in the feed, for reading something `loadFares` does not.
