![transxchange2gtfs](logo.png)

[![CI](https://img.shields.io/github/actions/workflow/status/planarnetwork/transxchange2gtfs/ci.yml?branch=master&style=flat-square&label=CI)](https://github.com/planarnetwork/transxchange2gtfs/actions/workflows/ci.yml)
[![npm](https://img.shields.io/npm/v/transxchange2gtfs.svg?style=flat-square)](https://www.npmjs.com/package/transxchange2gtfs)
[![npm downloads](https://img.shields.io/npm/dm/transxchange2gtfs.svg?style=flat-square)](https://www.npmjs.com/package/transxchange2gtfs)
[![Node](https://img.shields.io/node/v/transxchange2gtfs.svg?style=flat-square)](https://nodejs.org)
[![License](https://img.shields.io/npm/l/transxchange2gtfs.svg?style=flat-square)](https://www.gnu.org/licenses/gpl-3.0.html)

transxchange2gtfs converts [TransXChange](http://naptan.dft.gov.uk/transxchange/index.htm) timetable data into a [GTFS](https://developers.google.com/transit/gtfs/) zip.

## Comparison

There are other [similar projects](https://github.com/search?q=transxchange+gtfs), each with their own merits. This tool has some features not found in the others:

- Smaller output - identical calendars are reused
- Better handling of bank holidays
- Built in NaPTAN data (stop names, longitude, latitude)
- Ability to process multiple files, including zips
- Low memory usage - most large files use less than 1GB, processing the entire UK data set requires 2GB
- Generates interchange time and transfers to nearby stops

## Installation

Requires [node 22](https://nodejs.org) or above. No `zip` or `unzip` binary is needed — archives
are read and written in process, so this runs on Windows.

transxchange2gtfs is a CLI tool that can be installed via NPM:

```
npm install -g transxchange2gtfs
```

or used directly with npx:

```
npx transxchange2gtfs ...
```

## Usage

It can be run by specifying the input and output files as CLI arguments:

```
transxchange2gtfs transxchange1.xml transxchange2.xml gtfs-output.zip
```

Or using zip files:

```
transxchange2gtfs multiple-transxchange-files.zip /path/*.zip single-transxchange.xml gtfs-output.zip
```

Prior to version 1.9.0 nested zip files we're ignored. They are now processed recursively.

On occasion, a large dataset will cause a `heap out of memory issue`. In this case, set the `NODE_OPTIONS` environment variable to increase the heap size.
For example to set to 8GiB, in a linux shell:

```
NODE_OPTIONS=--max-old-space-size=8192 transxchange2gtfs transxchange.zip gtfs-output.zip
```

It's possible to set the default agency URL, language and timezone:

```
AGENCY_URL=http://agency.com AGENCY_TIMEZONE=Europe/London AGENCY_LANG=en transxchange2gtfs transxchange.zip gtfs-output.zip
```

On first run transxchange2gtfs downloads the latest stop data from NaPTAN and caches it. Add
`--update-stops` to force a refresh, or `--skip-stops` to download nothing and write no `stops.txt`
or `transfers.txt`.

```
transxchange2gtfs --update-stops transxchange.zip gtfs-output.zip
```

The national dataset is around 100MB. `--naptan` reads it from a file you already have instead,
which is also how the tests run offline:

```
transxchange2gtfs --naptan Stops.csv transxchange.zip gtfs-output.zip
```

`--from` and `--to` are the days the feed describes, defaulting to today and a year out. A bus
registration's own dates run from whenever it began to as far out as 2099 and neither says anything
about what the feed can be trusted for, so a journey that runs on no day in the range is left out and
the calendars of the rest are clipped to it.

```
transxchange2gtfs --from 2026-09-18 --to 2027-12-07 transxchange.zip gtfs-output.zip
```

Where NaPTAN pairs the two sides of a street, both stops are put under a station of their own so a
planner treats them as one place. `--skip-stop-areas` writes them as two.

The output may be a directory rather than a `.zip`, which is what you want if the next thing to
touch it is [`gtfsmerge`](../gtfsmerge) or another tool.

`transxchange2gtfs --help` lists everything.

## Notes

- All stop times are left in the original timezones (assumed to be local time).
- It is assumed that any stops in different TransXChange documents with the same ATCO are the same stop.
- `feed_info.txt` says what the conversion was asked for, because TransXChange carries no publisher, version or feed date range of its own.
- Agencies are keyed on the National Operator Code. The `Operator` id a TransXChange document uses means nothing outside that document — `tkt_oid` is the id 167 different operators in the national dataset give themselves.
- Stops are named by their ATCO code, which is what lets the output merge with a GB rail feed from [`cif2gtfs`](../cif2gtfs) without reconciling anything.
- Stop data is derived from [NaPTAN](http://naptan.app.dft.gov.uk/datarequest/help).
- TransXChange is a [bizarre and over-engineered standard](http://naptan.dft.gov.uk/transxchange/training/EBSR/EBSR%20Training%20Toolkit%20v1.0/3%20Resources/Guides/TransXChange%20Schema%20Guide-2.1-v-44.pdf), there are probably edge cases that have not been covered.
- A MySQL for the GTFS files is provided in the resource folder, along with an import script.  

## Contributing

Issues and PRs are very welcome. To get the project set up run

```
git clone git@github.com:planarnetwork/transxchange2gtfs
npm install --dev
npm test
```

If you would like to send a pull request please write your contribution in TypeScript and if possible, add a test.

## License

This software is licensed under [GNU GPLv3](https://www.gnu.org/licenses/gpl-3.0.en.html).

