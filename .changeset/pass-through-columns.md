---
"@gb-transit/gtfs-loader": minor
"gtfsmerge": minor
---

Pass through the columns a merge does not write of its own.

**gtfsmerge** writes a column a feed carries after its own columns, as the feed wrote it, rather than
dropping it. The rail feed's `transfers.txt` says which mode a fixed link is and when it runs, and
those twelve columns used to stop at the merge. The headers of every input are read before anything
is written, because each file is opened with its header and a column only the last feed has would
otherwise arrive too late to be in it.

**@gb-transit/gtfs-loader** gains what that takes, both opt in: `readHeaders` gives the header row of
each file in a feed, decompressing each entry only as far as its first line, and `readFeed`'s
`extraColumns` option reads named columns the schema does not know onto the row as text.
