# Baseline changes

Every movement in `fixtures/mini/golden` is written up here, with what changed
and why, so a diff in review can be checked against a reason rather than taken on
trust. CI fails a pull request that moves a golden without adding an entry.

## Absorbed into the monorepo

`fixtures/mini/golden` is new. transxchange2gtfs had no fixtures of any kind and
no test that constructed a `Converter` or produced a feed — `Converter`,
`FileStream`, `GetStopData`, `cli` and `Container` had zero coverage between them.

The feed differs from what the standalone tool produced, in these ways and no
others:

**A file with no rows now has a header.** The header used to be pushed by the
stream, ahead of its first row, so a stream that received no chunks produced a
zero-byte file. The writer emits it when the file is opened.

**Quoting is correct on a newline.** The hand-rolled `quote` escaped an embedded
quote and quoted on a comma or a quote, but not on a newline, so a stop name
containing one produced a broken row. The shared writer quotes on all three.

**An absent value is empty rather than the text `undefined`.**

**Stop names come from NaPTAN read by column name.** They were read by slicing
the national CSV at positions `[0,1,4,10,14,18,19,29,30]` in a separate download
step that rewrote it to `/tmp/Stops.csv`. The values are the same; what changes
is that a column added or moved by the DfT is now a missing field rather than a
street name silently appearing in the latitude.

**Coordinates keep the precision NaPTAN published.** They are carried as the text
the CSV held, so `51.45000` stays `51.45000` rather than becoming `51.45`.

**The zip is written in process.** `yazl` is replaced by the same deterministic
archiver the rail feed uses: flat, entries sorted, and awaited, so the command
resolves when the file exists.

## Operator identity, coordinates and the shape of a place

Measured against the DfT's own national GTFS, built from the same Bus Open Data
Service archive.

**`agency_id` is the National Operator Code.** It was the `Operator` element's
`id`, which means something only inside the document it is written in: `tkt_oid`
is the id 167 different operators give themselves, and keyed on it all 167 became
one agency — 4,035 routes and 323,538 trips of the national feed, 29% of it,
filed under "London United". All but one of the 20,502 operators in that dataset
carry a National Operator Code. The fixture's operator is `CHIL` rather than
`OP1`.

**A coach is `route_type` 200.** It was 3, the same as a bus.

**stops.txt has a `platform_code` column.** It is written where NaPTAN's
indicator names a stand — `Stand C`, `Bay 4`, `A` — and left empty where the
indicator is a relative position such as `adj` or a compass bearing, which is how
the DfT's feed reads it. Every stop in the fixture is the second kind, so the
column is empty in all four rows.

**There is a feed_info.txt.** The dates are the window the conversion was asked
for, which TransXChange has nothing to say about and which is the only honest
answer to what the feed describes completely. The test passes a fixed window and
version, because a golden that changes with the date is not a golden.

Two further changes leave the fixture untouched and are visible only on a real
dataset:

**A journey that runs on no day inside the window is dropped, and the calendars
of the rest are clipped to it.** The national dataset holds registrations that
started in 2001 and registrations that end in 2099, and 10.5% of its journeys do
not run on any day in the following fifteen months. The fixture's window is its
own operating period, so nothing moves.

**A pair of stops either side of a street stands under a station of its own, and
transfers are generated between stations rather than between stops.** The
fixture's four stops are four different places.
