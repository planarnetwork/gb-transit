---
"@gb-transit/knowledgebase-fare-group-permitted-stations": major
---

Read the National Rail Knowledgebase fare group permitted stations feed.

`FareGroupPermittedStations_v1.0.xml` says which stations of a fare group a
journey from one location may use, on one route, over one date range. A new
package turns it into records and stops there: it is a reader rather than an
enricher, has no opinion about what a feed does with them, and depends on
nothing in this repository.

Named for the feed rather than for who publishes it, like
`enrich-knowledgebase-stations`. The Knowledgebase has several feeds on
different terms and this is the fare group one.

Three ways in. `permittedStations` takes a path and yields records as it reads
them, `loadPermittedStations` takes a path and gives all of them, and
`parsePermittedStations` takes the XML as a string for a fixture or a document
already in memory. `inForce` says whether a record applies on a day.

**The iterable is the one to reach for.** The published feed is 59MB and 308,907
records; reading it whole into a DOM, which is what `xml2js` does and what the
only XML parsing here does today, costs 551MB of heap. Writing a chunk to the
parser and yielding what that chunk produced is **78MB and 1.6 seconds**,
because the next chunk is not read until the last has been drained. Holding
every record is 264MB, which is what `loadPermittedStations` is for.

`sax` is a direct dependency now rather than one `xml2js` happened to bring; it
was already in the lockfile at the same version, so only its types were
downloaded.
