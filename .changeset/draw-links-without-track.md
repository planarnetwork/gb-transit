---
"transxchange2gtfs": minor
---

Draw a journey whose route links have no track.

A route link's ends are elements holding a `StopPointRef`, and were read as the element rather than
the stop it names. Nothing used them until now, so nothing showed it.

A route link with no track - every one of TfL's, which say which stops a train calls at and nothing
of the line between them - is drawn as a straight line from the stop it leaves to the stop it
reaches, where NaPTAN places them, and a platform NaPTAN does not list is placed at its station.
Before, trips.txt named a shape for the journey and shapes.txt had no points for it: all 1,791 of the
shapes TfL's tube, DLR, tram, river and cable car trips named were missing.

Each link of a shape is measured on its own, so `shape_dist_traveled` only ever increases: a point
used to be measured from the previous link's last point on top of a total that already included that
link. A link that gives no distance is as long as it measures, rather than scaled to nothing. A stop
NaPTAN does not list is placed where its document says, as it already was in stops.txt.
