import {describe, it, expect} from "vitest";
import {zipSync, strToU8} from "fflate";
import {readFeed, readFeedRows} from "./ReadFeed.js";
import {feedFileOf} from "./FeedFile.js";

function feed(files: Record<string, string>): Uint8Array {
  const entries: Record<string, Uint8Array> = {};

  for (const [name, text] of Object.entries(files)) {
    entries[name] = strToU8(text);
  }

  return zipSync(entries);
}

describe("feedFileOf", () => {

  it("finds a file at the root of the zip", () => {
    expect(feedFileOf("stops.txt")).to.equal("stops.txt");
  });

  it("finds a file nested in a directory", () => {
    expect(feedFileOf("feed/gtfs/stops.txt")).to.equal("stops.txt");
  });

  it("ignores a directory entry and a macOS shadow copy", () => {
    expect(feedFileOf("feed/")).to.equal(undefined);
    expect(feedFileOf("__MACOSX/stops.txt")).to.equal(undefined);
  });

  it("ignores a file it does not read", () => {
    expect(feedFileOf("fare_rules.txt")).to.equal(undefined);
  });

});

describe("readFeed", () => {

  it("reads the rows of a file", async () => {
    const rows = await readFeedRows(feed({
      "stops.txt": "stop_id,stop_name,stop_lat,stop_lon\n910GCLPHMJC,Clapham Junction,51.46425,-0.17036\n"
    }), ["stops.txt"]);

    expect(rows["stops.txt"]).to.deep.equal([{
      stop_id: "910GCLPHMJC",
      stop_code: undefined,
      stop_name: "Clapham Junction",
      stop_desc: undefined,
      zone_id: undefined,
      stop_url: undefined,
      location_type: undefined,
      parent_station: undefined,
      platform_code: undefined,
      stop_timezone: undefined,
      wheelchair_boarding: undefined,
      stop_lon: "-0.17036",
      stop_lat: "51.46425"
    }]);
  });

  it("reads a quoted field containing a comma", async () => {
    const rows = await readFeedRows(feed({
      "trips.txt": "route_id,trip_id,trip_headsign\nr1,t1,\"Inverness, Aberdeen and Fort William\"\n"
    }), ["trips.txt"]);

    expect(rows["trips.txt"][0].trip_headsign).to.equal("Inverness, Aberdeen and Fort William");
  });

  it("reads a quoted field containing a doubled quote", async () => {
    const rows = await readFeedRows(feed({
      "stops.txt": "stop_id,stop_name\ns1,\"The \"\"Bull\"\" Inn\"\n"
    }), ["stops.txt"]);

    expect(rows["stops.txt"][0].stop_name).to.equal("The \"Bull\" Inn");
  });

  it("reads the numeric columns as numbers and leaves the rest as text", async () => {
    const rows = await readFeedRows(feed({
      "stop_times.txt":
        "trip_id,arrival_time,departure_time,stop_id,stop_sequence,pickup_type,drop_off_type,timepoint\n" +
        "t1,10:00:00,10:01:00,s1,1,0,1,1\n"
    }), ["stop_times.txt"]);

    const row = rows["stop_times.txt"][0];

    expect(row.stop_sequence).to.equal(1);
    expect(row.pickup_type).to.equal(0);
    expect(row.arrival_time).to.equal("10:00:00");
  });

  it("leaves an empty field undefined rather than making it zero or empty text", async () => {
    const rows = await readFeedRows(feed({
      "transfers.txt": "from_stop_id,to_stop_id,transfer_type,min_transfer_time\na,b,2,\n"
    }), ["transfers.txt"]);

    // The writer writes null and undefined identically, so an absent value has
    // to read back absent for the round trip to hold.
    expect(rows["transfers.txt"][0].min_transfer_time).to.equal(undefined);
  });

  it("ignores a column the schema does not know", async () => {
    const rows = await readFeedRows(feed({
      "agency.txt": "agency_id,agency_name,something_else\na1,Agency,ignored\n"
    }), ["agency.txt"]);

    expect(Object.keys(rows["agency.txt"][0])).to.not.include("something_else");
  });

  it("reads a column the schema does not know when asked for it, as the text the file held", async () => {
    const rows: Record<string, unknown>[] = [];

    await readFeed(feed({
      "agency.txt": "agency_id,agency_name,something_else\na1,Agency,42\n"
    }), {"agency.txt": row => rows.push({...row})}, {extraColumns: {"agency.txt": ["something_else"]}});

    expect(rows[0].agency_id).to.equal("a1");
    expect(rows[0].something_else).to.equal("42");
  });

  it("does not inflate a file with no handler", async () => {
    const seen: string[] = [];

    await readFeed(feed({
      "stops.txt": "stop_id\ns1\n",
      "trips.txt": "trip_id\nt1\n"
    }), {"stops.txt": () => seen.push("stop")});

    expect(seen).to.deep.equal(["stop"]);
  });

  it("reports a file the caller wanted that the feed does not have", async () => {
    const missing: string[] = [];

    await readFeed(
      feed({"stops.txt": "stop_id\ns1\n"}),
      {"stops.txt": () => {}, "shapes.txt": () => {}},
      {onMissing: file => missing.push(file)}
    );

    expect(missing).to.deep.equal(["shapes.txt"]);
  });

  it("reads links.txt, which this repository writes and nothing else does", async () => {
    const rows = await readFeedRows(feed({
      "links.txt":
        "from_stop_id,to_stop_id,mode,duration,start_time,end_time,start_date,end_date," +
        "monday,tuesday,wednesday,thursday,friday,saturday,sunday\n" +
        "TBW,TON,WALK,600,00:00:00,23:59:00,20260101,20261231,1,1,1,1,1,0,0\n"
    }), ["links.txt"]);

    expect(rows["links.txt"][0].duration).to.equal(600);
    expect(rows["links.txt"][0].saturday).to.equal(0);
  });

});
