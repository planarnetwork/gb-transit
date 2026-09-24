import {describe, it, expect, beforeEach, afterEach} from "vitest";
import {Temporal} from "temporal-polyfill";
import {interchange} from "@gb-transit/gtfs";
import AdmZip from "adm-zip";
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import {CifFileSource} from "./CifFileSource";

/**
 * A feed small enough to reason about, built the way the real one is laid out.
 *
 * A slice of a real feed is what will cover the pathological records. This
 * covers the mapping: that each field lands where the SQL puts it, that the
 * records combine the way the importer combines them, and that a second zip
 * revises the first.
 */
function at(...fields: [number, string][]): string {
  let line = "";

  for (const [position, value] of fields) {
    line = line.padEnd(position, " ") + value;
  }

  return line.padEnd(80, " ");
}

const station = (name: string, tiploc: string, crs: string, easting: number, northing: number) =>
  at([0, "A"], [5, name], [35, "5"], [36, tiploc], [43, crs], [49, crs],
     [52, String(easting)], [58, String(northing)], [63, " 5"]);

const tiploc = (code: string, crs: string) =>
  at([0, "TI"], [2, code], [9, "AA"], [11, "123456"], [17, "7"], [18, code], [44, "12345"],
     [49, "1234"], [53, crs], [56, code]);

/**
 * A BS record. `course_indicator` is not nullable, so it has to hold something.
 */
const schedule = (uid: string, from: string, to: string, days: string, stp: string, action = "N", category = "OO") =>
  at([0, "BS"], [2, action], [3, uid], [9, from], [15, to], [21, days], [28, " "],
     [29, "P"], [30, category], [40, "1"], [66, "B"], [79, stp]);

const extra = (atoc: string, rsid: string) =>
  at([0, "BX"], [11, atoc], [13, "P"], [14, rsid]);

const origin = (location: string, departure: string) =>
  at([0, "LO"], [2, location], [10, departure], [15, departure.slice(0, 4)], [19, "1"], [29, "TB"]);

const intermediate = (location: string, arrival: string, departure: string) =>
  at([0, "LI"], [2, location], [10, arrival], [15, departure], [25, arrival.slice(0, 4)],
     [29, departure.slice(0, 4)], [33, "2"], [42, "T "]);

const terminus = (location: string, arrival: string) =>
  at([0, "LT"], [2, location], [10, arrival], [15, arrival.slice(0, 4)], [19, "3"], [25, "TF"]);

const association = (base: string, assoc: string, from: string, to: string, location: string, stp: string) =>
  at([0, "AA"], [2, "N"], [3, base], [9, assoc], [15, from], [21, to], [27, "1111100"],
     [34, "VV"], [36, "S"], [37, location], [44, " "], [45, " "], [47, "P"], [79, stp]);

let directory: string;

function zip(name: string, files: {[extension: string]: string[]}): string {
  const archive = new AdmZip();

  for (const [extension, lines] of Object.entries(files)) {
    archive.addFile(`${name}.${extension}`, Buffer.from(lines.join("\n") + "\n"));
  }

  const file = path.join(directory, `${name}.ZIP`);
  archive.writeZip(file);

  return file;
}

const range = {
  from: Temporal.PlainDate.from("2024-01-01"),
  to: Temporal.PlainDate.from("2024-04-01")
};

const MSN = [
  "/!! Start of file",
  // 558,600 east and 146,200 north, which is Tonbridge. It read 15862, putting
  // the station 28km away near Ashford, and nothing minded until an override
  // that disagrees with the feed by that much stopped being taken.
  station("TONBRIDGE", "TONBDG", "TON", 15586, 61462),
  station("SEVENOAKS", "SEVNOKS", "SEV", 15525, 61550),
  station("HILDENBOROUGH", "HLDNBRO", "HLD", 15558, 61478)
];

const refresh = () => zip("RJTTF001", {
  MSN,
  MCA: [
    tiploc("TONBDG", "TON"),
    tiploc("SEVNOKS", "SEV"),
    schedule("C00001", "240101", "240401", "1111100", "P"),
    extra("SE", "SE000100"),
    origin("TONBDG ", "0800 "),
    terminus("SEVNOKS", "0820 ")
  ],
  ALF: ["M=WALK,O=TON,D=SEV,T=25,S=0001,E=2359,P=6,R=1111111"],
  FLF: ["ADDITIONAL LINK: BUS BETWEEN TON AND HLD IN   9 MINUTES", "END"],
  ZTR: [
    schedule("Z00001", "240101", "240401", "1111100", "P", "N", "BR"),
    extra("ZZ", ""),
    origin("TON", "0900 "),
    terminus("SEV", "0930 ")
  ]
});

const source = (...sources: string[]) => new CifFileSource(sources, {}, range);

beforeEach(() => directory = fs.mkdtempSync(path.join(os.tmpdir(), "cifsrc")));
afterEach(() => fs.rmSync(directory, {recursive: true, force: true}));

describe("CifFileSource", () => {

  it("reads the stations, one per CRS, in CRS order", async () => {
    const stops = await source(refresh()).getStops();

    expect(stops.map(s => [s.stop_id, s.crs, s.tiploc, s.stop_name]))
      .to.deep.equal([
        ["910GHLDNBRO", "HLD", "HLDNBRO", "HILDENBOROUGH"],
        ["910GSEVNOKS", "SEV", "SEVNOKS", "SEVENOAKS"],
        ["910GTONBDG", "TON", "TONBDG", "TONBRIDGE"]
      ]);
  });

  it("projects the coordinates out of the eastings and northings", async () => {
    const [, sevenoaks] = await source(refresh()).getStops();

    expect(sevenoaks.stop_lat).to.be.closeTo(51.27, 0.5);
    expect(sevenoaks.stop_lon).to.be.closeTo(0.18, 0.5);
  });

  it("lets an override replace what the feed says", async () => {
    const overridden = new CifFileSource([refresh()], {
      TON: {stop_name: "Tonbridge", stop_lat: 51.1926, stop_lon: 0.2661, wheelchair_boarding: 1}
    }, range);

    const tonbridge = (await overridden.getStops()).find(s => s.crs === "TON")!;

    expect(tonbridge.stop_name).to.equal("Tonbridge");
    expect(tonbridge.stop_lat).to.equal(51.1926);
    expect(tonbridge.wheelchair_boarding).to.equal(1);
  });

  it("turns the interchange time into a transfer", async () => {
    const transfers = await source(refresh()).getTransfers();

    // The fixed link columns are null on an interchange row: there is no link to
    // describe, only the time it takes to cross the station.
    expect(transfers).to.deep.include(interchange("TON", 300));
  });

  /**
   * Reading's junction is listed before the station and rated 9. The database build ranks the station
   * first, so the file build has to as well, or the two publish different change times.
   */
  it("takes the transfer time from the station rather than the junction sharing its code", async () => {
    const reading = zip("RJTTF001", {
      MSN: [
        at([0, "A"], [5, "READING ORR JN"], [35, "9"], [36, "RDNGORJ"], [43, "RDG"], [49, "RDG"], [63, " 3"]),
        at([0, "A"], [5, "READING"], [35, "2"], [36, "RDNGSTN"], [43, "RDG"], [49, "RDG"], [63, "10"])
      ],
      MCA: []
    });

    expect(await source(reading).getTransfers()).to.deep.equal([interchange("RDG", 600)]);
  });

  it("emits a fixed link in both directions, in minutes converted to seconds", async () => {
    const links = await source(refresh()).getFixedLinks();
    const walk = links.filter(l => l.mode === "WALK");

    expect(walk.map(l => [l.from_stop_id, l.to_stop_id, l.duration]))
      .to.deep.equal([["TON", "SEV", 1500], ["SEV", "TON", 1500]]);
  });

  it("falls back to the FLF link for a pair ALF does not cover", async () => {
    const links = await source(refresh()).getFixedLinks();
    const bus = links.find(l => l.mode === "BUS")!;

    expect([bus.from_stop_id, bus.to_stop_id, bus.duration, bus.start_time, bus.end_time])
      .to.deep.equal(["TON", "HLD", 540, "00:00:00", "23:59:59"]);
  });

  it("builds a schedule with its stops, times and operator", async () => {
    const {schedules} = await source(refresh()).getSchedules();
    const [train] = schedules.filter(s => s.tuid === "C00001");

    expect(train.operator).to.equal("SE");
    expect(train.rsid).to.equal("SE000100");
    // The station, not the platform. The platform rides alongside and only
    // becomes part of the stop id when stop_times.txt is written.
    expect(train.stopTimes.map(s => [s.stop_id, s.platform, s.arrival_time, s.stop_sequence]))
      .to.deep.equal([
        ["TON", "1", "08:00:00", 1],
        ["SEV", "3", "08:20:00", 2]
      ]);
  });

  it("drops a stop at a location that is not a station", async () => {
    const feed = zip("RJTTF001", {
      MSN,
      MCA: [
        schedule("C00001", "240101", "240401", "1111100", "P"),
        origin("TONBDG ", "0800 "),
        intermediate("NOWHERE", "0810 ", "0811 "),
        terminus("SEVNOKS", "0820 ")
      ]
    });

    const {schedules} = await source(feed).getSchedules();

    expect(schedules[0].stopTimes.map(s => s.stop_id)).to.deep.equal(["TON", "SEV"]);
  });

  it("leaves out a schedule that does not run in the window", async () => {
    const feed = zip("RJTTF001", {
      MSN,
      MCA: [
        schedule("C00001", "240101", "240401", "1111100", "P"),
        origin("TONBDG ", "0800 "),
        terminus("SEVNOKS", "0820 "),
        schedule("C00002", "250101", "250401", "1111100", "P"),
        origin("TONBDG ", "0900 "),
        terminus("SEVNOKS", "0920 ")
      ]
    });

    const {schedules} = await source(feed).getSchedules();

    expect(schedules.map(s => s.tuid)).to.deep.equal(["C00001"]);
  });

  it("orders the schedules so an overlay follows the permanent it overlays", async () => {
    const feed = zip("RJTTF001", {
      MSN,
      MCA: [
        schedule("C00001", "240201", "240301", "1111100", "O"),
        origin("TONBDG ", "0805 "),
        terminus("SEVNOKS", "0825 "),
        schedule("C00001", "240101", "240401", "1111100", "P"),
        origin("TONBDG ", "0800 "),
        terminus("SEVNOKS", "0820 ")
      ]
    });

    const {schedules} = await source(feed).getSchedules();

    expect(schedules.map(s => s.stp)).to.deep.equal(["P", "O"]);
  });

  it("reads a z-train, whose location is already a CRS code", async () => {
    const {schedules} = await source(refresh()).getSchedules();
    const [bus] = schedules.filter(s => s.tuid === "Z00001");

    expect(bus.stopTimes.map(s => s.stop_id)).to.deep.equal(["TON", "SEV"]);
    expect(bus.operator).to.equal("ZZ");
  });

  /**
   * `offsetId` rebuilds every z-train to move its id clear of the passenger schedules, and it did
   * that by listing nine of a schedule's ten fields - so the path went. Nothing caught it: the
   * argument is optional, and a z-train with no path draws its shape from its calls, which is the
   * same list until a ZTR carries a pass time.
   */
  it("keeps the z-train's path when it moves its id", async () => {
    const {schedules} = await source(refresh()).getSchedules();
    const [bus] = schedules.filter(s => s.tuid === "Z00001");

    expect(bus.path).to.deep.equal(["TON", "SEV"]);
  });

  it("keeps the z-train ids clear of the passenger schedule ids", async () => {
    const {schedules} = await source(refresh()).getSchedules();
    const ids = new Set(schedules.map(s => s.id));

    expect(ids.size).to.equal(schedules.length);
  });

  it("reads an association at a location the feed describes", async () => {
    const feed = zip("RJTTF001", {
      MSN,
      MCA: [
        tiploc("TONBDG", "TON"),
        association("C00001", "C00002", "240101", "240401", "TONBDG ", "P")
      ]
    });

    const associations = await source(feed).getAssociations();

    expect(associations.length).to.equal(1);
    expect(associations[0].assocLocation).to.equal("TON");
  });

  it("orders the associations so an overlay follows the permanent it overlays", async () => {
    const feed = zip("RJTTF001", {
      MSN,
      MCA: [
        tiploc("TONBDG", "TON"),
        association("C00001", "C00002", "240201", "240301", "TONBDG ", "O"),
        association("C00001", "C00002", "240101", "240401", "TONBDG ", "P")
      ]
    });

    // The database returns them ORDER BY stp_indicator DESC, id, and applyOverlays takes each record
    // as an overlay of the ones before it - so a source handing them over in file order would
    // resolve the overlay against nothing and leave both. It is also what decides which association
    // claims a day two of them cover, so the two sources have to agree on it.
    expect((await source(feed).getAssociations()).map(a => a.stp)).to.deep.equal(["P", "O"]);
  });

  it("drops an association at a location the feed never described", async () => {
    const feed = zip("RJTTF001", {
      MSN,
      MCA: [association("C00001", "C00002", "240101", "240401", "NOWHERE", "P")]
    });

    expect(await source(feed).getAssociations()).to.deep.equal([]);
  });

  it("lets an incremental revise a schedule from the refresh", async () => {
    const incremental = zip("RJTTC002", {
      MSN,
      CFA: [
        schedule("C00001", "240101", "240401", "1111100", "P", "R"),
        extra("SE", "SE000100"),
        origin("TONBDG ", "0830 "),
        terminus("SEVNOKS", "0850 ")
      ]
    });

    const {schedules} = await source(refresh(), incremental).getSchedules();
    const [train] = schedules.filter(s => s.tuid === "C00001");

    expect(train.stopTimes[0].departure_time).to.equal("08:30:00");
  });

  it("lets an incremental delete a schedule from the refresh", async () => {
    const incremental = zip("RJTTC002", {
      MSN,
      CFA: [schedule("C00001", "240101", "240401", "1111100", "P", "D")]
    });

    const {schedules} = await source(refresh(), incremental).getSchedules();

    expect(schedules.filter(s => s.tuid === "C00001")).to.deep.equal([]);
  });

  it("keeps the first record when a later one repeats its key", async () => {
    const again = zip("RJTTC002", {
      MSN,
      CFA: [
        schedule("C00001", "240101", "240401", "1111100", "P"),
        origin("TONBDG ", "0955 "),
        terminus("SEVNOKS", "0959 ")
      ]
    });

    const {schedules} = await source(refresh(), again).getSchedules();
    const [train] = schedules.filter(s => s.tuid === "C00001");

    expect(train.stopTimes[0].departure_time).to.equal("08:00:00");
  });

  it("does not triple the links when the same ALF arrives three times", async () => {
    const source3 = source(refresh(), zip("RJTTC002", {MSN, ALF: [
      "M=WALK,O=TON,D=SEV,T=25,S=0001,E=2359,P=6,R=1111111"
    ]}));

    expect((await source3.getFixedLinks()).filter(l => l.mode === "WALK").length).to.equal(2);
  });

  it("names the file and the line when a record cannot be parsed", async () => {
    const feed = zip("RJTTF001", {
      MSN,
      // course_indicator is not nullable, so a blank one is a parse error
      MCA: [at([0, "BS"], [2, "N"], [3, "C00001"], [9, "240101"], [15, "240401"], [21, "1111100"], [79, "P"])]
    });

    await expect(source(feed).getSchedules()).rejects.toThrow(/RJTTF001\.MCA line 1/);
  });

});
