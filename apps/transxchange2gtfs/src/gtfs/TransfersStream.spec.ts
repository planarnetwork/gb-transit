import {describe, it, expect} from "vitest";
import {awaitStream} from "../testing/util";
import {TransfersStream} from "./TransfersStream";
import {NaptanStopPoint} from "../reference/NaPTAN";

/**
 * Two places, each of two stops, laid out so that the nearest pair and the
 * furthest pair are far apart: a1/b1 are the distant corners and a2/b2 the near
 * ones. Whichever order they are read in, the walk between the two places has to
 * be the same.
 */
const stop = (atcoCode: string, longitude: string, latitude: string): NaptanStopPoint => ({
  atcoCode,
  naptanCode: atcoCode,
  name: atcoCode,
  street: "",
  indicator: "",
  locality: "town",
  parentLocality: "",
  localityCode: "E001",
  bearing: "N",
  stopType: "BCT",
  longitude,
  latitude
});

const naptan = {
  a1: stop("a1", "-1.0000", "53.0000"),
  a2: stop("a2", "-1.0020", "53.0000"),
  b1: stop("b1", "-1.0060", "53.0000"),
  b2: stop("b2", "-1.0040", "53.0000")
};

const areas = {
  a1: {id: "gp:a1", name: "A", longitude: "-1.0010", latitude: "53.0000"},
  a2: {id: "gp:a1", name: "A", longitude: "-1.0010", latitude: "53.0000"},
  b1: {id: "gp:b1", name: "B", longitude: "-1.0050", latitude: "53.0000"},
  b2: {id: "gp:b1", name: "B", longitude: "-1.0050", latitude: "53.0000"}
};

const byLocation = {town: ["a1", "a2", "b1", "b2"]};

async function walk(order: string[]): Promise<number | undefined> {
  const stream = new TransfersStream(naptan, byLocation, areas);
  let seconds: number | undefined;

  stream.write({
    StopPoints: order.map(StopPointRef => ({
      StopPointRef, CommonName: "", LocalityName: "", LocalityQualifier: ""
    }))
  });
  stream.end();

  await awaitStream(stream, (rows: any[]) => {
    seconds = rows
      .find(r => r.from_stop_id === "gp:a1" && r.to_stop_id === "gp:b1")
      ?.min_transfer_time;
  });

  return seconds;
}

describe("TransfersStream", () => {

  it("walks between places rather than between their stops", async () => {
    const rows: any[] = [];
    const stream = new TransfersStream(naptan, byLocation, areas);

    stream.write({
      StopPoints: ["a1", "a2", "b1", "b2"].map(StopPointRef => ({
        StopPointRef, CommonName: "", LocalityName: "", LocalityQualifier: ""
      }))
    });
    stream.end();

    await awaitStream(stream, (r: any[]) => rows.push(...r));

    expect(new Set(rows.map(r => r.from_stop_id))).to.deep.equal(new Set(["gp:a1", "gp:b1"]));
    // One self transfer per place, and one walk each way between them.
    expect(rows.length).to.equal(4);
  });

  it("measures the same walk whatever order the stops arrive in", async () => {
    // Taken from the first pair reached, this was whatever the order of the
    // documents and of the NaPTAN file made it: on the national feed a third of
    // the walks were longer than the nearest pair of their stops, by seventeen
    // minutes at worst.
    const forwards = await walk(["a1", "a2", "b1", "b2"]);
    const backwards = await walk(["b2", "b1", "a2", "a1"]);
    const mixed = await walk(["a2", "b1", "a1", "b2"]);

    // The two places are 0.0040 apart; their nearest stops are 0.0020 and their
    // furthest 0.0060, which taken pairwise would give 480s or 1440s depending
    // on which arrived first.
    expect(forwards).to.equal(960);
    expect(backwards).to.equal(960);
    expect(mixed).to.equal(960);
  });

  it("gives an ungrouped stop a walk from where it stands", async () => {
    const stream = new TransfersStream(naptan, byLocation, {});

    stream.write({
      StopPoints: ["a1", "a2"].map(StopPointRef => ({
        StopPointRef, CommonName: "", LocalityName: "", LocalityQualifier: ""
      }))
    });
    stream.end();

    return awaitStream(stream, (rows: any[]) => {
      expect(rows.filter(r => r.from_stop_id === r.to_stop_id).length).to.equal(2);
      expect(rows.some(r => r.from_stop_id === "a1" && r.to_stop_id === "a2")).to.equal(true);
    });
  });

});
