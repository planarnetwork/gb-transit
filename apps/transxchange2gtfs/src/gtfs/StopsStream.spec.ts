import {StopsStream} from "./StopsStream";
import {describe, it, expect} from "vitest";
import {awaitStream} from "../testing/util";


describe("StopsStream", () => {
  const stop = (
    atcoCode: string, naptanCode: string, name: string, street: string, indicator: string,
    locality: string, parentLocality: string
  ) => ({
    atcoCode, naptanCode, name, street, indicator, locality, parentLocality,
    localityCode: "E001", bearing: "N", stopType: "BCT",
    longitude: "1.00", latitude: "1.00"
  });

  const naptan = {
    "a": stop("a", "naptanA", "nameA", "streetA", "NE", "townA", "cityA"),
    "b": stop("b", "naptanB", "nameB", "streetB", "NE", "townB", ""),
    "c": stop("c", "naptanC", "nameC Road", "streetC", "NE", "townC", "cityC"),
    "d": stop("d", "naptanD", "nameD", "streetD", "->SW", "townD", "cityD"),
  };

  it("uses naptan data if it's available", async () => {
    const stops = new StopsStream(naptan);
    stops.write({
      StopPoints: [{
        StopPointRef: "a",
        CommonName: "name",
        LocalityName: "locality",
        LocalityQualifier: "qualifier"
      }]
    });
    stops.end();

    return awaitStream(stops, (rows: any[]) => {
      const {stop_id, stop_code, stop_name, stop_desc, stop_lat, stop_lon} = rows[0];
      expect(stop_id).to.equal("a");
      expect(stop_code).to.equal("naptanA");
      expect(stop_name).to.equal("nameA (NE), streetA, cityA");
      expect(stop_desc).to.equal("nameA");
      expect(stop_lat).to.equal("1.00");
      expect(stop_lon).to.equal("1.00");
    });
  });

  it("uses feed data if NaPTAN location is not found", async () => {
    const stops = new StopsStream(naptan);
    stops.write({
      StopPoints: [{
        StopPointRef: "NotInIndex",
        CommonName: "name",
        LocalityName: "locality",
        LocalityQualifier: "qualifier",
        Location: {
          Latitude: 0.123,
          Longitude: -0.123,
        }
      }]
    });
    stops.end();

    return awaitStream(stops, (rows: any[]) => {
      const {stop_id, stop_code, stop_name, stop_desc, stop_lat, stop_lon} = rows[0];

      expect(stop_id).to.equal("NotInIndex");
      expect(stop_code).to.equal("");
      expect(stop_name).to.equal("name, qualifier");
      expect(stop_desc).to.equal("");
      expect(stop_lat).to.equal(0.123);
      expect(stop_lon).to.equal(-0.123);
    });
  });

  it("uses the town if it is city is not present", async () => {
    const stops = new StopsStream(naptan);
    stops.write({
      StopPoints: [{
        StopPointRef: "b",
        CommonName: "name",
        LocalityName: "locality",
        LocalityQualifier: "qualifier"
      }]
    });
    stops.end();

    return awaitStream(stops, (rows: any[]) => {
      const {stop_id, stop_code, stop_name} = rows[0];

      expect(stop_id).to.equal("b");
      expect(stop_code).to.equal("naptanB");
      expect(stop_name).to.equal("nameB (NE), streetB, townB");
    });
  });

  it("adds the street name if it is useful", async () => {
    const stops = new StopsStream(naptan);
    stops.write({
      StopPoints: [{
        StopPointRef: "c",
        CommonName: "name",
        LocalityName: "locality",
        LocalityQualifier: "qualifier"
      }]
    });
    stops.end();

    return awaitStream(stops, (rows: any[]) => {
      const {stop_id, stop_code, stop_name} = rows[0];

      expect(stop_id).to.equal("c");
      expect(stop_code).to.equal("naptanC");
      expect(stop_name).to.equal("nameC Road (NE), cityC");
    });
  });

  it("removes -> from the indicator", async () => {
    const stops = new StopsStream(naptan);
    stops.write({
      StopPoints: [{
        StopPointRef: "d",
        CommonName: "name",
        LocalityName: "locality",
        LocalityQualifier: "qualifier"
      }]
    });
    stops.end();

    return awaitStream(stops, (rows: any[]) => {
      const {stop_id, stop_code, stop_name} = rows[0];

      expect(stop_id).to.equal("d");
      expect(stop_code).to.equal("naptanD");
      expect(stop_name).to.equal("nameD (SW), streetD, cityD");
    });
  });

  it("writes a stand as a platform code and a relative position as none", async () => {
    const stands = {
      "s1": stop("s1", "n1", "Bus Station", "", "Stand C", "townA", ""),
      "s2": stop("s2", "n2", "Bus Station", "", "Bay 4", "townA", ""),
      "s3": stop("s3", "n3", "Bus Station", "", "A", "townA", ""),
      "s4": stop("s4", "n4", "Market Square", "", "adj", "townA", ""),
      "s5": stop("s5", "n5", "Market Square", "", "NE", "townA", "")
    };
    const stops = new StopsStream(stands);

    stops.write({
      StopPoints: Object.keys(stands).map(StopPointRef => ({
        StopPointRef, CommonName: "", LocalityName: "", LocalityQualifier: ""
      }))
    });
    stops.end();

    return awaitStream(stops, (rows: any[]) => {
      expect(rows.map(r => r.platform_code)).to.deep.equal(["C", "4", "A", null, null]);
    });
  });

  it("puts a pair of stops under the station they stand in", async () => {
    const area = {id: "gp:a", name: "Market Square, cityA", longitude: "1.05", latitude: "1.05"};
    const stops = new StopsStream(naptan, {a: area, b: area});

    stops.write({
      StopPoints: ["a", "b"].map(StopPointRef => ({
        StopPointRef, CommonName: "", LocalityName: "", LocalityQualifier: ""
      }))
    });
    stops.end();

    return awaitStream(stops, (rows: any[]) => {
      // The station first, then its stops, each pointing at it.
      expect(rows.map(r => r.stop_id)).to.deep.equal(["gp:a", "a", "b"]);
      expect(rows[0].location_type).to.equal(1);
      expect(rows[0].stop_name).to.equal("Market Square, cityA");
      expect(rows[1].parent_station).to.equal("gp:a");
      expect(rows[2].parent_station).to.equal("gp:a");
    });
  });

  it("emits the station once, however many of its stops are used", async () => {
    const area = {id: "gp:a", name: "Market Square, cityA", longitude: "1.05", latitude: "1.05"};
    const stops = new StopsStream(naptan, {a: area, b: area});

    stops.write({StopPoints: [{StopPointRef: "a", CommonName: "", LocalityName: "", LocalityQualifier: ""}]});
    stops.write({StopPoints: [{StopPointRef: "b", CommonName: "", LocalityName: "", LocalityQualifier: ""}]});
    stops.end();

    return awaitStream(stops, (rows: any[]) => {
      expect(rows.filter(r => r.stop_id === "gp:a").length).to.equal(1);
    });
  });

  it("does not emit the same stop twice", async () => {
    const stops = new StopsStream(naptan);
    stops.write({
      StopPoints: [{
        StopPointRef: "a",
        CommonName: "name",
        LocalityName: "locality",
        LocalityQualifier: "qualifier"
      }]
    });
    stops.write({
      StopPoints: [{
        StopPointRef: "a",
        CommonName: "name",
        LocalityName: "locality",
        LocalityQualifier: "qualifier"
      }]
    });
    stops.end();

    return awaitStream(stops, (rows: any[]) => {
      expect(rows.length).to.equal(1);
    });
  });

});
