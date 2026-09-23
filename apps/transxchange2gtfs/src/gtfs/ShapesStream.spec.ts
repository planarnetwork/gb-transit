import {describe, it, expect} from "vitest";
import {awaitStream} from "../testing/util";
import {ShapesStream} from "./ShapesStream";

describe("ShapesStream", () => {

  function journey(overrides: any = {}): any {
    return Object.assign(
      {
        route: "M6_MEGA|l",
        routeLinkIds: ["R1", "R2"],
        routeLinks: [
          {
            From: "A", To: "B", Distance: 1000,
            Locations: [
              { Latitude: 51.0, Longitude: -1.0 },
              { Latitude: 51.001, Longitude: -1.0 }
            ]
          },
          {
            From: "B", To: "C", Distance: 2000,
            Locations: [
              { Latitude: 51.001, Longitude: -1.0 },
              { Latitude: 51.01, Longitude: -1.0 }
            ]
          }
        ]
      },
      overrides
    );
  }

  it("emits a header row", async () => {
    const stream = new ShapesStream();
    stream.write(journey());
    stream.end();

    return awaitStream(stream, (rows: any[]) => {
      expect(stream.file.columns).to.deep.equal(
        ["shape_id", "shape_pt_lat", "shape_pt_lon", "shape_pt_sequence", "shape_dist_traveled"]
      );
    });
  });

  it("emits a point per location with increasing sequence and scaled distance", async () => {
    const stream = new ShapesStream();
    stream.write(journey());
    stream.end();

    return awaitStream(stream, (rows: any[]) => {
      const points = rows.map(r => [r.shape_id, r.shape_pt_lat, r.shape_pt_lon, r.shape_pt_sequence, r.shape_dist_traveled]);
      // 4 locations across two links, but the shared endpoint between them dedupes to 3 points.
      expect(points.length).to.equal(3);

      const shapeId = points[0][0];
      for (const p of points) expect(p[0]).to.equal(shapeId);

      expect(points.map(p => p[3])).to.deep.equal([0, 1, 2]);

      const distances = points.map(p => parseFloat(p[4]));
      for (let i = 1; i < distances.length; i++) {
        expect(distances[i]).to.be.greaterThanOrEqual(distances[i - 1]);
      }
      // final point is at the cumulative link distance (1000m + 2000m = 3km)
      expect(distances[distances.length - 1]).to.be.closeTo(3, 1e-6);
    });
  });

  it("dedupes shapes that share the same route and route link sequence", async () => {
    const stream = new ShapesStream();
    stream.write(journey());
    stream.write(journey());
    stream.end();

    return awaitStream(stream, (rows: any[]) => {
      // 3 points from the first journey; the duplicate journey should be suppressed
      expect(rows.length).to.equal(3);
    });
  });

  it("does not emit NaN when a route link has no measurable length", async () => {
    const degenerate = journey({
      routeLinks: [
        {
          From: "A", To: "B", Distance: 1000,
          Locations: [
            { Latitude: 51.0, Longitude: -1.0 }
          ]
        },
        {
          From: "B", To: "C", Distance: 500,
          Locations: [
            { Latitude: 51.0, Longitude: -1.0 },
            { Latitude: 51.0, Longitude: -1.0 }
          ]
        }
      ]
    });

    const stream = new ShapesStream();
    stream.write(degenerate);
    stream.end();

    return awaitStream(stream, (rows: any[]) => {
      for (const row of rows.slice(1)) {
        expect(row).to.not.include("NaN");
      }
    });
  });

  /**
   * TfL's route links have no track. The journey is still drawn, stop to stop,
   * through where NaPTAN places the stops - and through the station of a
   * platform NaPTAN does not list.
   */
  it("draws a link with no track from the stop it leaves to the stop it reaches", async () => {
    const naptan: any = {
      "9400ZZLUBST1": {latitude: "51.5232", longitude: "-0.1575"},
      "9400ZZLUBND1": {latitude: "51.5142", longitude: "-0.1494"}
    };
    const areas: any = {"940GZZLUOXC": {id: "940GZZLUOXC", name: "", latitude: "51.5152", longitude: "-0.1415"}};
    const tube = journey({
      route: "1-JUB|1-JUB",
      routeLinkIds: ["L1", "L2"],
      routeLinks: [
        {From: "9400ZZLUBST1", To: "9400ZZLUBND1", Distance: 1100, Locations: []},
        {From: "9400ZZLUBND1", To: "9400ZZLUOXC7", Distance: 600, Locations: []}
      ]
    });
    const stream = new ShapesStream(naptan, areas);

    stream.write(tube);
    stream.end();

    return awaitStream(stream, (rows: any[]) => {
      expect(rows.map(r => [r.shape_pt_lat, r.shape_pt_lon])).to.deep.equal([
        [51.5232, -0.1575], [51.5142, -0.1494], [51.5152, -0.1415]
      ]);
      expect(parseFloat(rows[2].shape_dist_traveled)).to.be.closeTo(1.7, 1e-6);
    });
  });

  it("leaves a link out where neither end can be placed, rather than drawing to Null Island", async () => {
    const stream = new ShapesStream();

    stream.write(journey({routeLinks: [{From: "X", To: "Y", Distance: 100, Locations: []}]}));
    stream.end();

    return awaitStream(stream, (rows: any[]) => {
      expect(rows).to.deep.equal([]);
    });
  });

});
