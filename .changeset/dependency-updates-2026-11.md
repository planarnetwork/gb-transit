---
"dtd2mysql": minor
"gtfsmerge": minor
"transxchange2gtfs": minor
"@gb-transit/dtd-source": minor
"@gb-transit/gtfs": minor
"@gb-transit/gtfs-schema": minor
---

Updated dependencies. `adm-zip` 0.6.1 is a security fix, and since it is pinned to an exact version,
installing an earlier release of `dtd2mysql`, `transxchange2gtfs` or `@gb-transit/dtd-source` still
brings in the vulnerable 0.6.0.

- `dtd2mysql`: `adm-zip` 0.6.1, `kysely` 0.29.7, `mysql2` 3.24.6, `proj4` 2.22.0,
  `temporal-polyfill` 1.0.6, and `pg` 8.23.1 and `pg-cursor` 2.22.1 for the optional Postgres support.
- `gtfsmerge`: `cheap-ruler` 4.1.1, a new major. The distances it measures between stops are
  unchanged, but it is now published only as an ES module, which `gtfsmerge` loads with `require`.
  Node only does that unflagged from 22.12, so `gtfsmerge` now requires Node 22.12 or later; on 22.0
  to 22.11 it would fail with `ERR_REQUIRE_ESM` as it started.
- `transxchange2gtfs`: `adm-zip` 0.6.1, `proj4` 2.22.0.
- `@gb-transit/dtd-source`: `adm-zip` 0.6.1, `temporal-polyfill` 1.0.6.
- `@gb-transit/gtfs`: `proj4` 2.22.0, `temporal-polyfill` 1.0.6.
- `@gb-transit/gtfs-schema`: `temporal-polyfill` 1.0.6.
