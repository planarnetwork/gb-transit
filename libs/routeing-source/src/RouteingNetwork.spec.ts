import {describe, expect, it} from "vitest";
import {RouteingData} from "./LoadRouteing";
import {RouteingNetwork} from "./RouteingNetwork";

/**
 * A ring A-B-C-D-A on map M1 with a spur D-E, intermediate station X between A and B, and map M2 from C to F.
 * London (G01) is a group of L1 and L2, joined to A on map LO.
 */
function network(): RouteingNetwork {
  const links: [string, string, number][] = [
    ["A", "X", 1], ["X", "B", 1], ["B", "C", 2], ["C", "D", 2], ["D", "A", 2], ["D", "E", 2], ["C", "F", 5],
    ["A", "L1", 10], ["Y", "A", 1]
  ];
  const mapLinks: [string, string, string][] = [
    ["A", "B", "M1"], ["B", "C", "M1"], ["C", "D", "M1"], ["D", "A", "M1"], ["D", "E", "M1"],
    ["C", "F", "M2"], ["A", "G01", "LO"]
  ];
  const data: RouteingData = {
    stations: [
      ...["A", "B", "D", "E", "F"].map(crs => ({crs, routeingPoints: [], group: null})),
      {crs: "C", routeingPoints: ["A"], group: null},
      {crs: "X", routeingPoints: ["A", "B"], group: null},
      {crs: "Y", routeingPoints: ["A"], group: null},
      {crs: "W", routeingPoints: ["A"], group: null},
      {crs: "V", routeingPoints: ["NOPE"], group: null},
      {crs: "L1", routeingPoints: [], group: "G01"},
      {crs: "L2", routeingPoints: [], group: "G01"}
    ],
    routeingPoints: ["A", "B", "C", "D", "E", "F", "G01"],
    nodes: ["A", "B", "C", "D", "E", "F", "G01"],
    stationLinks: links.flatMap(([from, to, miles]) => [{from, to, miles}, {from: to, to: from, miles}]),
    mapLinks: mapLinks.flatMap(([from, to, map]) => [{from, to, map}, {from: to, to: from, map}]),
    permittedRoutes: [
      {from: "A", to: "C", maps: ["M1"]},
      {from: "A", to: "E", maps: ["M1"]},
      {from: "B", to: "F", maps: ["M1", "M2"]},
      {from: "A", to: "G01", maps: ["LO"]},
      {from: "E", to: "G01", maps: ["M1", "LO"]},
      {from: "G01", to: "F", maps: ["LO", "M1", "M2"]},
      {from: "E", to: "F", maps: ["LO"]}
    ]
  };

  return RouteingNetwork.build(data);
}

function stations(net: RouteingNetwork, bits: Uint32Array): string[] {
  return net.arrays.stations.filter((_, x) => (bits[x >>> 5] & (1 << (x & 31))) !== 0).sort();
}

function permitted(net: RouteingNetwork, from: string, to: string): string[] {
  return stations(net, net.permitted(net.routeingPoint(from)!, net.routeingPoint(to)!));
}

describe("RouteingNetwork", () => {

  it("permits either way round a ring, including stations between nodes", () => {
    expect(permitted(network(), "A", "C")).toEqual(["A", "B", "C", "D", "X"]);
  });

  it("does not permit a spur that would have to be doubled back along", () => {
    const net = network();

    expect(permitted(net, "A", "E")).toEqual(["A", "B", "C", "D", "E", "X"]);
    expect(permitted(net, "A", "C")).not.toContain("E");
  });

  it("follows maps in order, changing where they meet", () => {
    expect(permitted(network(), "B", "F")).toEqual(["A", "B", "C", "D", "F", "X"]);
  });

  it("goes via London for a route of LO between places not on the LO map", () => {
    const net = network();

    expect(permitted(net, "E", "F")).toEqual(["A", "B", "C", "D", "E", "F", "L1", "L2", "X"]);
    expect(permitted(net, "A", "G01")).toEqual(["A", "L1", "L2"]);
  });

  it("gives group members the group as their routeing point and joins them at no distance", () => {
    const net = network();
    const l2 = net.station("L2")!;

    expect(Array.from(net.routeingPointsOf(l2), p => net.arrays.routeingPoints[p])).toEqual(["G01"]);
    expect(net.arrays.miles[net.station("L1")! * net.stationCount + l2]).toBe(0);
  });

  it("gives other stations their listed routeing points", () => {
    const net = network();

    expect(Array.from(net.routeingPointsOf(net.station("X")!), p => net.arrays.routeingPoints[p])).toEqual(["A", "B"]);
  });

  it("gives a station that is a routeing point only itself, whatever is listed for it", () => {
    const net = network();

    expect(Array.from(net.routeingPointsOf(net.station("C")!), p => net.arrays.routeingPoints[p])).toEqual(["C"]);
  });

  it("gives a station none when none of its listed routeing points exist", () => {
    const net = network();

    expect(net.routeingPointsOf(net.station("V")!).length).toBe(0);
  });

  it("gives a station the links do not connect no local journey, and leaves it out of the catchment", () => {
    const net = network();
    const local = new Uint32Array(net.words);

    net.addLocal(net.station("W")!, net.routeingPoint("A")!, local);

    expect(stations(net, local)).toEqual([]);
    expect(stations(net, net.catchment(net.routeingPoint("A")!))).toEqual(["A", "B", "X", "Y"]);
  });

  it("permits local journeys no more than three miles longer than the shortest", () => {
    const net = network();
    const local = new Uint32Array(net.words);

    net.addLocal(net.station("Y")!, net.routeingPoint("B")!, local);

    expect(stations(net, local)).toEqual(["A", "B", "X", "Y"]);
  });

  it("includes the local journeys of related stations in a routeing point's catchment", () => {
    expect(stations(network(), network().catchment(network().routeingPoint("A")!))).toEqual(["A", "B", "X", "Y"]);
  });

});
