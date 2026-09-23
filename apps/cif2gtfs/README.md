# cif2gtfs

Build a GTFS feed from the CIF timetable in the British rail DTD feed. No database, one command.

```
npm install -g cif2gtfs
cif2gtfs build --source RJTTF918.ZIP --out gtfs.zip
```

Or from a clone:

```
yarn workspace cif2gtfs run start build --source RJTTF918.ZIP --out gtfs.zip
```

## Requirements

Node.js 22 or later. Date handling uses `Temporal`, through
[`temporal-polyfill`](https://www.npmjs.com/package/temporal-polyfill), which hands over to the
built-in global on the versions that have one - Node 26 and later.

## Usage

```
cif2gtfs build [OPTIONS]

  --source PATH        a DTD timetable zip, or a directory of them. Repeat it to
                       combine sources
  --out PATH           where to write. A path ending .zip produces a zip, anything
                       else a directory of text files (defaults to ./gtfs.zip)
  --range RANGE        how far ahead to build, e.g. "3 months" (defaults to '3 MONTH')
  --today YYYY-MM-DD   the date to build for (defaults to the current date)
  --config PATH        read the build from a YAML file. Any flag given as well
                       takes precedence
  --remove-passing-points BOOL
                       whether to drop the locations a service runs through
                       without stopping (defaults to true)
```

The DTD feed is published as a weekly full refresh followed by daily incrementals. Pass them in the
order they were published and the result is the same as importing them in that order:

```
cif2gtfs build \
  --source RJTTF918.ZIP \
  --source RJTTC919.ZIP \
  --source RJTTC920.ZIP \
  --out gtfs.zip --range "6 months"
```

Or point it at the directory you download into and let it work that out:

```
cif2gtfs build --source ./feeds --out gtfs.zip --range "6 months"
```

A directory contributes every `RJTTFxxx.ZIP` and `RJTTCxxx.ZIP` it holds, ordered by sequence
number and starting at the most recent full refresh — anything before that refresh is superseded
by it. The fares, routeing and NFM64 feeds are ignored, so a directory holding all four is fine.

Note that this is not the same as sorting by filename: as text every `RJTTC` sorts before every
`RJTTF`, which would put the refresh after the incrementals that amend it.

`--today` exists so a build can be reproduced. Without it the feed is a function of the day it ran
and cannot be compared to yesterday's.

`GTFS_RANGE` and `GTFS_TODAY` are read as well, for compatibility with `dtd2mysql`; `--range` and
`--today` override them. `GTFS_REMOVE_PASSING_POINTS` does the same for `--remove-passing-points`.

## Enrichment

The DTD carries a timetable and little else: station positions are grid references rounded to 100
metres, names are upper case and truncated to sixteen characters, and there is nothing at all about
whether a wheelchair user can reach a platform. A `--config` file names the outside sources that
fill those in.

```yaml
source:
  - ./feeds
out: gtfs.zip
enrichers:
  NAPTAN:
    options: {names: true}
    apply: [stop_lat, stop_lon, located, stop_name]
  KNOWLEDGEBASE_STATIONS:
    apply: [wheelchair_boarding, stop_url]
```

| enricher | supplies | needs |
|---|---|---|
| `NAPTAN` | surveyed coordinates, and readable station names with `options: {names: true}` | nothing; the DfT's dataset is open |
| `KNOWLEDGEBASE_STATIONS` | `wheelchair_boarding` from the step-free access category, and `stop_url` | `KNOWLEDGEBASE_API_KEY` |

`apply:` limits an enricher to the fields listed, so a source can be taken for the one thing it is
good at. Omit it to accept everything the enricher writes. A field an enricher is not allowed to
write is counted and reported, both in the build log and in `provenance.json` — worth reading, as
nothing checks the field names themselves and a typo turns every write away.

`KNOWLEDGEBASE_API_KEY` comes from a [Rail Data Marketplace](https://raildata.org.uk/) subscription
to the National Rail Knowledgebase stations feed. The 54MB response is cached for a week beside the
other downloads; if a refresh then fails, the build warns and carries on with the copy it has.

Both sources write stations. A boarding point is created afterwards as a copy of its station, so it
carries the same coordinate and name — but `wheelchair_boarding` is deliberately `0` on it, which
the spec reads as "inherit from the station", because no source says which of a station's platforms
are step-free.

Every run writes `provenance.json` beside the feed: each field an enricher set, who set it, and any
write that lost to a higher priority.

## Passing points

Half the CIF's intermediate location records are places a service runs through without stopping,
and 892,000 of them are at a station the feed publishes. They are not calls: nobody boards and
nobody alights. By default they are dropped.

`--remove-passing-points=false` keeps them, as calls with `pickup_type` and `drop_off_type` of `1`
and one time as both the arrival and the departure. Over three months of the whole network
that is 3.43 million stop times against 2.84 million, of which 592,000 are passed rather than
called at. The trips, routes and calendars are identical either way; `stops.txt` gains 59 stops.

A pass has only a working time, the half-minute the train runs to, while a call is published at
its public time, and the two clocks can be a quarter of an hour apart. So a pass is published at
its share of the working time between the calls either side, laid over the public time between
them: C02035 sets down at Doncaster from a public 00:35 and a working 00:49½, and its working pass
of Adwick at 00:55½ is published at 00:41 rather than after its public 00:52 at Wakefield Westgate.
Where the clocks agree, which is most of the network, a pass keeps its working time; a third of
passes move, almost all by a minute or less. No pass is published outside the calls either side
of it, and every pass is `timepoint` `0`, because its time is an estimate.

A passing point names its platform like any other call, and falls back to the station where the
pass record gives none. The platform a train runs through is a real platform: 89% of passing calls
land on a boarding point the feed already publishes because something stops there, so the id a
passing call carries is the one a stopping call at that platform carries. The 05:00 Victoria to
Gatwick passes Clapham Junction platform 15 as `9100CLPHMJC15` — the same stop 1,837 boardable
calls use.

The 12 stops that are new are real platforms this window has no calls at: Pilning 2, New Cross Gate
3 and 4, Wembley Central 3 and 4, Clapham Junction Main 8, Finsbury Park 3, Grove Park 2, New
Barnet 2, Rotherham Central 4T, and Wixams 1 and 2.

One caveat if you use both feeds: a call publishes its public time and a passing point has only its
working time, and the CIF's two clocks do not always agree. In 23 places out of 3.43 million a pass
reads as later than the call after it.

## Getting the feed

The timetable feed comes from the DTD SFTP server. `dtd2mysql --download-timetable` will fetch it,
or take it from wherever you already keep it.

## What it produces

`agency.txt`, `stops.txt`, `transfers.txt`, `links.txt`, `routes.txt`, `trips.txt`, `stop_times.txt`,
`calendar.txt` and `calendar_dates.txt`. Output is byte-identical to what `dtd2mysql --gtfs`
produces from the same feed files, and the same input and `--today` always produce the same bytes.

A build that finds no schedules in the window fails rather than writing an empty feed.

Building three months of the whole GB network takes around 45 seconds and 5 GB of memory.

## Contributing

Issues, pull requests and the source live at
[planarnetwork/gb-transit](https://github.com/planarnetwork/gb-transit). This is
`apps/cif2gtfs` in that repository.

## License

This software is licensed under [GNU GPLv3](https://www.gnu.org/licenses/gpl-3.0.en.html).

Copyright 2017 Linus Norton.
