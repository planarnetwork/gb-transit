---
"@gb-transit/gtfs": minor
"cif2gtfs": minor
---

Leave a fixed link out of `transfers.txt` by its mode.

`exclude.links: [TUBE]` drops the DTD's tube links before they are merged into `transfers.txt`, for a
feed that is combined with the Underground's own timetable - where a link saying the tube takes 23
minutes from Euston to London Bridge competes with the trains that actually run. Only the links named
go: a pair that is also a `TRANSFER` or a `WALK` keeps it, at its own time, which is why this happens
before the links are merged rather than after, when a pair's time is already the shorter of the two.
