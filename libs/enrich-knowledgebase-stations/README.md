# @gb-transit/enrich-knowledgebase-stations

Station accessibility from the National Rail Enquiries Knowledgebase stations feed.

```
npm install @gb-transit/enrich-knowledgebase-stations
```

An `Enricher` for [`@gb-transit/gtfs`](https://www.npmjs.com/package/@gb-transit/gtfs). The DTD
timetable says nothing at all about whether a wheelchair user can get to a platform. The
Knowledgebase is the industry's own record of it — 2,613 stations, each with the step-free category
its operator declared and the ORR audits, updated daily — and this fills in `wheelchair_boarding`
and `stop_url` from it.

Named for the feed rather than for the source. The Knowledgebase publishes several, and incidents,
ticket restrictions and the rest are different data arriving on different terms.

## Usage

```ts
import {
  KNOWLEDGEBASE_STATIONS,
  KnowledgebaseStationsEnricher,
  knowledgebaseStationsFromApi
} from "@gb-transit/enrich-knowledgebase-stations";
import {BuildFeed} from "@gb-transit/gtfs";

const feed = new BuildFeed(source, output, context, [
  new KnowledgebaseStationsEnricher(
    knowledgebaseStationsFromApi("/tmp/knowledgebase-cache", process.env.KNOWLEDGEBASE_API_KEY!)
  )
]);
```

`knowledgebaseStationsFromApi(cacheDir, apiKey)` downloads the feed and caches it for a week — it is
54MB, and a nightly that fails because the marketplace is briefly down has failed for no good
reason. A third argument changes how long a copy is current for. `parseKnowledgebaseStations` takes
the JSON directly if you would rather supply the file yourself, which is also how to run with a
cache and no key.

The enricher's second argument is the priority it writes at, 50 by default.

## The key

The feed is [RSPS5050](https://www.rspaccreditation.org/publicDocumentation.php#RSPS5050), served
from the [Rail Data Marketplace](https://raildata.org.uk/) as *National Rail Knowledgebase Stations
Feed (JSON)*. Subscribing to that product gives a key, which is sent as the `x-apikey` header. A
`401` means the key is wrong; a `403` means it is right and the subscription does not include this
product.

## What it writes

It joins on **CRS**, which is the code the feed identifies a station by and the one the
Knowledgebase publishes. Every record has one and no two records share one, so unlike NaPTAN — which
has to go through the TIPLOC — the join needs no reconciliation.

| field | from |
|---|---|
| `wheelchair_boarding` | the step-free access category |
| `stop_url` | `https://www.nationalrail.co.uk/stations/<slug>/` |

### The category, and the three values GTFS has

GTFS asks one question of a station: is there an accessible path from outside to at least one
platform. That is coarser than the category answers, so four of the five categories come out as `1`.

| category | | `wheelchair_boarding` |
|---|---|---|
| A | step-free access to all platforms | `1` |
| B1 | step-free access with a constraint — one direction only, or a route worth warning about | `1` |
| B2 | as B1 | `1` |
| B3 | step-free access to some platforms only | `1` |
| C | no step-free access to any platform | `2` |
| — | not classified: 37 stations | left alone |

`2` is what tells a wheelchair user not to travel, and it belongs only to C. The distinction between
A, B1, B2 and B3 is real and does not fit in a field with three values; `stop_url` points at the
page that has it.

A station the Knowledgebase has not classified is **left exactly as it was**, rather than being set
to the `0` that means "no information": overwriting a value another source does have with an
assertion that nobody knows is a loss dressed up as an enrichment.

## What it does not write

Names, coordinates and the minimum connection time, all of which the feed carries. Names and
coordinates are NaPTAN's job here and taking a third opinion on them would be a contest rather than
an improvement; interchange times are already in the DTD's `MSN`.

Nor `stop_desc`. The feed publishes a paragraph of prose about each station's step-free access, and
it is authored HTML rather than a field — and in this project `stop_desc` already carries the CATE
interchange status. A GTFS column with three values and a link to the page is the whole of what this
package claims to offer.

## What it records

Every write carries this enricher's key and priority, so `provenance.json` can say which source a
value came from and what it displaced. The `EnrichmentReport` gives the matched and unmatched
counts, and names what the unmatched are — the feed carries the Underground, the Metro, trams,
ferries and buses, none of which has a Knowledgebase record.

Attribution is declared by the enricher and published in the feed's `attributions.txt`.

## Contributing

Issues, pull requests and the source live at
[planarnetwork/gb-transit](https://github.com/planarnetwork/gb-transit). This is
`libs/enrich-knowledgebase-stations` in that repository.

## License

This software is licensed under [GNU GPLv3](https://www.gnu.org/licenses/gpl-3.0.en.html).

Copyright 2017 Linus Norton.
