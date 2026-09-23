![npm](https://img.shields.io/npm/v/dtd2mysql.svg?style=flat-square) ![npm](https://img.shields.io/npm/dw/dtd2mysql.svg?style=flat-square)

# GB transit tooling

Tools for:

 - DTD feeds download and storage (CIF timetable, the fares feed and the routeing guide) 
 - GTFS loading, merging and output
 - CIF to GTFS conversion
 - TransXchange to GTFS conversion

The repository also builds and publishes that GTFS feed nightly.

## The published feed

If you want the data rather than the tools, you do not need to run anything:

**[planarnetwork.github.io/gb-transit](https://planarnetwork.github.io/gb-transit/)** — the site,
with the coverage window, what the current feed was built from, and a page for each tool.

| | |
|---|---|
| [`gtfs.zip`](https://github.com/planarnetwork/gb-transit/releases/latest/download/gtfs.zip) | where a service calls, and the line it runs over |
| [`gtfs-national-rail-only.zip`](https://github.com/planarnetwork/gb-transit/releases/latest/download/gtfs-national-rail-only.zip) | without the services National Rail does not run — the tube, the Metro, the ferries, the buses and TfL's replacement buses |
| [`gtfs-rail-and-tfl.zip`](https://github.com/planarnetwork/gb-transit/releases/latest/download/gtfs-rail-and-tfl.zip) | the National Rail only feed with TfL's tube, DLR, trams, river boats and cable car beside it, for journeys across London. Powered by TfL Open Data |
| [`transfer-patterns.br`](https://github.com/planarnetwork/gb-transit/releases/latest/download/transfer-patterns.br) | the stations a journey can change at, for a transfer pattern journey planner |

All three feeds are rebuilt every night by [`feed.yml`](.github/workflows/feed.yml) from the
configuration in [`gtfs.config.yaml`](gtfs.config.yaml),
[`gtfs.national-rail-only.config.yaml`](gtfs.national-rail-only.config.yaml) and
[`gtfs.rail-and-tfl.config.yaml`](gtfs.rail-and-tfl.config.yaml) — the last put beside TfL's
[Journey Planner Timetables](https://tfl.gov.uk/info-for/open-data-users/our-open-data) by
[`scripts/combine-rail-and-tfl.mjs`](scripts/combine-rail-and-tfl.mjs) — each validated against a
pinned baseline of its own —
[standard](.github/validator-baseline.json),
[National Rail only](.github/validator-baseline-national-rail-only.json) and
[rail and TfL](.github/validator-baseline-rail-and-tfl.json) — and attached to a dated release. A
build that fails validation is not published.

`transfer-patterns.br` is not a feed but a companion to the first one: 57 million routes through the
network, found in advance so a journey planner does not have to search for them. It is built from
`gtfs.zip` after that release is published — see
[`apps/transfer-patterns`](apps/transfer-patterns) for the format and how to read it — so a release
that is missing it is a night the patterns did not finish, not a feed that is wrong.

`gtfs.zip` carries a `shapes.txt`: a line through every station a train touches, calling or
passing. It is a station-to-station sketch of the route rather than the track, because
the DTD gives no coordinate for the junctions in between — see
[shapes](https://planarnetwork.github.io/gb-transit/feeds/using-this-data/#shapes).

The feed makes decisions a consumer cannot infer from the GTFS specification — identifiers, splits
and joins, service days, the columns it adds.
**[Using this data](https://planarnetwork.github.io/gb-transit/feeds/using-this-data/)** states
them. Its source is
[`apps/website/src/pages/feeds/using-this-data.mdx`](apps/website/src/pages/feeds/using-this-data.mdx).

## The tools

```
npm install -g dtd2mysql
dtd2mysql --timetable /path/to/RJTTFxxx.ZIP
dtd2mysql --gtfs-zip gtfs.zip
```

`cif2gtfs` builds the same feed — byte for byte — straight from the feed files with no database:

```
npm install -g cif2gtfs
cif2gtfs build --source RJTTF918.ZIP --out gtfs.zip
```

Two more tools build and combine feeds beyond the railway:

```
npm install -g transxchange2gtfs gtfsmerge
transxchange2gtfs bus-timetables.zip bus.zip
gtfsmerge gtfs.zip bus.zip gb.zip
```

`transxchange2gtfs` converts TransXChange, the format GB bus and coach timetables are published in,
and `gtfsmerge` merges feeds into one. The first conversion downloads the national NaPTAN dataset —
around 100 MB — to say where the stops are, and caches it; `--naptan <file>` reads a copy you
already have instead. They compose with the rail feed because all three identify a
stop by its ATCO code, so a merged feed knows that the bus stop outside a station is outside that
station — no `--stop-prefix`, no reconciliation.
[`tests`](tests/README.md) is what keeps that true.

Full command line documentation is in each app's README:
**[`apps/dtd2mysql`](apps/dtd2mysql/README.md)** for the importer,
**[`apps/cif2gtfs`](apps/cif2gtfs/README.md)** for the one-shot build,
**[`apps/transxchange2gtfs`](apps/transxchange2gtfs/README.md)** for the bus conversion,
**[`apps/gtfsmerge`](apps/gtfsmerge/README.md)** for the merge.

## Packages

This is a monorepo. The published CLI is one workspace among several, and every package has a
README describing what it is for and how to use it.

### Applications

| Package | Published as | What it is |
|---|---|---|
| [`apps/dtd2mysql`](apps/dtd2mysql/README.md) | `dtd2mysql` | Import the feeds into MySQL, and export GTFS from it |
| [`apps/cif2gtfs`](apps/cif2gtfs/README.md) | `cif2gtfs` | Build a GTFS feed straight from the feed files, no database |
| [`apps/transxchange2gtfs`](apps/transxchange2gtfs/README.md) | `transxchange2gtfs` | Convert TransXChange bus and coach timetables to GTFS |
| [`apps/gtfsmerge`](apps/gtfsmerge/README.md) | `gtfsmerge` | Merge GTFS feeds into one |
| [`apps/website`](apps/website/README.md) | — | The download page and the guide, deployed to GitHub Pages |

### Libraries

| Package | Published as | What it is |
|---|---|---|
| [`libs/gtfs-schema`](libs/gtfs-schema/README.md) | `@gb-transit/gtfs-schema` | The shape of a GTFS feed: one type per file, and the scalars they are written in |
| [`libs/feed-parser`](libs/feed-parser/README.md) | `@gb-transit/feed-parser` | Declarative fixed-width and CSV record parsing |
| [`libs/dtd-schema`](libs/dtd-schema/README.md) | `@gb-transit/dtd-schema` | Record layouts for the fares, timetable, routeing guide and NFM64 feeds |
| [`libs/dtd-source`](libs/dtd-source/README.md) | `@gb-transit/dtd-source` | SFTP download, feed sequencing, and a timetable source that reads the files directly |
| [`libs/gtfs`](libs/gtfs/README.md) | `@gb-transit/gtfs` | GTFS entities, the transit model, the transforms and the build |
| [`libs/gtfs-output`](libs/gtfs-output/README.md) | `@gb-transit/gtfs-output` | Writers: a directory of text files, or a zip |
| [`libs/gtfs-loader`](libs/gtfs-loader/README.md) | `@gb-transit/gtfs-loader` | The reader: a GTFS zip, stream or response, as a timetable or as its rows |
| [`libs/naptan`](libs/naptan/README.md) | `@gb-transit/naptan` | Download, cache and read the NaPTAN national stop dataset |
| [`libs/enrich-naptan`](libs/enrich-naptan/README.md) | `@gb-transit/enrich-naptan` | Station coordinates and names from NaPTAN |
| [`libs/enrich-knowledgebase-stations`](libs/enrich-knowledgebase-stations/README.md) | `@gb-transit/enrich-knowledgebase-stations` | Station accessibility from the National Rail Enquiries Knowledgebase |
| [`libs/knowledgebase-fare-group-permitted-stations`](libs/knowledgebase-fare-group-permitted-stations/README.md) | `@gb-transit/knowledgebase-fare-group-permitted-stations` | Read the Knowledgebase fare group permitted stations reference data |
| [`libs/extend-station-groups`](libs/extend-station-groups/README.md) | `@gb-transit/extend-station-groups` | Group stations as GTFS Fares v2 areas |

`libs/gtfs` carries two extension points, so a source of data this repository does not know about
can be added without changing the build: an `Enricher` writes fields on entities the timetable
produced, and an `Extension` contributes whole files. `enrich-naptan` and
`enrich-knowledgebase-stations` are the enrichers, `extend-station-groups` the extension, and they
are the worked examples.

An enricher is named for the feed it reads rather than for who publishes it. The Knowledgebase has
several, on different terms, and only the stations one is here.

`dtd2mysql` depends on the libraries the way any other consumer would, so a GTFS build reading from
something other than this tool's MySQL schema needs `@gb-transit/gtfs` rather than the CLI.

`gtfs-schema` and `gtfs-loader` publish both CommonJS and ESM, where everything else here publishes
CommonJS only. That is because `gtfs-loader` reads a feed in a browser - it is the only package here
with a consumer that is not node - and `gtfs-schema` is the vocabulary it shares with the rest.

Libraries never depend on an app. Each package builds to its own `dist/` and the workspaces resolve
to that output, so `yarn build` has to happen before anything runs; `tsc -b` walks the project
references and makes it incremental.


## Contributing

Issues and pull requests are very welcome. To get set up:

```
git clone git@github.com:planarnetwork/gb-transit
yarn install
yarn test
```

Node 26 to develop on, as [`.nvmrc`](.nvmrc) pins it. What the packages themselves need is Node 22,
which is what CI runs alongside 26: Temporal comes from
[`temporal-polyfill`](https://www.npmjs.com/package/temporal-polyfill), which defers to the built-in
global wherever there is one, so both the polyfilled and the native path are exercised.

[`apps/cif2gtfs/fixtures/mini`](apps/cif2gtfs/fixtures/mini) holds a small slice of a real feed and
the GTFS it produces, committed as text. The test suite builds it and diffs, so a change in the
feed's behaviour shows up in review as a readable diff rather than as a hash that moved. To take a
change, run `UPDATE_GOLDEN=1 yarn vitest run`, read the diff, and record why it moved in
[`BASELINE.md`](apps/cif2gtfs/fixtures/BASELINE.md) — CI requires an entry.

Anything that should reach a user needs a changeset: run `yarn changeset`, pick the bump type, and
commit the file it writes. A pull request with no changeset publishes nothing, which is the right
answer for documentation and CI changes.

Please write contributions in TypeScript and, if possible, add a test. There are three places one
can go, and which it is says what kind of test it is:

| | |
|---|---|
| `<package>/src/Foo.spec.ts` | A unit test of `Foo.ts`, beside it. Named for the file it covers. |
| `<package>/test/*.spec.ts` | End to end for one package — a golden feed, a public surface. Named for what it checks rather than for a file, and out of `src/` because it is not published. |
| [`tests/`](tests/README.md) | End to end across packages. The three producers run in sequence, and the validator over what they build. |

## License

This software is licensed under [GNU GPLv3](https://www.gnu.org/licenses/gpl-3.0.en.html).

Copyright 2017 Linus Norton.
