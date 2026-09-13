import { describe, it, expect } from "vitest";
import type { ShapePoint, Stop, StopID, Trip, TripLink } from "./GTFS.js";
import { linkShapes, linkTrips } from "./LinkedTrips.js";
import { Service } from "./Service.js";
import type { StopTime, Time } from "./GTFS.js";

function st(stop: StopID, arrivalTime: Time | null, departureTime: Time | null): StopTime {
  return {
    stop: stop,
    arrivalTime: arrivalTime || departureTime!,
    departureTime: departureTime || arrivalTime!,
    dropOff: arrivalTime !== null,
    pickUp: departureTime !== null
  };
}

// 20180101 is a Monday
const MONDAY = 20180101;
const TUESDAY = 20180102;
const allDays = { 0: true, 1: true, 2: true, 3: true, 4: true, 5: true, 6: true };
const noDays = { 0: false, 1: false, 2: false, 3: false, 4: false, 5: false, 6: false };
const everyDay = new Service(20180101, 20181231, allDays, {});
const mondays = new Service(20180101, 20181231, { ...noDays, 1: true }, {});
const tuesdays = new Service(20180101, 20181231, { ...noDays, 2: true }, {});

function trip(tripId: string, service: Service, ...stopTimes: Trip["stopTimes"]): Trip {
  return { tripId, serviceId: tripId, stopTimes, service };
}

function link(fromTripId: string, toTripId: string, fromStop?: StopID, toStop?: StopID): TripLink {
  return { fromTripId, toTripId, fromStop, toStop };
}

const platforms = new Map<StopID, StopID>([["B1", "B"], ["B2", "B"]]);
const station = (stop: StopID): StopID => platforms.get(stop) ?? stop;

const at = (t: Trip) => t.stopTimes.map(s => `${s.stop}@${s.arrivalTime}/${s.departureTime}`);

describe("linkTrips", () => {

  it("returns nothing when the feed has no links", () => {
    expect(linkTrips([trip("a", everyDay, st("A", null, 100))], [], station)).to.deep.equal([]);
  });

  it("joins a portion onto the trip it continues as", () => {
    const portion = trip("p", everyDay, st("A", null, 100), st("B", 200, 200));
    const base = trip("b", everyDay, st("B", 250, 300), st("C", 400, null));

    const [linked] = linkTrips([portion, base], [link("p", "b", "B", "B")], station);

    expect(linked.tripId).to.equal("p_b");
    expect(at(linked)).to.deep.equal(["A@100/100", "B@200/300", "C@400/400"]);
  });

  it("splits a portion off part way along the trip it continues", () => {
    const base = trip("b", everyDay, st("A", null, 100), st("B", 200, 250), st("C", 400, null));
    const portion = trip("p", everyDay, st("B", 260, 300), st("D", 500, null));

    const [linked] = linkTrips([base, portion], [link("b", "p", "B", "B")], station);

    expect(at(linked)).to.deep.equal(["A@100/100", "B@200/300", "D@500/500"]);
  });

  it("leaves both trips as they are", () => {
    const base = trip("b", everyDay, st("A", null, 100), st("B", 200, 250), st("C", 400, null));
    const portion = trip("p", everyDay, st("B", 260, 300), st("D", 500, null));

    linkTrips([base, portion], [link("b", "p", "B", "B")], station);

    expect(at(base)).to.deep.equal(["A@100/100", "B@200/250", "C@400/400"]);
    expect(at(portion)).to.deep.equal(["B@260/300", "D@500/500"]);
  });

  it("takes set down from the arriving trip and pick up from the departing one", () => {
    const portion = trip("p", everyDay, st("A", null, 100), st("B", 200, null));
    const base = trip("b", everyDay, st("B", null, 300), st("C", 400, null));

    const [linked] = linkTrips([portion, base], [link("p", "b", "B", "B")], station);

    expect(linked.stopTimes[1].dropOff).to.equal(true);
    expect(linked.stopTimes[1].pickUp).to.equal(true);
  });

  it("matches the coupling on the station rather than the platform", () => {
    const portion = trip("p", everyDay, st("A", null, 100), st("B1", 200, 200));
    const base = trip("b", everyDay, st("B2", 250, 300), st("C", 400, null));

    const [linked] = linkTrips([portion, base], [link("p", "b", "B1", "B2")], station);

    expect(at(linked)).to.deep.equal(["A@100/100", "B1@200/300", "C@400/400"]);
  });

  it("couples end to end when the link names no stop", () => {
    const portion = trip("p", everyDay, st("A", null, 100), st("B", 200, 200));
    const base = trip("b", everyDay, st("B", 250, 300), st("C", 400, null));

    const [linked] = linkTrips([portion, base], [link("p", "b")], station);

    expect(at(linked)).to.deep.equal(["A@100/100", "B@200/300", "C@400/400"]);
  });

  it("adds a day to a portion that leaves after midnight", () => {
    const base = trip("b", mondays, st("A", null, 75600), st("B", 100800, 100800));
    const portion = trip("p", tuesdays, st("B", 16080, 16080), st("C", 27000, null));

    const [linked] = linkTrips([base, portion], [link("b", "p", "B", "B")], station);

    expect(at(linked)).to.deep.equal(["A@75600/75600", "B@100800/102480", "C@113400/113400"]);
  });

  it("runs on the arriving trip's day when the portion leaves after midnight", () => {
    const base = trip("b", mondays, st("A", null, 75600), st("B", 100800, 100800));
    const portion = trip("p", tuesdays, st("B", 16080, 16080), st("C", 27000, null));

    const [linked] = linkTrips([base, portion], [link("b", "p", "B", "B")], station);

    expect(linked.service.runsOn(MONDAY, 1)).to.equal(true);
    expect(linked.service.runsOn(TUESDAY, 2)).to.equal(false);
  });

  it("runs only on the days both trips do", () => {
    const portion = trip("p", everyDay, st("A", null, 100), st("B", 200, 200));
    const base = trip("b", mondays, st("B", 250, 300), st("C", 400, null));

    const [linked] = linkTrips([portion, base], [link("p", "b", "B", "B")], station);

    expect(linked.service.runsOn(MONDAY, 1)).to.equal(true);
    expect(linked.service.runsOn(TUESDAY, 2)).to.equal(false);
  });

  it("makes a trip for each portion of a train that splits more than once", () => {
    const base = trip("b", everyDay, st("A", null, 100), st("B", 200, 250), st("C", 400, null));
    const first = trip("p1", everyDay, st("B", 260, 300), st("D", 500, null));
    const second = trip("p2", everyDay, st("B", 260, 320), st("E", 600, null));

    const linked = linkTrips(
      [base, first, second],
      [link("b", "p1", "B", "B"), link("b", "p2", "B", "B")],
      station
    );

    expect(linked.map(at)).to.deep.equal([
      ["A@100/100", "B@200/300", "D@500/500"],
      ["A@100/100", "B@200/320", "E@600/600"]
    ]);
  });

  it("ignores a link naming a trip the feed does not have", () => {
    const portion = trip("p", everyDay, st("A", null, 100), st("B", 200, 200));

    expect(linkTrips([portion], [link("p", "missing", "B", "B")], station)).to.deep.equal([]);
  });

  it("ignores a link naming a stop neither trip calls at", () => {
    const portion = trip("p", everyDay, st("A", null, 100), st("B", 200, 200));
    const base = trip("b", everyDay, st("B", 250, 300), st("C", 400, null));

    expect(linkTrips([portion, base], [link("p", "b", "Z", "Z")], station)).to.deep.equal([]);
  });

  it("keeps the route and headcode of the train boarded, and goes where the departing trip goes", () => {
    const portion = { ...trip("p", everyDay, st("A", null, 100), st("B", 200, 200)), routeId: "R1", shortName: "1A00", headsign: "B" };
    const base = { ...trip("b", everyDay, st("B", 250, 300), st("C", 400, null)), routeId: "R2", shortName: "1B00", headsign: "C" };

    const [linked] = linkTrips([portion, base], [link("p", "b", "B", "B")], station);

    expect([linked.routeId, linked.shortName, linked.headsign]).to.deep.equal(["R1", "1A00", "C"]);
  });

  it("names the shape the two trips' shapes make, and none where either has no shape", () => {
    const portion = { ...trip("p", everyDay, st("A", null, 100), st("B", 200, 200)), shapeId: "s1" };
    const base = { ...trip("b", everyDay, st("B", 250, 300), st("C", 400, null)), shapeId: "s2" };
    const unshaped = trip("u", everyDay, st("B", 250, 300), st("D", 400, null));

    const [linked, bare] = linkTrips([portion, base, unshaped], [link("p", "b", "B", "B"), link("p", "u", "B", "B")], station);

    expect(linked.shapeId).to.equal("s1_s2_B_B");
    expect(bare.shapeId).to.equal(undefined);
  });

  it("ignores a coupling that a day's shift cannot put in order", () => {
    const base = trip("b", everyDay, st("A", null, 3600), st("B", 108000, 108000));
    const portion = trip("p", everyDay, st("B", 7200, 7200), st("C", 20000, null));

    expect(linkTrips([base, portion], [link("b", "p", "B", "B")], station)).to.deep.equal([]);
  });

});

describe("linkShapes", () => {

  const point = (latitude: number, longitude: number): ShapePoint => ({ latitude, longitude });
  const stop = (id: StopID, latitude: number, longitude: number): Stop => ({ id, latitude, longitude, locationType: 0 });
  const stops = { B: stop("B", 51.1, -1), BX: stop("BX", 51.1, -1.0001) };
  const shaped = (tripId: string, shapeId: string): Trip => ({ ...trip(tripId, everyDay, st("A", null, 100)), shapeId });

  it("cuts the arriving shape at the coupling and joins the departing one on from there", () => {
    const shapes = {
      base: [point(51.0, -1), point(51.1, -1), point(51.2, -1)],
      portion: [point(51.1, -1), point(51.1, -0.9)]
    };

    const linked = linkShapes([shaped("b", "base"), shaped("p", "portion")], [link("b", "p", "B", "B")], shapes, stops);

    expect(linked).to.deep.equal({ base_portion_B_B: [point(51.0, -1), point(51.1, -1), point(51.1, -0.9)] });
  });

  it("makes a shape for each place the same two trains couple", () => {
    // the portion leaves the base's line after B and meets it again at C
    const shapes = {
      base: [point(51.0, -1), point(51.1, -1), point(51.2, -1), point(51.25, -1)],
      portion: [point(51.1, -1), point(51.15, -0.9), point(51.2, -1), point(51.3, -1)]
    };
    const later = { C: stop("C", 51.2, -1) };

    const linked = linkShapes(
      [shaped("b", "base"), shaped("p", "portion"), shaped("b2", "base"), shaped("p2", "portion")],
      [link("b", "p", "B", "B"), link("b2", "p2", "C", "C")],
      shapes,
      { ...stops, ...later }
    );

    expect(linked.base_portion_B_B.map(p => p.latitude)).to.deep.equal([51.0, 51.1, 51.15, 51.2, 51.3]);
    expect(linked.base_portion_C_C.map(p => p.latitude)).to.deep.equal([51.0, 51.1, 51.2, 51.3]);
  });

  it("starts the departing shape at its point nearest the coupling when the two do not meet exactly", () => {
    const shapes = {
      portion: [point(51.0, -1), point(51.1, -1)],
      base: [point(51.2, -1.5), point(51.1, -1.0001), point(51.1, -0.9)]
    };

    const linked = linkShapes([shaped("p", "portion"), shaped("b", "base")], [link("p", "b", "B", "BX")], shapes, stops);

    expect(linked.portion_base_B_BX).to.deep.equal([point(51.0, -1), point(51.1, -1), point(51.1, -1.0001), point(51.1, -0.9)]);
  });

  it("joins the shapes end to end when the link names no stop", () => {
    const shapes = { portion: [point(51.0, -1)], base: [point(51.2, -1)] };

    const linked = linkShapes([shaped("p", "portion"), shaped("b", "base")], [link("p", "b")], shapes, stops);

    expect(linked.portion_base).to.deep.equal([point(51.0, -1), point(51.2, -1)]);
  });

  it("makes nothing for a coupling of a trip whose shape the feed does not have", () => {
    const shapes = { portion: [point(51.0, -1)] };

    expect(linkShapes([shaped("p", "portion"), shaped("b", "missing")], [link("p", "b", "B", "B")], shapes, stops)).to.deep.equal({});
  });

});
