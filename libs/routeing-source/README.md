# @gb-transit/routeing-source

Read the National Routeing Guide feed (RSPS5047, `RJRGxxxx.ZIP`) and work out which stations a journey may pass
through.

```ts
import {loadRouteing, RouteingNetwork} from "@gb-transit/routeing-source";

const network = RouteingNetwork.build(await loadRouteing("data/feeds/RJRG1057.ZIP"));

network.permitted(network.routeingPoint("NRW")!, network.routeingPoint("SMK")!);   // bitset of NRW, DIS, SMK
```

`RouteingNetwork` holds, as typed arrays that can be shared between worker threads:

- the shortest distance in miles between every pair of stations, over the station links, with the members of a
  station group joined at no distance
- the routeing points of every station
- for every pair of routeing points, the stations on a permitted route between them
- for every routeing point, the stations a local journey to or from it may pass through

A permitted route is a sequence of maps travelled in order. Within a map, a station is on some route between two nodes
that does not repeat a node exactly when it is in a biconnected block on the path between them in the map's
block-cut tree. Stations between nodes are found by walking the station links. A route of `LO` is via London: any
permitted route to the London group followed by any permitted route from it.

Local journeys may be up to three miles longer than the shortest route.

Not modelled: the fare check that decides whether a routeing point is appropriate, easements, and the requirement
that a route never repeats a station across maps. The result errs towards permitting too much.
