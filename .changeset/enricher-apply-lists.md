---
"@gb-transit/gtfs": minor
"cif2gtfs": minor
---

Enforce the `apply:` lists a build config declares.

`MutableFeed` has always been able to hold an enricher to a set of fields, and
`parseConfig` has always read `apply:` and rejected a field name it does not
recognise. The two were never connected: `BuildFeed` built its `MutableFeed`
without an allowlist, so a config that read as taking NaPTAN's coordinates and
not its names took both.

`BuildFeed` now accepts the allowlist, `applyLists` turns the parsed config into
the shape it wants, and `cif2gtfs` passes it. An enricher the config says
nothing about stays unrestricted, which is what an absent `apply:` means; an
empty list would mean the opposite.

Nothing about the published feed moves. Both configured enrichers write exactly
the fields their lists name, so the two nightly feeds are byte identical either
way - which is what makes this safe to land on its own.

Refusals are counted per enricher rather than as a total, reported in the build
log and carried in `provenance.json`. A list naming a field its enricher does
not write turns every write away, and a silently ineffective source is the thing
this whole seam exists to prevent.
