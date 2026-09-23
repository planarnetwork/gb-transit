---
"@gb-transit/enrich-knowledgebase-stations": major
"cif2gtfs": minor
---

Take station accessibility from the National Rail Enquiries Knowledgebase.

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
