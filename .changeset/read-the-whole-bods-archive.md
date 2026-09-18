---
"transxchange2gtfs": minor
---

Read a whole Bus Open Data Service archive, and say who runs what.

**A byte order mark no longer stops the conversion.** Two thirds of the documents in a national
archive begin with one, and an XML parser reads it as content before the first tag and rejects the
document. Documents are decoded through a `TextDecoder`, which drops it. A document that will not
parse is now skipped and counted rather than ending the run, and every stage that leaves something
out reports how much when the feed is built.

**`agency_id` is the National Operator Code.** It was the `Operator` element's `id`, which means
something only inside the document it is written in — `tkt_oid` is the id 167 different operators
give themselves, so keying on it collapsed them into one agency. The operator code and then the
local id are used where a National Operator Code is missing, and an operator the document describes
no further is named after its code rather than left blank. A service that names an operator its
document never declares also gets an agency, instead of leaving the route pointing at one that is
not in the feed.

**A stop with no longitude and latitude is placed from its grid reference.** NaPTAN leaves those two
columns empty for around 37,000 of its 435,000 stops and gives an easting and northing instead, so
without this they reach the feed with no position at all. A grid reference outside the National Grid
is refused rather than projected to wherever it lands. A stop the documents give no location is
written with empty coordinates rather than 0,0, and NaPTAN's padding is trimmed out of stop names.

**Stops either side of a street are grouped under a station of their own.** NaPTAN records this as a
GPBS stop area and does not publish the areas in the national CSV, so the grouping is worked out
from stops that share a name and a locality, stand within 150m of each other and face different
ways. The stops of a group get a `parent_station`, the group gets a row, and `transfers.txt` walks
between places rather than between their stops. `--skip-stop-areas` turns it off.

**`platform_code` is written** where NaPTAN's indicator names a stand rather than a relative
position. A bare `N` is both a stand at a bus station and a bearing on a street, so a stop whose
indicator repeats its own bearing is left without one.

**`--from` and `--to` set the days the feed describes**, defaulting to today and a year out. A
registration's own dates run from whenever it began to as far out as 2099 and say nothing about what
the feed can be trusted for, so a journey that runs on no day in the range is dropped and the
calendars of the rest are clamped to it. A window that ends before it starts is refused rather than
quietly producing an empty feed.

**Calendars are clamped before they are compared**, so two registrations that differ only outside
the window become one service rather than two. Clamping is what makes them coincide: a service
registered from 2018 and one registered from 2020 describe the same calendar inside a window that
starts after both. The dates a calendar is compared on are sorted for the same reason - an operating
profile lists its holidays in whatever order it likes.

**`feed_info.txt` is written**, with the window as its dates. TransXChange says nothing about what a
feed covers, and a registration's own dates are not an answer.

**A coach is `route_type` 200** rather than 3.
