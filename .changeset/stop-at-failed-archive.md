---
"@gb-transit/dtd-source": minor
---

`DownloadAndProcessCommand` stops at the first file that fails to process and rejects with its error,
rather than logging it and going on to the next. The files are changes applied in order, so going on
recorded a later one as processed and the failed one was never taken again.
