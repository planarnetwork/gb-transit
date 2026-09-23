import {describe, it, expect, beforeAll} from "vitest";
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import {zipSync, strToU8} from "fflate";
import {loadGTFS, readFeed, FeedFileName} from "@gb-transit/gtfs-loader";
import {TransferType} from "@gb-transit/gtfs-schema";
import {merge} from "../src/api.js";

/**
 * The merge, end to end, over two feeds small enough to read.
 *
 * `fixtures/tiny` is two hand-written feeds covering the edges that merging two
 * real feeds does not reach - see its README for what each row is for - and
 * `fixtures/tiny/golden` is what they merge to. The golden is committed as text
 * so a change in behaviour arrives as a readable diff in review.
 *
 * To take a change: `UPDATE_GOLDEN=1 yarn vitest run` and read the diff before
 * committing it.
 */
const fixtures = path.join(import.meta.dirname, "..", "fixtures", "tiny");
const golden = path.join(fixtures, "golden");
const TODAY = "20260601";

let built: string;
/** The two fixtures as zips, kept so a second merge does not rebuild them into the output. */
let inputs: string[];
let rows: Awaited<ReturnType<typeof loadGTFS<FeedFileName>>>;

const columns = <F extends FeedFileName>(file: F) => rows[file] ?? [];

/**
 * A fixture directory as a zip, which is what the merge reads.
 */
function zipOf(directory: string): string {
  const entries: Record<string, Uint8Array> = {};

  for (const file of fs.readdirSync(directory).filter(f => f.endsWith(".txt"))) {
    entries[file] = strToU8(fs.readFileSync(path.join(directory, file), "utf8"));
  }

  const out = path.join(built, `${path.basename(directory)}.zip`);

  fs.writeFileSync(out, zipSync(entries));

  return out;
}

beforeAll(async () => {
  built = fs.mkdtempSync(path.join(os.tmpdir(), "gtfsmerge"));

  const output = path.join(built, "merged");

  inputs = [zipOf(path.join(fixtures, "a")), zipOf(path.join(fixtures, "b"))];

  await merge({
    inputs,
    output,
    filterDatesBefore: TODAY,
    tmp: path.join(built, "work")
  });

  if (process.env.UPDATE_GOLDEN) {
    fs.rmSync(golden, {recursive: true, force: true});
    fs.mkdirSync(golden, {recursive: true});

    for (const file of fs.readdirSync(output)) {
      fs.copyFileSync(path.join(output, file), path.join(golden, file));
    }
  }

  built = output;

  const entries: Record<string, Uint8Array> = {};

  for (const file of fs.readdirSync(output).filter(f => f.endsWith(".txt"))) {
    entries[file] = strToU8(fs.readFileSync(path.join(output, file), "utf8"));
  }

  rows = await loadGTFS(zipSync(entries), {raw: true});
}, 60_000);

describe("without shapes", () => {

  let withoutShapes: string;
  let rows: Awaited<ReturnType<typeof loadGTFS<FeedFileName>>>;

  beforeAll(async () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "gtfsmerge-noshapes"));

    withoutShapes = path.join(dir, "merged");

    await merge({
      inputs,
      output: withoutShapes,
      filterDatesBefore: TODAY,
      shapes: false,
      tmp: path.join(dir, "work")
    });

    const entries: Record<string, Uint8Array> = {};

    for (const file of fs.readdirSync(withoutShapes).filter(f => f.endsWith(".txt"))) {
      entries[file] = strToU8(fs.readFileSync(path.join(withoutShapes, file), "utf8"));
    }

    rows = await loadGTFS(zipSync(entries), {raw: true});
  }, 60_000);

  it("writes no shapes.txt at all, rather than an empty one", () => {
    expect(fs.existsSync(path.join(withoutShapes, "shapes.txt"))).to.equal(false);
  });

  /**
   * The column would name a shape that is not in the feed, which is a dangling
   * reference rather than a missing extra.
   */
  it("writes no shape_id column", () => {
    const header = fs.readFileSync(path.join(withoutShapes, "trips.txt"), "utf8").split("\n")[0];

    expect(header).to.not.include("shape_id");
    expect(header).to.include("block_id");
  });

  it("carries everything else", () => {
    expect(fs.readdirSync(withoutShapes).sort()).to.deep.equal(
      fs.readdirSync(golden).filter(f => f !== "shapes.txt").sort()
    );
    expect((rows["trips.txt"] ?? []).length).to.be.greaterThan(0);
  });

});

describe("the tiny fixtures", () => {

  const files = fs.readdirSync(golden).sort();

  /**
   * Listed from the golden rather than spelled out here, so a file the merge
   * starts or stops writing is a diff rather than a test nobody updated.
   */
  it("produces exactly the golden files", () => {
    expect(fs.readdirSync(built).sort()).to.deep.equal(files);
  });

  it.each(files)("produces the golden %s", file => {
    expect(fs.readFileSync(path.join(built, file), "utf8"))
      .to.equal(fs.readFileSync(path.join(golden, file), "utf8"));
  });

});

describe("the merged feed", () => {

  /**
   * A block is one vehicle working through a day and both feeds call theirs `1`,
   * which is two vehicles rather than one continuing from a train to a bus.
   */
  it("keeps two feeds' blocks apart", () => {
    const blocks = columns("trips.txt").map(t => t.block_id).filter(Boolean);

    expect(new Set(blocks).size).to.equal(2);
  });

  it("draws a trip along the shape its points were renumbered onto", () => {
    const trip = columns("trips.txt").find(t => t.trip_headsign === "Town Centre");
    const points = columns("shapes.txt").filter(s => s.shape_id === trip?.shape_id);

    expect(points.length).to.equal(2);
  });

  it("drops a shape no surviving trip is drawn along", () => {
    // SHP2 belongs to a trip the date filter dropped and SHP3 to no trip at all.
    expect(new Set(columns("shapes.txt").map(s => s.shape_id)).size).to.equal(1);
  });

  it("points a frequency at its trip's new id", () => {
    const trip = columns("trips.txt").find(t => t.trip_headsign === "Town Centre");

    expect(columns("frequencies.txt").map(f => f.trip_id)).to.deep.equal([trip?.trip_id]);
  });

  /**
   * A stop is published if anything in the merged feed calls at it, which is not
   * known until every feed has been read.
   */
  it("keeps a membership naming a stop only the other feed calls at", () => {
    const published = new Set(columns("stops.txt").map(s => s.stop_id));
    const members = columns("stop_areas.txt").filter(a => a.area_id === "1072");

    expect(published.has("9100BUSSTOP")).to.equal(true);
    expect(members.map(a => a.stop_id)).to.include("9100BUSSTOP");
  });

  /**
   * A code on stops from more than one station names none of them. Feed b's bus
   * station carries `ALP`, which feed a's Alpha already uses, and neither is
   * under the other.
   */
  it("clears a stop code that more than one station uses", () => {
    const stops = new Map(columns("stops.txt").map(s => [s.stop_id, s]));

    expect(stops.get("9100BUSSTOP")?.stop_code ?? null).to.equal(null);
    expect(stops.get("910GALPHA")?.stop_code ?? null).to.equal(null);
  });

  /**
   * A station and its platforms are one station, so the code they share still
   * says which stop a rider means.
   */
  it("keeps a stop code a station shares with its own platform", () => {
    const stops = new Map(columns("stops.txt").map(s => [s.stop_id, s]));

    expect(stops.get("910GBETA")?.stop_code).to.equal("BET");
    expect(stops.get("9100BETA1")?.stop_code).to.equal("BET");
  });

  it("keeps both agencies", () => {
    expect(columns("agency.txt").map(a => a.agency_id).sort()).to.deep.equal(["BUS", "RAIL"]);
  });

  it("keeps both modes", () => {
    const types = new Set(columns("routes.txt").map(r => r.route_type));

    expect(types).to.include(2);
    expect(types).to.include(3);
  });

  it("has one row for a stop both feeds describe", () => {
    const alpha = columns("stops.txt").filter(s => s.stop_id === "910GALPHA");

    // Both feeds serve Alpha. This is why a GB rail feed and a GB bus feed can
    // be merged without reconciling anything: they already agree on ATCO codes.
    expect(alpha.length).to.equal(1);
  });

  it("gives every trip a unique id", () => {
    const ids = columns("trips.txt").map(t => t.trip_id);

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

  /**
   * A stop is published if something calls at it, or if it is the station above
   * one that does - a station nothing stops at is still where its platforms are.
   */
  it("publishes a stop something calls at, or the station above one", () => {
    const called = new Set(columns("stop_times.txt").map(s => s.stop_id));
    const parents = new Set(columns("stops.txt").map(s => s.parent_station).filter(Boolean));

    for (const stop of columns("stops.txt")) {
      expect(called.has(stop.stop_id) || parents.has(stop.stop_id)).to.equal(true);
    }
  });

  /**
   * Which platform the train leaves from and which stand the bus goes from are
   * what the feeds said, and the station is how a rider knows they are one place.
   */
  it("keeps the platform, the stand and the station above them both", () => {
    const stops = new Map(columns("stops.txt").map(s => [s.stop_id, s]));

    expect(stops.get("9100ALPHA1")?.parent_station).to.equal("910GALPHA");
    expect(stops.get("9100ALPHABUS")?.parent_station).to.equal("910GALPHA");
    expect(Number(stops.get("910GALPHA")?.location_type)).to.equal(1);
    expect(new Set(columns("stop_times.txt").map(s => s.stop_id)).has("910GALPHA"))
      .to.equal(false);
  });

  /**
   * A platform's interchange is its station's. Generating from the platforms too
   * would write one walk once per platform and offer it as several journeys.
   */
  it("generates no walk to or from a platform", () => {
    const platforms = new Set(
      columns("stops.txt").filter(s => s.parent_station).map(s => s.stop_id)
    );
    const generated = columns("transfers.txt").filter(t => t.min_transfer_time !== null);

    for (const transfer of generated) {
      expect(platforms.has(transfer.from_stop_id)).to.equal(false);
      expect(platforms.has(transfer.to_stop_id)).to.equal(false);
    }

    expect(platforms.size).to.be.greaterThan(0);
  });

  it("collapses the three identical calendars onto one service", () => {
    // SA1, SA2 and SB1 all run Monday to Friday over the same dates.
    const running = columns("calendar.txt").filter(c => c.start_date === "20260101");

    expect(running.length).to.equal(1);
  });

  it("synthesises a calendar for the dates that had none", () => {
    expect(columns("calendar_dates.txt").length).to.be.greaterThan(0);

    const services = new Set(columns("calendar.txt").map(c => String(c.service_id)));

    for (const date of columns("calendar_dates.txt")) {
      expect(services.has(String(date.service_id))).to.equal(true);
    }
  });

  it("drops a service that has already finished", () => {
    for (const calendar of columns("calendar.txt")) {
      expect(calendar.end_date! >= TODAY).to.equal(true);
    }
  });

  it("keeps the coupling, pointing at the renumbered trips", () => {
    const couplings = columns("transfers.txt")
      .filter(t => t.transfer_type === TransferType.InSeat);
    const trips = new Set(columns("trips.txt").map(t => t.trip_id));

    expect(couplings.length).to.equal(1);
    expect(trips.has(couplings[0].from_trip_id!)).to.equal(true);
    expect(trips.has(couplings[0].to_trip_id!)).to.equal(true);
  });

  it("generates a walk transfer between the bus station and the rail station", () => {
    // About 200m apart. This is the reason to merge the two feeds at all, and it
    // is between the stations: a walk to Alpha reaches every platform under it.
    const walk = columns("transfers.txt").find(
      t => t.from_stop_id === "9100BUSSTOP" && t.to_stop_id === "910GALPHA"
    );

    expect(walk).to.not.equal(undefined);
    expect(walk!.transfer_type).to.equal(TransferType.MinTime);
    expect(walk!.min_transfer_time).to.be.greaterThan(60);
  });

  it("keeps a name containing a quote and a headsign containing a comma", () => {
    const beta = columns("stops.txt").find(s => s.stop_id === "910GBETA");
    const headsigns = columns("trips.txt").map(t => t.trip_headsign);

    expect(beta!.stop_name).to.equal("The \"Bull\" Inn");
    expect(headsigns).to.include("Inverness, Aberdeen and Fort William");
  });

  it("writes the platform_code column a rail feed uses", () => {
    // gtfsmerge did not write this column before. Dropping it would throw away
    // how the rail feed says which platform a boarding point is.
    // gtfsmerge did not write this column at all before. The rail feed says
    // which platform a boarding point is in it, and a merge that dropped the
    // column would throw that away. The published stops here are all stations,
    // so the column is present and empty.
    const header = fs.readFileSync(path.join(built, "stops.txt"), "utf8").split("\n")[0];

    expect(header.split(",")).to.include("platform_code");
  });

});

describe("columns a feed carries that the merge does not declare", () => {

  let merged: string;

  /**
   * Fixture a with the rail feed's fixed link columns on its transfers, a route
   * a transfer is scoped to, and a column on its trips that no schema here has
   * heard of.
   */
  beforeAll(async () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "gtfsmerge-extra"));
    const extended = path.join(dir, "a");

    fs.cpSync(path.join(fixtures, "a"), extended, {recursive: true});
    fs.writeFileSync(path.join(extended, "transfers.txt"),
      "from_stop_id,to_stop_id,from_trip_id,to_trip_id,transfer_type,min_transfer_time,from_route_id,mode,start_time\n" +
      "910GBETA,910GBETA,TA1,TA2,4,,,,\n" +
      "910GALPHA,910GALPHA,,,2,300,RA1,WALK,06:00:00\n");

    const trips = fs.readFileSync(path.join(extended, "trips.txt"), "utf8").trimEnd().split("\n");

    fs.writeFileSync(path.join(extended, "trips.txt"),
      [`${trips[0]},vehicle_note`, ...trips.slice(1).map((row, i) => `${row},note ${i}`)].join("\n") + "\n");

    const extendedZip = path.join(dir, "a.zip");
    const entries: Record<string, Uint8Array> = {};

    for (const file of fs.readdirSync(extended).filter(f => f.endsWith(".txt"))) {
      entries[file] = strToU8(fs.readFileSync(path.join(extended, file), "utf8"));
    }

    fs.writeFileSync(extendedZip, zipSync(entries));

    merged = path.join(dir, "merged");

    await merge({
      inputs: [extendedZip, inputs[1]],
      output: merged,
      filterDatesBefore: TODAY,
      tmp: path.join(dir, "work")
    });
  }, 60_000);

  const header = (file: string) => fs.readFileSync(path.join(merged, file), "utf8").split("\n")[0].split(",");

  /** The rows of a merged file, read as a consumer would, with the extra columns asked for. */
  async function rowsOf(file: FeedFileName, extra: string[]): Promise<Record<string, unknown>[]> {
    const rows: Record<string, unknown>[] = [];
    const zip = zipSync({[file]: strToU8(fs.readFileSync(path.join(merged, file), "utf8"))});

    await readFeed(zip, {[file]: (row: object) => rows.push({...row})}, {extraColumns: {[file]: extra}});

    return rows;
  }

  it("writes a column the schema knows but the merge does not declare, after its own", async () => {
    expect(header("transfers.txt").slice(-2)).to.deep.equal(["mode", "start_time"]);
    expect((await rowsOf("transfers.txt", [])).find(t => t.mode === "WALK")?.start_time).to.equal("06:00:00");
  });

  it("does not pass through a route id the merge has renumbered", () => {
    expect(header("transfers.txt")).to.not.include("from_route_id");
  });

  it("writes a column nobody here has heard of, as the feed wrote it", async () => {
    const trips = await rowsOf("trips.txt", ["vehicle_note"]);

    expect(header("trips.txt").at(-1)).to.equal("vehicle_note");
    expect(trips.find(t => t.trip_headsign === "Inverness, Aberdeen and Fort William")?.vehicle_note).to.equal("note 0");
  });

  it("leaves the column empty in the rows of the feed that does not have it", async () => {
    const fromB = (await rowsOf("trips.txt", ["vehicle_note"])).filter(t => t.trip_headsign === "Town Centre");

    expect(fromB.length).to.be.greaterThan(0);
    expect(fromB.every(t => t.vehicle_note === undefined)).to.equal(true);
  });

});
