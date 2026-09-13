import { describe, it, expect } from "vitest";
import { FeedBuilder } from "./FeedBuilder.js";
import { normalise } from "./Normalise.js";

describe("FeedBuilder", () => {

  it("gives a trip its stop times in the order the file listed them", () => {
    const builder = new FeedBuilder();

    builder.add("trip", { trip_id: "t1", service_id: "s1" });
    builder.add("stop_time", { trip_id: "t1", stop_id: "A", arrival_time: "10:00:00", departure_time: "10:00:00" });
    builder.add("stop_time", { trip_id: "t1", stop_id: "B", arrival_time: "10:30:00", departure_time: "10:30:00" });

    const [trip] = builder.build().trips;

    expect(trip.stopTimes.length).to.equal(2);
    expect(trip.stopTimes[0].stop).to.equal("A");
    expect(trip.stopTimes[1].stop).to.equal("B");
    expect(trip.stopTimes[0].arrivalTime).to.equal(36000);
  });

  it("gives a trip with no stop times an empty list", () => {
    const builder = new FeedBuilder();

    builder.add("trip", { trip_id: "t1", service_id: "s1" });

    expect(builder.build().trips[0].stopTimes.length).to.equal(0);
  });

  it("takes the stop times of a trip that appears before its stop times", () => {
    const builder = new FeedBuilder();

    builder.add("stop_time", { trip_id: "t1", stop_id: "A", arrival_time: "10:00:00", departure_time: "10:00:00" });
    builder.add("trip", { trip_id: "t1", service_id: "s1" });

    expect(builder.build().trips[0].stopTimes.length).to.equal(1);
  });

  /**
   * A feed leaves pickup_type empty for an ordinary call, and the parser reports an empty field as
   * undefined. Reading that as "not allowed" would silently drop most of the calls in a feed.
   */
  it("treats a stop time with no pick up or set down code as usable", () => {
    const builder = new FeedBuilder();

    builder.add("trip", { trip_id: "t1", service_id: "s1" });
    builder.add("stop_time", { trip_id: "t1", stop_id: "A", arrival_time: "10:00:00", departure_time: "10:00:00" });

    const [stopTime] = builder.build().trips[0].stopTimes;

    expect(stopTime.pickUp).to.equal(true);
    expect(stopTime.dropOff).to.equal(true);
  });

  it("obeys an explicit pick up or set down code", () => {
    const builder = new FeedBuilder();

    builder.add("trip", { trip_id: "t1", service_id: "s1" });
    builder.add("stop_time", {
      trip_id: "t1", stop_id: "A", arrival_time: "10:00:00", departure_time: "10:00:00",
      pickup_type: "1", drop_off_type: "0"
    });

    const [stopTime] = builder.build().trips[0].stopTimes;

    expect(stopTime.pickUp).to.equal(false);
    expect(stopTime.dropOff).to.equal(true);
  });

  it("records a footpath from a stop to itself as interchange time", () => {
    const builder = new FeedBuilder();

    builder.add("transfer", { from_stop_id: "A", to_stop_id: "A", min_transfer_time: "300" });

    const feed = builder.build();

    expect(feed.interchange.A).to.equal(300);
    expect(feed.transfers.A).to.equal(undefined);
  });

  it("records a footpath between two stops as a transfer", () => {
    const builder = new FeedBuilder();

    builder.add("transfer", { from_stop_id: "A", to_stop_id: "B", min_transfer_time: "300" });

    const feed = builder.build();

    expect(feed.transfers.A.length).to.equal(1);
    expect(feed.transfers.A[0].destination).to.equal("B");
    expect(feed.interchange.A).to.equal(undefined);
  });

  /**
   * min_transfer_time is optional for transfer types 0 and 1, where it means the change is possible
   * with no minimum. Read as a number without checking it would be NaN, and that NaN would go on
   * into every journey planned through the stop.
   */
  it("treats a transfer with no minimum time as taking none", () => {
    const builder = new FeedBuilder();

    builder.add("transfer", { from_stop_id: "A", to_stop_id: "A", transfer_type: "1" });
    builder.add("transfer", { from_stop_id: "B", to_stop_id: "C", transfer_type: "0" });

    const feed = builder.build();

    expect(feed.interchange.A).to.equal(0);
    expect(feed.transfers.B[0].duration).to.equal(0);
  });

  it("refuses a transfer time it cannot read", () => {
    const builder = new FeedBuilder();

    expect(() => builder.add("transfer", {
      from_stop_id: "A", to_stop_id: "B", min_transfer_time: "soon"
    })).to.throw(/transfer time/);
  });

  it("gives a transfer with no window one that is always open", () => {
    const builder = new FeedBuilder();

    builder.add("transfer", { from_stop_id: "A", to_stop_id: "B", min_transfer_time: "300" });

    const [transfer] = builder.build().transfers.A;

    expect(transfer.startTime).to.equal(0);
    expect(Number.MAX_SAFE_INTEGER).to.equal(transfer.endTime);
  });

  it("keeps the window of a transfer that has one", () => {
    const builder = new FeedBuilder();

    builder.add("transfer", {
      from_stop_id: "A", to_stop_id: "B", min_transfer_time: "300",
      start_time: "06:00:00", end_time: "22:00:00"
    });

    const [transfer] = builder.build().transfers.A;

    expect(transfer.startTime).to.equal(21600);
    expect(transfer.endTime).to.equal(79200);
  });

  it("maps the days of a calendar onto the days of the week", () => {
    const builder = new FeedBuilder();

    builder.add("calendar", {
      service_id: "s1", start_date: "20250101", end_date: "20251231",
      monday: "1", tuesday: "0", wednesday: "0", thursday: "0",
      friday: "0", saturday: "0", sunday: "1"
    });
    builder.add("trip", { trip_id: "t1", service_id: "s1" });

    const { service } = builder.build().trips[0];

    expect(service.runsOn(20250105, 0)).to.equal(true); // a Sunday
    expect(service.runsOn(20250106, 1)).to.equal(true); // a Monday
    expect(service.runsOn(20250107, 2)).to.equal(false); // a Tuesday
  });

  it("applies the exceptions in calendar_dates.txt", () => {
    const builder = new FeedBuilder();

    builder.add("calendar", {
      service_id: "s1", start_date: "20250101", end_date: "20251231",
      monday: "1", tuesday: "1", wednesday: "1", thursday: "1",
      friday: "1", saturday: "1", sunday: "1"
    });
    builder.add("calendar_date", { service_id: "s1", date: "20250106", exception_type: "2" });
    builder.add("calendar_date", { service_id: "s1", date: "20260106", exception_type: "1" });
    builder.add("trip", { trip_id: "t1", service_id: "s1" });

    const { service } = builder.build().trips[0];

    expect(service.runsOn(20250106, 1)).to.equal(false); // excluded
    expect(service.runsOn(20250107, 2)).to.equal(true); // ordinary
    expect(service.runsOn(20260106, 1)).to.equal(true); // included, though outside the window
  });

  /**
   * A feed may leave calendar.txt out and say when everything runs in calendar_dates alone. Such a
   * service has no calendar row to build from, and used to end up with no calendar at all: the trip
   * carried undefined where its type promised a Service, and the feed loaded without complaint only
   * to fail much later inside runsOn.
   */
  it("builds a calendar for a service that only calendar_dates.txt mentions", () => {
    const builder = new FeedBuilder();

    builder.add("calendar_date", { service_id: "s1", date: "20250106", exception_type: "1" });
    builder.add("calendar_date", { service_id: "s1", date: "20250108", exception_type: "1" });
    builder.add("trip", { trip_id: "t1", service_id: "s1" });

    const { service } = builder.build().trips[0];

    expect(service.runsOn(20250106, 1)).to.equal(true);
    expect(service.runsOn(20250108, 3)).to.equal(true);
    expect(service.runsOn(20250107, 2)).to.equal(false);
  });

  it("reads the period the feed covers", () => {
    const builder = new FeedBuilder();

    builder.add("feed_info", { feed_start_date: "20250901", feed_end_date: "20251101", feed_version: "7" });

    const { feedInfo } = builder.build();

    expect(feedInfo?.startDate).to.equal(20250901);
    expect(feedInfo?.endDate).to.equal(20251101);
    expect(feedInfo?.version).to.equal("7");
  });

  it("reads a stop", () => {
    const builder = new FeedBuilder();

    builder.add("stop", {
      stop_id: "9100NRCH", stop_code: "NRW", stop_name: "Norwich", stop_desc: "",
      stop_lat: "52.627", stop_lon: "1.306", location_type: "1", platform_code: "4"
    });

    const stop = builder.build().stops["9100NRCH"];

    expect(stop.code).to.equal("NRW");
    expect(stop.name).to.equal("Norwich");
    expect(stop.latitude).to.equal(52.627);
    expect(stop.locationType).to.equal(1);
    expect(stop.platformCode).to.equal("4");
  });

  /**
   * The timezone is stop_timezone. This used to read zone_id, which is the fare zone, and so
   * reported the timezone of a feed that gives one as undefined while the real value sat unread.
   */
  it("reads a stop's timezone, not its fare zone", () => {
    const builder = new FeedBuilder();

    builder.add("stop", {
      stop_id: "A", stop_lat: "1", stop_lon: "2", stop_timezone: "Europe/London", zone_id: "3"
    });

    expect(builder.build().stops.A.timezone).to.equal("Europe/London");
  });

  it("defaults the location type of a stop that does not give one", () => {
    const builder = new FeedBuilder();

    builder.add("stop", { stop_id: "A", stop_lat: "1", stop_lon: "2" });

    expect(builder.build().stops.A.locationType).to.equal(0);
  });

  it("reads a route", () => {
    const builder = new FeedBuilder();

    builder.add("route", {
      route_id: "GW", agency_id: "=GW", route_short_name: "GWR",
      route_long_name: "Great Western Railway", route_type: "2", route_color: "0a493e",
      route_text_color: "ffffff", route_url: "https://www.gwr.com/", route_desc: ""
    });

    const route = builder.build().routes.GW;

    expect(route.id).to.equal("GW");
    expect(route.agencyId).to.equal("=GW");
    expect(route.shortName).to.equal("GWR");
    expect(route.longName).to.equal("Great Western Railway");
    expect(route.type).to.equal(2);
    expect(route.color).to.equal("0a493e");
  });

  /**
   * The equals sign is the National Operator Catalogue form, which distinguishes a rail operator
   * from the airline with the same two letters. Stripping it here would reintroduce the collision
   * it exists to prevent, and leave routes.txt pointing at an agency id agency.txt does not have.
   */
  it("keeps an agency id exactly as the feed wrote it", () => {
    const builder = new FeedBuilder();

    builder.add("agency", {
      agency_id: "=GW", agency_name: "Great Western Railway", agency_url: "https://www.gwr.com/",
      agency_timezone: "Europe/London", agency_lang: "en", agency_phone: "0345 700 0125"
    });
    builder.add("route", { route_id: "GW", agency_id: "=GW", route_type: "2" });

    const feed = builder.build();

    expect(Object.keys(feed.agencies)).to.deep.equal(["=GW"]);
    expect(feed.agencies["=GW"].name).to.equal("Great Western Railway");
    expect(feed.agencies[feed.routes.GW.agencyId as string].name).to.equal("Great Western Railway");
  });

  it("gives a trip its route, its headcode and its headsign", () => {
    const builder = new FeedBuilder();

    builder.add("trip", {
      trip_id: "G14978_A_B", service_id: "s1", route_id: "GW",
      trip_short_name: "GW130700", trip_headsign: "PLYMOUTH"
    });

    const [trip] = builder.build().trips;

    expect(trip.routeId).to.equal("GW");
    expect(trip.shortName).to.equal("GW130700");
    expect(trip.headsign).to.equal("PLYMOUTH");
  });

  it("leaves a trip's route and names undefined when the feed gives none", () => {
    const builder = new FeedBuilder();

    builder.add("trip", { trip_id: "t1", service_id: "s1" });

    const [trip] = builder.build().trips;

    expect(trip.routeId).to.equal(undefined);
    expect(trip.shortName).to.equal(undefined);
    expect(trip.headsign).to.equal(undefined);
  });

  it("keeps how a transfer is made", () => {
    const builder = new FeedBuilder();

    builder.add("transfer", {
      from_stop_id: "910GKNGX", to_stop_id: "910GPADTON", min_transfer_time: "900",
      mode: "TRANSFER|TUBE"
    });
    builder.add("transfer", { from_stop_id: "A", to_stop_id: "B", min_transfer_time: "300" });

    const feed = builder.build();

    expect(feed.transfers["910GKNGX"][0].mode).to.equal("TRANSFER|TUBE");
    expect(feed.transfers.A[0].mode).to.equal(undefined);
  });

  it("reads an area from areas.txt and stop_areas.txt together", () => {
    const builder = new FeedBuilder();

    builder.add("area", { area_id: "0032", area_name: "LONDON ZONES 1-2" });
    builder.add("stop_area", { area_id: "0032", stop_id: "910GEUSTON" });
    builder.add("stop_area", { area_id: "0032", stop_id: "910GCHRX" });

    const area = builder.build().areas["0032"];

    expect(area.id).to.equal("0032");
    expect(area.name).to.equal("LONDON ZONES 1-2");
    expect(area.stops).to.deep.equal(["910GEUSTON", "910GCHRX"]);
  });

  /**
   * The GB feed writes stop_areas.txt ahead of areas.txt, so the memberships of an area arrive
   * before it has been named.
   */
  it("reads an area whose stops arrive before its name", () => {
    const builder = new FeedBuilder();

    builder.add("stop_area", { area_id: "0032", stop_id: "910GEUSTON" });
    builder.add("area", { area_id: "0032", area_name: "LONDON ZONES 1-2" });

    const area = builder.build().areas["0032"];

    expect(area.name).to.equal("LONDON ZONES 1-2");
    expect(area.stops).to.deep.equal(["910GEUSTON"]);
  });

  it("gives an area with no stops an empty list, and one with no name no name", () => {
    const builder = new FeedBuilder();

    builder.add("area", { area_id: "0032", area_name: "LONDON ZONES 1-2" });
    builder.add("stop_area", { area_id: "0033", stop_id: "910GEUSTON" });

    const { areas } = builder.build();

    expect(areas["0032"].stops).to.deep.equal([]);
    expect(areas["0033"].name).to.equal(undefined);
  });

  it("gives a feed with none of those files empty indexes", () => {
    const feed = new FeedBuilder().build();

    expect(feed.routes).to.deep.equal({});
    expect(feed.agencies).to.deep.equal({});
    expect(feed.areas).to.deep.equal({});
  });

  /**
   * A feed that leaves stop_code empty names the station by its stop_id. If an empty field were
   * read as "" rather than undefined every such station would claim the same code and the
   * timetable would refuse to build, so this is worth pinning down.
   */
  it("holds the shape of the trip a coupling makes alongside the feed's own", () => {
    const builder = new FeedBuilder();

    builder.add("trip", { trip_id: "base", service_id: "s1", shape_id: "long" });
    builder.add("trip", { trip_id: "portion", service_id: "s1", shape_id: "branch" });
    builder.add("stop", { stop_id: "B", stop_lat: "51.1", stop_lon: "-1" });
    builder.add("transfer", { from_stop_id: "B", to_stop_id: "B", from_trip_id: "base", to_trip_id: "portion", transfer_type: "4" });

    for (const [shape_id, sequence, lat] of [["long", "1", "51.0"], ["long", "2", "51.1"], ["long", "3", "51.2"], ["branch", "1", "51.1"], ["branch", "2", "51.3"]]) {
      builder.add("shape", { shape_id, shape_pt_sequence: sequence, shape_pt_lat: lat, shape_pt_lon: "-1" });
    }

    const { shapes } = builder.build();

    expect(Object.keys(shapes).sort()).to.deep.equal(["branch", "long", "long_branch_B_B"]);
    expect(shapes.long_branch_B_B.map(point => point.latitude)).to.deep.equal([51.0, 51.1, 51.3]);
  });

  it("names a station by its stop_id when the feed gives no stop_code", () => {
    const builder = new FeedBuilder();

    builder.add("stop", { stop_id: "A", stop_lat: "1", stop_lon: "2" });
    builder.add("stop", { stop_id: "B", stop_lat: "3", stop_lon: "4" });

    const { stations } = normalise(builder.build());

    expect(stations.get("A")).to.equal("A");
    expect(stations.get("B")).to.equal("B");
  });

});
