---
"@gb-transit/gtfs-loader": minor
"gtfsmerge": minor
---

Pass through the columns a merge does not write of its own.

**gtfsmerge** writes a column a feed carries after its own columns, as the feed wrote it, rather
than dropping it. The rail feed's `transfers.txt` says which mode a fixed link is and when it runs,
and those twelve columns used to stop at the merge. Every input's header rows are read before
anything is written, because each file is opened with its header and a column only the last feed
has would otherwise arrive too late to be in it. They are read from the zip's central directory and
the first few kilobytes of each entry, so a national feed's stop_times.txt costs a read of its first
line rather than a decompression of all of it.

Columns that name something the merged feed would not have are not passed through: a transfer's
`from_route_id` and `to_route_id`, since the routes are renumbered and transfers are kept one per
pair of stops; `level_id`, `network_id` and the flexible services' locations and booking rules,
whose files the merge does not write; and `shape_id` in a merge without shapes.

**The rail feed's windows now reach the merged feed.** 1,578 of its 1,664 fixed links run only at
some times or on some days, and a planner that reads the window - raptor-journey-planner does -
now honours it in the merged feed as it does in the rail feed. Before, the columns were dropped and
every link was available all day. Where two transfers describe the same pair of stops the one kept
is the shorter, available whenever either is.

**@gb-transit/gtfs-loader**: `readFeed` gains an `extraColumns` option that reads named columns the
schema does not know onto the row as text, and `CSVParser` says the header it read. Both opt in: no
other caller reads anything it did not before.
