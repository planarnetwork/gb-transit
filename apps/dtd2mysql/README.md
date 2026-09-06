![npm](https://img.shields.io/npm/v/dtd2mysql.svg?style=flat-square) ![npm](https://img.shields.io/npm/dw/dtd2mysql.svg?style=flat-square)

# dtd2mysql

An import tool for the British rail fares, routeing and timetable feeds into a database.

Although both the timetable and fares feed are open data you will need to obtain the fares feed via the [ATOC website](http://data.atoc.org/fares-data). The formal specification for the data inside the feed also available on the [ATOC website](http://data.atoc.org/sites/all/themes/atoc/files/SP0035.pdf).

MySQL, Postgres and SQLite are supported, chosen with `DATABASE_DIALECT` and defaulting to MySQL. See Configuration.

## Requirements

Node.js 22 or later. Date handling uses `Temporal`, through
[`temporal-polyfill`](https://www.npmjs.com/package/temporal-polyfill), which hands over to the
built-in global on the versions that have one - Node 26 and later.

## Download / Install

You don't have to install it globally but it makes it easier if you are not going to use it as part of another project. The `-g` option usually requires `sudo`. It is not necessary to git clone this repository unless you would like to contribute.

```
npm install -g dtd2mysql
```

## Configuration

Every command reads its database settings from the environment. For example
`DATABASE_USERNAME=root DATABASE_NAME=fares dtd2mysql --fares-clean`.

| variable | meaning |
| --- | --- |
| `DATABASE_DIALECT` | `mysql`, `postgres` or `sqlite`. Defaults to `mysql` |
| `DATABASE_NAME` | the database, or the file to use for SQLite |
| `DATABASE_HOSTNAME` | defaults to `localhost` |
| `DATABASE_PORT` | defaults to `3306` |
| `DATABASE_USERNAME` | defaults to `root` |
| `DATABASE_PASSWORD` | |

The drivers other than MySQL's are optional peer dependencies, so installing this does not
drag in one for every database it can talk to:

| database | install |
| --- | --- |
| MySQL | nothing, `mysql2` comes with it |
| Postgres | `npm install pg`, plus `pg-cursor` for the GTFS output, which streams |
| SQLite | nothing, it is built into Node |

SQLite takes a file path as its `DATABASE_NAME`, so a whole feed can be imported and queried
without a server:

```
DATABASE_DIALECT=sqlite DATABASE_NAME=./feed.sqlite dtd2mysql --timetable RJTTFxxx.ZIP
DATABASE_DIALECT=sqlite DATABASE_NAME=./feed.sqlite dtd2mysql --gtfs ./gtfs
```

To build a GTFS feed and nothing else, `dtd2gtfs` reads the DTD files directly and needs no
database at all.

## Fares 

### Import

Import the fares into a database, creating the schema if necessary. This operation is destructive and will remove any existing data.

```
dtd2mysql --fares /path/to/RJFAFxxx.ZIP
```
### Clean 

Removes expired data and invalid fares, corrects railcard passenger quantities, adds full date entries to restriction date records. This command will occasionally fail due to a MySQL timeout (depending on hardware), re-running the command should correct the problem.

```
dtd2mysql --fares-clean
```
## Timetables
### Import

Import the timetable information into a database, creating the schema if necessary. This operation is destructive and will remove any existing data.

```
dtd2mysql --timetable /path/to/RJTTFxxx.ZIP
```

### Convert to GTFS

Convert the DTD/TTIS version of the timetable (up to 3 months into the future) to GTFS.

```
dtd2mysql --timetable /path/to/RJTTFxxx.ZIP
dtd2mysql --gtfs-zip filename-of-gtfs.zip
```

`--gtfs` writes the same feed as a directory of text files instead of a zip, which is easier to
read and to diff:

```
dtd2mysql --gtfs /path/to/output/
```

How far ahead the feed reaches, and the date it is built for, come from `GTFS_RANGE` and
`GTFS_TODAY`. Pinning `GTFS_TODAY` makes a build reproducible.

```
GTFS_TODAY=2026-08-10 GTFS_RANGE="6 MONTH" dtd2mysql --gtfs /path/to/output/
```

The locations a service runs through without stopping are dropped. To keep them, as calls with
`pickup_type` and `drop_off_type` of `1`, `timepoint` of `0`, and a time between the published
calls either side:

```
dtd2mysql --gtfs /path/to/output/ --remove-passing-points=false
```

It is roughly a fifth more stop times, and `GTFS_REMOVE_PASSING_POINTS=0` says the same thing.

### Import a GTFS feed

Load a GTFS feed back into the database, which is how the fares and routeing data are joined to it.

```
dtd2mysql --gtfs-import /path/to/gtfs/
```

## Routeing Guide
### Import
```
dtd2mysql --routeing /path/to/RJRGxxxx.ZIP
# optional
dtd2mysql --nfm64 /path/to/nfm64.zip 
```

## Download from SFTP server

The download commands will take the latest full refresh from an SFTP server (by default the DTD server).

Requires the following environment variables:

```
SFTP_USERNAME=dtd_username
SFTP_PASSWORD=dtd_password
SFTP_HOSTNAME=dtd_hostname (this will default to dtd.atocrsp.org)
```

There is a command for each feed

```
dtd2mysql --download-fares /path/
dtd2mysql --download-timetable /path/
dtd2mysql --download-routeing /path/
dtd2mysql --download-nfm64 /path/
```

Or download and process in one command

```
dtd2mysql --get-fares
dtd2mysql --get-timetable
dtd2mysql --get-routeing
dtd2mysql --get-nfm64
```

## Notes
### null values

Values marked as all asterisks, empty spaces, or in the case of dates - zeros, are set to null. This is to preverse the integrity of the column type. For instance a route code is numerical although the data feed often uses ***** to signify any so this value is converted to null. 

### keys
Although every record format has a composite key defined in the specification an `id` field is added as the fields in the composite key are sometimes null. This is no longer supported in modern versions of MariaDB or MySQL.

### missing data
At present journey segments, class legends, rounding rules, print formats  and the fares data feed meta data are not imported. They are either deprecated or irrelevant. Raise an issue or PR if you would like them added.

### timetable format

The timetable data does not map to a relational database in a very logical fashion so all LO, LI and LT records map to a single `stop_time` table.

### GTFS feed cutoff date

Only schedule records that **start** up to 3 months into the future (using date of import as a reference point) are exported to GTFS for performance reasons.
This will cause any data after that point to be either incomplete or incorrect, as override/cancellation records after that will be ignored as well.

## Contributing

Issues, pull requests and the source live at
[planarnetwork/gb-transit](https://github.com/planarnetwork/gb-transit). This package is
`apps/dtd2mysql` in that repository; see its README for how the workspaces fit together.

## License

This software is licensed under [GNU GPLv3](https://www.gnu.org/licenses/gpl-3.0.en.html).

Copyright 2017 Linus Norton.
