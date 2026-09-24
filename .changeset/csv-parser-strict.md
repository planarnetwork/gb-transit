---
"@gb-transit/gtfs-loader": minor
---

`CSVParser` takes a `strict` option that throws on a row with more or fewer fields than the header,
rather than leaving the missing columns undefined and dropping the extra fields. It is off by
default, so existing callers read files as they did.
