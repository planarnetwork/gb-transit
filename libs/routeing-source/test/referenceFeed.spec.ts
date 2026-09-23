import * as fs from "node:fs";
import * as path from "node:path";
import {describe, expect, it} from "vitest";
import {loadRouteing} from "../src/LoadRouteing";
import {RouteingNetwork} from "../src/RouteingNetwork";

const feeds = path.resolve(__dirname, "../../../data/feeds");
const feed = fs.existsSync(feeds) ? fs.readdirSync(feeds).find(f => /^RJRG\d+\.zip$/i.test(f)) : undefined;

/**
 * The reference feeds are not committed. Where they have been downloaded, check routes that are easy to verify by hand.
 */
describe.skipIf(feed === undefined)("reference routeing guide", () => {
  it("permits Norwich to Stowmarket via Diss only", async () => {
    const net = RouteingNetwork.build(await loadRouteing(path.join(feeds, feed!)));
    const bits = net.permitted(net.routeingPoint("NRW")!, net.routeingPoint("SMK")!);
    const stations = net.arrays.stations.filter((_, x) => (bits[x >>> 5] & (1 << (x & 31))) !== 0).sort();

    expect(stations).toEqual(["DIS", "NRW", "SMK"]);
    expect(Array.from(net.routeingPointsOf(net.station("DIS")!), p => net.arrays.routeingPoints[p])).toEqual(["NRW", "SMK"]);
  }, 60_000);
});
