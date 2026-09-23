---
"transxchange2gtfs": minor
"gtfsmerge": minor
---

Convert TfL's Journey Planner Timetables.

**`--supersede-by-line`.** TfL publishes a line's engineering works timetable as a service of its own
on top of the base timetable it interrupts, with a different service code and the same revision
number, so a conversion that reads both runs the line twice: the Circle, Hammersmith & City and
Metropolitan on a weekday, the Central, Jubilee and trams on a Saturday. With the flag, where two
services of one operator and line overlap, only the one that starts latest runs on the days they
share - the later start being the more specific timetable. Every document is scanned for its services
before the conversion. Off by default, because in a BODS dataset an operator can run two unrelated
services under one line name.

**A metro, tram or ferry platform is under its station.** NaPTAN numbers a platform after the stop
area it belongs to - `9400ZZLUKSX1` is platform 1 of `940GZZLUKSX` - and the feed now publishes that
station and puts its platforms under it, so changing lines at King's Cross is an interchange rather
than a walk between two places. A platform the timetable calls at that NaPTAN does not list, which is
87 of TfL's, is put under its station and stands at it rather than having no position. The platform
number is the last digit only, so Heathrow's Terminal 4 and Terminal 5 - `9400ZZLUHR41` and
`9400ZZLUHR51` - stay two stations, and a station whose platforms are named for their direction, as
Sheffield's tram stops are, is named without it.

A service only replaces another on the days of the week its journeys run, so a weekday timetable
starting later does not take the Saturdays, and a service whose `EndDate` is empty runs indefinitely
in the scan as it does in the conversion.

**gtfsmerge exports `readHeaders`**, which gives the columns of each file in a feed from the start
of each zip entry, for `scripts/combine-rail-and-tfl.mjs` to carry every column of both feeds.
