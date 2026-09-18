import {describe, it, expect, beforeAll} from "vitest";
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import {zipSync, strToU8} from "fflate";
import {loadGTFS, FeedFileName} from "@gb-transit/gtfs-loader";
import {RouteType, TransferType} from "@gb-transit/gtfs-schema";
import {build as buildRail} from "cif2gtfs";
import {convert as buildBus} from "transxchange2gtfs";
import {merge} from "gtfsmerge";

/**
 * The three tools, in sequence, over the fixtures they each commit.
 *
 *   cif2gtfs           the mini DTD timetable  ->  a rail feed
 *   transxchange2gtfs  the mini TransXChange   ->  a bus feed
 *   gtfsmerge          both of those           ->  one feed
 *   gtfs-loader        the merged feed         ->  these assertions
 *
 * This is the only test that can exist here rather than in one of the three
 * projects, and it is the reason they are in one repository. Each of them has
 * its own golden; what this checks is that their output composes - that a rail
 * feed and a bus feed built from the same shared schema can be merged into
 * something a consumer can use.
 *
 * The bus fixture is an Amersham service because Amersham is a station the DTD
 * mini fixture actually serves, and a bus stop outside a served station is what
 * makes the last assertion here possible. Bristol Temple Meads was the first
 * choice and is in the rail feed - but only because a fixed link reaches it, not
 * because any train in the fixture calls there, so the merge drops it.
 */
const rail = path.join(import.meta.dirname, "../../apps/cif2gtfs/fixtures/mini");
const bus = path.join(import.meta.dirname, "../../apps/transxchange2gtfs/fixtures/mini");
const TODAY = "2026-08-10";

let work: string;
let merged: string;
let rows: Awaited<ReturnType<typeof loadGTFS<FeedFileName>>>;

const columns = <F extends FeedFileName>(file: F) => rows[file] ?? [];

/**
 * A directory of files as a zip, which is what the merge reads.
 */
function zipOf(directory: string, into: string): string {
  const entries: Record<string, Uint8Array> = {};

  for (const file of fs.readdirSync(directory).filter(f => f.endsWith(".txt"))) {
    entries[file] = strToU8(fs.readFileSync(path.join(directory, file), "utf8"));
  }

  fs.writeFileSync(into, zipSync(entries));

  return into;
}

beforeAll(async () => {
  work = fs.mkdtempSync(path.join(os.tmpdir(), "chain"));

  const railFeed = path.join(work, "rail");
  const busFeed = path.join(work, "bus");

  fs.mkdirSync(railFeed);

  await buildRail([
    "node", "cif2gtfs", "build",
    "--source", path.join(rail, "RJTTF001.ZIP"),
    "--out", railFeed,
    "--today", TODAY
  ]);

  await buildBus({
    inputs: [path.join(bus, "mini.xml")],
    output: busFeed,
    naptanFile: path.join(bus, "naptan.csv"),
    // The same day the rail feed is built for, so the two describe the same
    // window and neither depends on when the suite runs.
    from: TODAY,
    tmp: path.join(work, "buswork")
  });

  merged = path.join(work, "merged");

  await merge({
    inputs: [zipOf(railFeed, path.join(work, "rail.zip")), zipOf(busFeed, path.join(work, "bus.zip"))],
    output: merged,
    // No stop prefix. Both feeds identify a stop by its ATCO code, which is the
    // whole point: a national rail feed and a national bus feed already agree
    // about what a stop is called.
    filterDatesBefore: undefined,
    tmp: path.join(work, "mergework")
  });

  const entries: Record<string, Uint8Array> = {};

  for (const file of fs.readdirSync(merged).filter(f => f.endsWith(".txt"))) {
    entries[file] = strToU8(fs.readFileSync(path.join(merged, file), "utf8"));
  }

  rows = await loadGTFS(zipSync(entries), {raw: true});
}, 120_000);

describe("a rail feed and a bus feed merged", () => {

  it("keeps the trips of both", () => {
    expect(columns("trips.txt").length).to.be.greaterThan(100);
  });

  it("keeps both operators", () => {
    const agencies = columns("agency.txt").map(a => a.agency_id);

    // The bus operator from TransXChange, by its National Operator Code, and
    // the train operators from the DTD.
    expect(agencies).to.include("CHIL");
    expect(agencies.length).to.be.greaterThan(1);
  });

  it("keeps both modes", () => {
    const types = new Set(columns("routes.txt").map(r => r.route_type));

    expect(types).to.include(RouteType.Rail);
    expect(types).to.include(RouteType.Bus);
  });

  it("gives every trip a unique id across the two feeds", () => {
    const ids = columns("trips.txt").map(t => t.trip_id);

    // Both feeds number their trips from scratch, so this is the assertion the
    // merge's re-indexing exists to satisfy.
    expect(new Set(ids).size).to.equal(ids.length);
  });

  it("resolves every trip's route and service", () => {
    const routes = new Set(columns("routes.txt").map(r => r.route_id));
    const services = new Set(columns("calendar.txt").map(c => String(c.service_id)));

    for (const trip of columns("trips.txt")) {
      expect(routes.has(trip.route_id)).to.equal(true);
      expect(services.has(String(trip.service_id))).to.equal(true);
    }
  });

  it("resolves every stop time's trip and stop", () => {
    const trips = new Set(columns("trips.txt").map(t => t.trip_id));
    const stops = new Set(columns("stops.txt").map(s => s.stop_id));

    for (const stopTime of columns("stop_times.txt")) {
      expect(trips.has(stopTime.trip_id)).to.equal(true);
      expect(stops.has(stopTime.stop_id)).to.equal(true);
    }
  });

  it("resolves both ends of every transfer", () => {
    const stops = new Set(columns("stops.txt").map(s => s.stop_id));

    for (const transfer of columns("transfers.txt")) {
      expect(stops.has(transfer.from_stop_id)).to.equal(true);
      expect(stops.has(transfer.to_stop_id)).to.equal(true);
    }
  });

  it("keeps the rail feed's couplings, pointing at the renumbered trips", () => {
    const couplings = columns("transfers.txt")
      .filter(t => t.transfer_type === TransferType.InSeat);
    const trips = new Set(columns("trips.txt").map(t => t.trip_id));

    // A transfer_type 4 is a portion of a train that divides or joins. The DTD
    // mini fixture has them; nothing in the merge may leave one pointing at a
    // trip id from the feed it came out of.
    expect(couplings.length).to.be.greaterThan(0);

    for (const coupling of couplings) {
      expect(trips.has(coupling.from_trip_id!)).to.equal(true);
      expect(trips.has(coupling.to_trip_id!)).to.equal(true);
    }
  });

  it("publishes no stop that nothing calls at", () => {
    const called = new Set(columns("stop_times.txt").map(s => s.stop_id));
    const parents = new Set(columns("stops.txt").map(s => s.parent_station).filter(Boolean));

    for (const stop of columns("stops.txt")) {
      expect(called.has(stop.stop_id) || parents.has(stop.stop_id)).to.equal(true);
    }
  });

  it("walks a passenger from the train to the bus outside, with no stop prefix", () => {
    // Amersham is 910GAMERSHM in the rail feed and the bus stop outside it is
    // 0400AMSHM001 in the bus feed, a few metres apart. This
    // is the thing merging the two feeds is for, and it works because both
    // identify a stop by its ATCO code rather than by something each invented.
    // The rail call is at 9100AMERSHM, the platform, and the walk is to
    // 910GAMERSHM, the station above it: reaching the station reaches every
    // platform under it, so the walk is written once rather than once each.
    const walk = columns("transfers.txt").find(
      t => t.from_stop_id === "0400AMSHM001" && t.to_stop_id === "910GAMERSHM"
    );

    expect(walk).to.not.equal(undefined);
    expect(walk!.transfer_type).to.equal(TransferType.MinTime);
    // A few metres, so the floor of sixty seconds applies.
    expect(walk!.min_transfer_time).to.equal(60);

    const back = columns("transfers.txt").find(
      t => t.from_stop_id === "910GAMERSHM" && t.to_stop_id === "0400AMSHM001"
    );

    expect(back).to.not.equal(undefined);
  });

  it("keeps a headsign that names more than one destination", () => {
    const headsigns = columns("trips.txt").map(t => t.trip_headsign);

    // Quoted in the file, through the writer of one tool and the reader of
    // another and out of the writer again. The rail feed puts a multi
    // destination headsign on the call rather than the trip, so this looks at
    // stop_times.txt.
    const stopHeadsigns = columns("stop_times.txt").map(s => s.stop_headsign);

    expect(headsigns.length).to.be.greaterThan(0);
    expect(stopHeadsigns.some(h => h?.includes(","))).to.equal(true);
  });

});
