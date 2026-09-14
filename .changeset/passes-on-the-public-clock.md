---
"@gb-transit/gtfs": minor
"cif2gtfs": minor
"dtd2mysql": minor
---

Publish a passing point between the calls either side of it.

A build with `--remove-passing-points=false` put a call at its public time and a pass at its working
time, and the CIF's two clocks can be a quarter of an hour apart. C02035 sets down at Doncaster from
a public 00:35 and a working 00:49½, so its working pass of Adwick at 00:55½ was published after its
public arrival at Wakefield Westgate, 00:52. The validator raised 24 of those in the nightly's feed,
and they stopped it publishing when two new overlays made the count 26. A train that runs backwards
is the ones that showed; a pass fifteen minutes out that happened not to overtake a call was just as
wrong and nothing said so.

A pass now keeps its share of the working time between the calls either side, laid over their public
times: Adwick, 4 of the 15 working minutes out of Doncaster, is published at 00:41. Where the two
clocks agree nothing moves. A call published at only one end - set down only or picked up only - is
placed on the public clock by the end of its working dwell that time is nearer, so the Night Riviera
standing at Reading from 03:12 to 04:18 is not spread back to 03:12, and the sleeper that reaches
Preston at 03:51 and sets down from 04:20 is not stretched forward to it. No pass is published before
the call behind it, after the call ahead of it, or before the pass ahead of it.

Built from `RJTTF918`, 203,373 of 625,583 passes move, 188,680 of them by a minute or less. The
validator raises 1 `stop_time_with_arrival_before_previous_departure_time` rather than 27 - Z03536,
which the standard feed raises too - and `fast_travel_between_consecutive_stops` and
`fast_travel_between_far_stops` fall from 206 and 180 to 56 and 53. The calls are unchanged, and a
build that removes passing points is unchanged.

A passing point is now `timepoint` `0`, which GTFS reads as an approximate time.
