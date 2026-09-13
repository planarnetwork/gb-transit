---
"@gb-transit/gtfs-loader": minor
---

Give the trip a coupling makes a route, a headcode, a headsign and a shape.

`linkTrips` made the trip a passenger stays on across a join or split out of the two trips' calls
and calendars and nothing else, so it had no route, no headcode, no headsign and no shape. A journey
planner showing one said "Unknown operator", and a map had nothing to draw it along.

The through trip is the train the passenger boarded, so it now keeps the arriving trip's `routeId`
and `shortName`, and goes where the departing trip goes, so it takes that one's `headsign`.

Its `shapeId` names a shape the loader makes: the arriving trip's shape as far as the coupling, then
the departing trip's from it. `linkShapes` makes those, and a loaded feed's `shapes` now holds them
alongside its own, so every shape a trip names is in the feed whether or not the timetable has been
built. A shape rarely says how far along it each call is, so the coupling is found by where it is:
the point of each shape nearest the stop the link names. The same two trains can couple at one
station on some dates and another on others, so the stops are part of the name.

Over the GB rail feed all 3,662 through trips now name a route and a shape, and every call of every
one of them lies on its shape.
