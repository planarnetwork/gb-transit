---
"transxchange2gtfs": minor
"@gb-transit/gtfs-schema": patch
---

Read a whole Bus Open Data Service archive, and say who runs what.

Converting the national TransXChange bulk archive and comparing the result against the DfT's own
GTFS, built from the same source, turned up one bug that stopped the conversion dead and five that
made the feed wrong.

**A document beginning with a byte order mark ended the run.** 13,892 of the 20,503 documents in the
national archive, 68% of it, begin with one. `FileStream` decoded with `toString("utf8")`, which
keeps it, and the XML parser reads it as content before the first tag and rejects the document —
and because the parse happens in `XMLStream`, downstream of the per-entry guard in `readZip`, the
first one ended the conversion rather than being skipped. A `TextDecoder` drops the mark, and a
document that will not parse is now counted and skipped, which is what that guard was already
trying to do. What it counts, and what `FileStream` counts, is reported at the end of a run instead
of only being logged: a conversion that quietly skipped half its input used to look exactly like one
that skipped none of it.

**`agency_id` is the National Operator Code.** It was the `Operator` element's `id`, which means
something only inside the document it is written in. `tkt_oid` is the id that 167 different
operators give themselves, so all 167 became one agency under whichever trading name arrived first:
4,035 routes and 323,538 trips, 29% of the national feed, filed under "London United", and another
101,908 trips under an agency with no name at all. 111 of the 413 ids in the archive are shared by
more than one operator. All but one of the 20,502 operators carry a National Operator Code, which
means the same thing in every document; the operator code and then the local id are what is left
when it is missing, and an operator the feed describes no further is named after its code rather
than left blank.

**A stop with no longitude and latitude is placed from its grid reference.** NaPTAN gives 37,210 of
its 435,546 stops an easting and a northing and leaves the other two columns empty, and they were
read as they came: 13,392 of the stops in a national conversion arrived with no position at all, and
1,255,187 calls were made at a stop nothing could place. The projection agrees with the DfT's own
feed to within a metre. NaPTAN's padding is trimmed at the same time, which was reaching the feed as
897 stops with a leading space in the name.

**The feed says what it covers, and covers it.** `--from` and `--to` are the days the feed
describes, defaulting to today and a year out; a journey that runs on no day inside them is dropped
and the calendars of the rest are clipped to them. A registration's own dates run from whenever it
began to as far out as 2099 and neither is a statement about the feed — 117,984 journeys in the
national archive, 10.5% of it, do not run on any day in the next fifteen months. `feed_info.txt` is
written for the first time, with the window as its dates.

**The two sides of a street are one place.** NaPTAN records this as a GPBS stop area and does not
publish the areas in the CSV, so `StopAreas` works the grouping out from what the CSV does say:
stops of the same name, in the same NPTG locality, within 150m of each other and facing different
ways. Checked against the areas NaPTAN publishes for London, 6,185 of the 6,332 groups it finds
(97.7%) are exactly one NaPTAN stop area. The stops of a group get a `parent_station` and the group
gets a row of its own, and `transfers.txt` now walks between places rather than between stops — a
pair twenty metres apart was getting a footpath saying you can walk from a place to itself, and
every stop of one place got its own footpath to every stop of the next. `--skip-stop-areas` turns it
off.

**`platform_code` is written**, where NaPTAN's indicator names a stand rather than a relative
position, and **a coach is `route_type` 200** rather than 3, which is the extended type the schema
gains for it.
