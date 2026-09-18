# transxchange2gtfs

Converts [TransXChange](http://naptan.dft.gov.uk/transxchange/index.htm) — UK bus and coach
timetable XML — into a GTFS feed. Published to npm as `transxchange2gtfs`.

All of it lives here. `Container.ts` wires the pipeline, `Converter.ts` runs it and writes the
output, `index.ts` is the CLI and `api.ts` is the function both it and the tests call; the parsing
is in `transxchange/`, `xml/`, `reference/` and `gtfs/`.

It was briefly a library, `@gb-transit/txc-source`, on the argument that it mirrored
`libs/dtd-source`. It does not: `dtd-source` has three consumers and this had one, its own app. A
package with a single consumer is a directory with extra steps.

## The pipeline

Every stage is an object-mode `Transform`, which is why a national dataset converts in constant-ish
memory. The GTFS streams fan out from the two hub streams, so a conversion is a single pass.

```
FileStream → XMLStream → TransXChangeStream → TransXChangeJourneyStream
                                  │                      │
                                  │                      ├─► CalendarStream      → calendar.txt
                                  │                      ├─► CalendarDatesStream → calendar_dates.txt
                                  │                      ├─► TripsStream         → trips.txt
                                  │                      ├─► StopTimesStream     → stop_times.txt
                                  │                      ├─► ShapesStream        → shapes.txt
                                  │                      └─► FeedInfoStream      → feed_info.txt
                                  ├─► AgencyStream    → agency.txt
                                  ├─► RoutesStream    → routes.txt
                                  ├─► TransfersStream → transfers.txt
                                  └─► StopsStream     → stops.txt
```

**The streams emit rows, not CSV.** Each extends `RowStream<T, R>` and declares the file it writes
as a `FileSchema` in `src/gtfs/TxcFeed.ts`; `@gb-transit/gtfs-output` does the
formatting. Before, each stream carried a `header` string and a `pushLine` whose argument order had
to match it with nothing checking that it did, and `resource/schema.sql` said the same thing a third
time and had already drifted. Adding a column now means adding it to the row type and to the
declared columns, and the compiler holds you to both.

`feed_info.txt` says what the conversion was asked for rather than what TransXChange said, because
TransXChange says nothing about it. `--from` and `--to` are the window the feed describes; journeys
that run on no day inside it are dropped and the calendars of the rest are clipped to it, because a
registration's own dates run from whenever it began to as far out as 2099 and neither is a statement
about the feed.

## NaPTAN

TransXChange references stops by ATCO code and says little about them, so `StopsStream` and
`TransfersStream` take NaPTAN indexes by constructor injection. The data comes from
`@gb-transit/naptan`, which downloads and caches the national CSV, and is read **by column name** —
it used to be sliced out at positions `[0,1,4,10,14,18,19,29,30]` by a separate download step, so a
column added by the DfT would have put a street name in the latitude.

`--naptan <file>` reads a CSV from disk instead of downloading 100MB, which is what makes an
end-to-end test possible. `--skip-stops` writes no `stops.txt` or `transfers.txt` and downloads
nothing.

**A stop's position comes from its grid reference where NaPTAN gives no longitude and latitude**,
which is 37,210 of the 435,546 stops in the national file. `reference/OSGridReference.ts` projects
it, and agrees with the DfT's own feed to within a metre.

**`reference/StopAreas.ts` groups the two sides of a street into one place**, which NaPTAN records
as a GPBS stop area and does not publish in the CSV. The stops of a group get a `parent_station`, the
group gets a row of its own, and `TransfersStream` walks between groups rather than between their
stops. The rule and what it was measured against are in that file; `--skip-stop-areas` turns it off.

## Bank holidays

`src/reference/BankHolidays.ts` maps each TransXChange `Holiday` to a rule and
locale (GB-ENG / GB-SCT) via `date-holidays`, over a rolling window around the current year. No
manual list to extend.

## Gotchas

- **All times are local.** No timezone conversion anywhere.
- **Two stops with the same ATCO code are the same stop**, across documents.
- **An operator id means nothing outside its own document.** Agencies are keyed on the National
  Operator Code; see `gtfs/AgencyId.ts`.
- The output is byte-sensitive and `fixtures/mini/golden` is the record of it. When changing
  anything in the journey, calendar or time logic, read the golden diff rather than trusting the
  unit tests. `UPDATE_GOLDEN=1 yarn vitest run` regenerates it; every movement gets an entry in
  `fixtures/BASELINE.md`.
- Zips are read with `adm-zip`. It does not retain decompressed entries, but `FileStream` must hand
  the documents on **one at a time** — a dataset is hundreds of documents of tens of megabytes each,
  and pushing them all in lets the stream buffer the lot.
- NaPTAN is read with `eachNaptanRow`, which streams. Parsing the national CSV whole to take nine of
  its forty columns costs about 600MB more.
- V8 will happily grow to 2GB converting a large dataset with an unconstrained heap. It does not
  need it: the same conversion runs in under 900MB, and about twice as fast, under
  `--max-old-space-size=512`. Peak RSS is a bad way to judge this.
