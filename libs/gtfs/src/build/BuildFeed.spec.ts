import {describe, it, expect} from "vitest";
import {Temporal} from "temporal-polyfill";
import {BuildFeed} from "./BuildFeed";
import {BuildContext, parseRange} from "./BuildContext";
import {Enricher} from "../enrich/Enricher";
import {Columns, FeedRow, GTFSOutput, RowWriter} from "@gb-transit/gtfs-schema";
import {ScheduleResults} from "./ScheduleBuilder";
import {Association, AssociationType, DateIndicator} from "../model/Association";
import {NO_DAYS, ScheduleCalendar} from "../model/ScheduleCalendar";
import {Schedule} from "../model/Schedule";
import {FixedLink, PickupDropOffType, RouteType, Stop, StopTime, Transfer} from "@gb-transit/gtfs-schema";
import {STP} from "../model/OverlayRecord";
import {interchange} from "../transform/MergeTransfers";
import {NO_EXCLUSIONS, ServiceExclusions} from "../transform/ExcludeServices";
import {TimetableSource} from "../source/TimetableSource";

/**
 * Collects what the build writes, per file, instead of putting it on disk.
 *
 * Rows are kept whole rather than projected through the declared columns: these
 * tests assert on what the build produced, and which columns reach the file is
 * the writer's business. The columns are still checked at the call site, by the
 * type.
 */
class MemoryOutput implements GTFSOutput {

  public readonly files: {[filename: string]: any[]} = {};
  public readonly columns: {[filename: string]: readonly string[]} = {};

  public open<R extends FeedRow>(filename: string, columns: Columns<R>): RowWriter<R> {
    const name = filename.replace(/^.*\//, "");
    const rows = this.files[name] = [] as any[];

    this.columns[name] = columns;

    return {
      write(row: R): boolean {
        rows.push(row);

        return true;
      },
      drain: async () => {},
      end() {},
      finished: async () => {}
    };
  }

  public write(filename: string, contents: string): void {
    this.files[filename.replace(/^.*\//, "")] = [JSON.parse(contents)];
  }

  public end(): void {}

}

/** A call: the station on its own, or the station with the time and platform a test cares about. */
type Call = string | {crs: string, time?: string, platform?: string | null};

const stopTime = (call: Call, tripId: string, sequence: number): StopTime => {
  const {crs, time, platform} = typeof call === "string"
    ? {crs: call, time: undefined, platform: null}
    : {time: undefined, platform: null, ...call};

  return {
    trip_id: tripId,
    arrival_time: time ?? "10:00:00",
    departure_time: time ?? "10:01:00",
    stop_id: crs,
    stop_sequence: sequence,
    stop_headsign: null,
    pickup_type: PickupDropOffType.Scheduled,
    drop_off_type: PickupDropOffType.Scheduled,
    shape_dist_traveled: null,
    timepoint: 1,
    platform,
    tiploc: null
  };
};

function schedule(
  id: number,
  tuid: string,
  from: string,
  to: string,
  operator: string,
  stops: Call[],
  mode: RouteType = RouteType.Rail,
  stp: STP = STP.Permanent
): Schedule {
  const trip = `${tuid}_${from.replace(/-/g, "")}_${to.replace(/-/g, "")}`;

  return new Schedule(
    id,
    stops.map((stop, i) => stopTime(stop, trip, i + 1)),
    tuid,
    "",
    new ScheduleCalendar(
      Temporal.PlainDate.from(from),
      Temporal.PlainDate.from(to),
      {...NO_DAYS, 1: 1}
    ),
    mode,
    operator,
    stp,
    true,
    false
  );
}

const stop = (crs: string, tiploc: string): Stop => ({
  stop_id: `910G${tiploc}`, crs, tiploc, stop_name: crs, stop_desc: "", stop_lat: 0, stop_lon: 0,
  zone_id: 0, stop_url: "", location_type: 0, parent_station: null, platform_code: null,
  stop_timezone: "Europe/London", wheelchair_boarding: 0, located: true
});

const transfer = (from: string, to: string): Transfer =>
  ({...interchange(from, 300), to_stop_id: to});

const link = (from: string, to: string): FixedLink => ({
  from_stop_id: from, to_stop_id: to, mode: "WALK", duration: 300,
  start_time: "00:00:00", end_time: "23:59:59", start_date: "2017-01-01", end_date: "2038-01-19",
  monday: 1, tuesday: 1, wednesday: 1, thursday: 1, friday: 1, saturday: 1, sunday: 1
});

class FakeSource implements TimetableSource {

  constructor(
    private readonly schedules: Schedule[],
    private readonly stops: Stop[] = [],
    private readonly transfers: Transfer[] = [],
    private readonly links: FixedLink[] = [],
    private readonly associations: Association[] = []
  ) {}

  /**
   * The stops the test declared, or one for every stop its schedules call at if
   * it declared none. The build drops calls at stops it does not publish, and
   * most of these tests are about ordering rather than about stops - they would
   * otherwise end up with no stop times at all. A test that does declare stops
   * gets exactly those, including the deliberately malformed ones.
   */
  async getStops() {
    if (this.stops.length > 0) {
      return this.stops;
    }

    const called = this.schedules.flatMap(s => s.stopTimes.map(stopTime => stopTime.stop_id));

    // The TIPLOC a made up station gets is its CRS code, which is enough for the
    // ids to be built from and to differ from each other.
    return [...new Set(called)].sort().map(crs => stop(crs, crs));
  }
  async getTransfers() { return this.transfers; }
  async getFeedVersion() { return "RJTTF001.ZIP"; }
  async getFixedLinks() { return this.links; }
  async getAssociations(): Promise<Association[]> { return this.associations; }
  async end() {}

  async getSchedules(): Promise<ScheduleResults> {
    return {schedules: this.schedules, idGenerator: ids()};
  }

}

function* ids(): IterableIterator<number> {
  let id = 100000;

  while (true) {
    yield id++;
  }
}

const context: BuildContext = {
  today: Temporal.PlainDate.from("2024-01-01"),
  range: parseRange("3 MONTH"),
  links: true,
  removePassingPoints: true,
  duplicateOvernightAssociations: false
};

async function build(
  source: TimetableSource,
  enrichers: Enricher[] = [],
  ctx: BuildContext = context,
  allowed: ReadonlyMap<string, ReadonlySet<string>> = new Map()
): Promise<MemoryOutput> {
  const output = new MemoryOutput();

  await new BuildFeed(source, output, ctx, enrichers, [], allowed).build(".");

  return output;
}

const feed = () => [
  schedule(3, "C00003", "2024-01-01", "2024-03-01", "SN", ["SEV", "TON"]),
  schedule(1, "C00001", "2024-01-01", "2024-02-01", "SE", ["TON", "SEV"]),
  schedule(2, "C00002", "2024-01-01", "2024-02-01", "SE", ["TON", "SEV"])
];

describe("BuildFeed ordering", () => {

  it("writes the trips in trip ID order", async () => {
    const {files} = await build(new FakeSource(feed()));

    expect(files["trips.txt"].map(t => t.trip_id))
      .to.deep.equal([
        "C00001_20240101_20240201",
        "C00002_20240101_20240201",
        "C00003_20240101_20240301"
      ]);
  });

  it("writes the stop times grouped by trip, in stop sequence", async () => {
    const {files} = await build(new FakeSource(feed()));

    expect(files["stop_times.txt"].map(s => [s.trip_id, s.stop_sequence]))
      .to.deep.equal([
        ["C00001_20240101_20240201", 1], ["C00001_20240101_20240201", 2],
        ["C00002_20240101_20240201", 1], ["C00002_20240101_20240201", 2],
        ["C00003_20240101_20240301", 1], ["C00003_20240101_20240301", 2]
      ]);
  });

  it("numbers the services from a sort of the calendar, not from arrival order", async () => {
    const {files} = await build(new FakeSource(feed()));

    // 2024-01-01 to 2024-02-01 sorts before 2024-01-01 to 2024-03-01
    expect(files["calendar.txt"].map(c => [c.service_id, c.start_date, c.end_date]))
      .to.deep.equal([
        [1, "20240101", "20240201"],
        [2, "20240101", "20240301"]
      ]);
  });

  it("points each trip at the service its own calendar was numbered as", async () => {
    const {files} = await build(new FakeSource(feed()));
    const byTrip = Object.fromEntries(files["trips.txt"].map(t => [t.trip_id, t.service_id]));

    expect(byTrip["C00001_20240101_20240201"]).to.equal(1);
    expect(byTrip["C00003_20240101_20240301"]).to.equal(2);
  });

  it("sorts the stops, transfers and links", async () => {
    const {files} = await build(new FakeSource(
      feed(),
      [stop("TON", "TONBDG"), stop("SEV", "SEVNOKS")],
      [transfer("TON", "TON"), transfer("SEV", "SEV")],
      [link("TON", "SEV"), link("SEV", "TON")]
    ));

    // Each station, and the boarding point the calls with no platform are at
    expect(files["stops.txt"].map(s => s.stop_id))
      .to.deep.equal(["9100SEVNOKS", "9100TONBDG", "910GSEVNOKS", "910GTONBDG"]);
    // The two self transfers and the two links, as one file, between stations
    expect(files["transfers.txt"].map(t => [t.from_stop_id, t.to_stop_id]))
      .to.deep.equal([
        ["910GSEVNOKS", "910GSEVNOKS"], ["910GSEVNOKS", "910GTONBDG"],
        ["910GTONBDG", "910GSEVNOKS"], ["910GTONBDG", "910GTONBDG"]
      ]);
    expect(files["links.txt"].map(l => [l.from_stop_id, l.to_stop_id]))
      .to.deep.equal([["SEV", "TON"], ["TON", "SEV"]]);
  });

  it("sorts the agencies", async () => {
    const {files} = await build(new FakeSource(feed()));
    const ids = files["agency.txt"].map(a => a.agency_id);

    expect(ids).to.deep.equal([...ids].sort());
  });

  it("orders rows the declared key leaves tied, rather than leaving them as they arrived", async () => {
    // Two links between the same pair, same mode, same dates, same start time,
    // differing only in the days they run - which is 1,276 rows of the real feed
    const weekday = {...link("TON", "SEV"), saturday: 0 as const, sunday: 0 as const};
    const weekend = {...link("TON", "SEV"), monday: 0 as const, tuesday: 0 as const,
                     wednesday: 0 as const, thursday: 0 as const, friday: 0 as const};

    const forwards = await build(new FakeSource(feed(), [], [], [weekday, weekend]));
    const backwards = await build(new FakeSource(feed(), [], [], [weekend, weekday]));

    expect(backwards.files["links.txt"]).to.deep.equal(forwards.files["links.txt"]);
  });

  it("puts a null ahead of a value rather than wherever it was found", async () => {
    const named = stop("SEV", "SEVNOKS");
    const unnamed = {...stop("XXX", "XXXXXX"), stop_id: null as unknown as string};

    const forwards = await build(new FakeSource(feed(), [named, unnamed]));
    const backwards = await build(new FakeSource(feed(), [unnamed, named]));

    expect(forwards.files["stops.txt"].map(s => s.stop_id))
      .to.deep.equal([null, "9100SEVNOKS", "910GSEVNOKS"]);
    expect(backwards.files["stops.txt"]).to.deep.equal(forwards.files["stops.txt"]);
  });

  it("describes a route the same way whichever of its trips is seen first", async () => {
    // Two trips on one route disagreeing about first class, which 352 routes in
    // the real feed do
    const standard = schedule(1, "C00001", "2024-01-01", "2024-02-01", "SE", ["TON", "SEV"]);
    const first = new Schedule(
      2, standard.stopTimes, "C00002", "", standard.calendar,
      standard.mode, standard.operator, standard.stp, false, false
    );

    const forwards = await build(new FakeSource([standard, first]));
    const backwards = await build(new FakeSource([first, standard]));

    expect(backwards.files["routes.txt"]).to.deep.equal(forwards.files["routes.txt"]);
    expect(forwards.files["routes.txt"].length).to.equal(1);
  });

  it("produces the same feed whatever order the source returns the schedules in", async () => {
    const forwards = await build(new FakeSource(feed()));
    const backwards = await build(new FakeSource(feed().reverse()));

    expect(backwards.files).to.deep.equal(forwards.files);
  });

  it("refuses to write a feed with no schedules in it", async () => {
    await expect(build(new FakeSource([]))).rejects.toThrow(/No schedules run between/);
  });

});

describe("BuildFeed with an enricher", () => {

  /**
   * The seam, exercised end to end. An enricher that only knows about one stop -
   * which is the realistic case, since no external source covers the whole
   * network - and reports the ones it could not place.
   */
  const namer: Enricher<string[]> = {
    key: "TEST_NAMER",
    dependsOn: [],
    priority: 50,
    async fetch() {
      return ["910GTONBDG", "NOWHERE"];
    },
    apply(feed, known) {
      let matched = 0;
      let unmatched = 0;

      for (const id of known) {
        const target = feed.stop(id);

        if (target) {
          feed.set(target, "stop_name", `${id} renamed`, this);
          matched++;
        }
        else {
          unmatched++;
        }
      }

      return {enricher: this.key, matched, unmatched, conflicts: 0};
    }
  };

  it("changes the feed the enricher touched", async () => {
    const {files} = await build(new FakeSource(feed(), [stop("TON", "TONBDG"), stop("SEV", "SEVNOKS")]), [namer]);
    const renamed = files["stops.txt"].find(s => s.stop_id === "910GTONBDG");

    expect(renamed.stop_name).to.equal("910GTONBDG renamed");
    expect(files["stops.txt"].find(s => s.stop_id === "910GSEVNOKS").stop_name).to.equal("SEV");
  });

  it("does not put the provenance bookkeeping in stops.txt", async () => {
    const {files} = await build(new FakeSource(feed(), [stop("TON", "TONBDG")]), [namer]);

    expect(Object.keys(files["stops.txt"][0])).to.not.contain("located");
  });

  /**
   * What NaPTAN is: a position for the station and nothing about the platforms
   * beneath it. A boarding point is where its station is, and it is what a stop
   * time references, so an enricher that reached the station alone would have
   * moved nothing a journey is planned from.
   */
  const mover: Enricher<null> = {
    key: "TEST_MOVER",
    dependsOn: [],
    priority: 50,
    async fetch() {
      return null;
    },
    apply(feed) {
      for (const station of feed.stations) {
        feed.set(station, "stop_lat", 51.5, this);
        feed.set(station, "stop_lon", -0.1, this);
      }

      return {enricher: this.key, matched: feed.stations.length, unmatched: 0, conflicts: 0};
    }
  };

  it("puts a boarding point where the enricher put its station", async () => {
    const {files} = await build(new FakeSource(feed(), [stop("TON", "TONBDG")]), [mover]);

    expect(files["stops.txt"].map(s => [s.stop_id, s.stop_lat, s.stop_lon]))
      .to.deep.equal([
        ["9100TONBDG", 51.5, -0.1],
        ["910GTONBDG", 51.5, -0.1]
      ]);
  });

  it("names a boarding point after the station as the enricher left it", async () => {
    const {files} = await build(new FakeSource(feed(), [stop("TON", "TONBDG")]), [namer]);

    expect(files["stops.txt"].find(s => s.stop_id === "9100TONBDG").stop_name)
      .to.equal("910GTONBDG renamed");
  });

  it("names a train after the station as the enricher left it", async () => {
    const {files} = await build(new FakeSource(feed(), [stop("TON", "TONBDG"), stop("SEV", "SEVNOKS")]), [namer]);
    const toTonbridge = files["trips.txt"].find(t => t.trip_id === "C00003_20240101_20240301");

    expect(toTonbridge.trip_headsign).to.equal("910GTONBDG renamed");
  });

  it("records who wrote what, and what the enricher could not place", async () => {
    const {files} = await build(new FakeSource(feed(), [stop("TON", "TONBDG"), stop("SEV", "SEVNOKS")]), [namer]);
    const [provenance] = files["provenance.json"];

    expect(provenance.enrichers).to.deep.equal([
      {id: "TEST_NAMER", matched: 1, unmatched: 1, conflicts: 0, refused: 0}
    ]);
    expect(provenance.fields).to.deep.equal([
      {entity: "stop", id: "910GTONBDG", field: "stop_name", value: "910GTONBDG renamed", by: "TEST_NAMER", overruled: []}
    ]);
  });

  it("writes no provenance when nothing enriched", async () => {
    const {files} = await build(new FakeSource(feed(), [stop("TON", "TONBDG")]));

    expect(files["provenance.json"]).to.equal(undefined);
  });

  /**
   * The allowlist reaching the MutableFeed the enrichers write through, which
   * is the whole of what makes `apply:` a setting rather than a comment.
   * Enforcement itself is MutableFeed's, and tested there; what this covers is
   * the wiring, which nothing else would notice the absence of.
   */
  it("enforces the apply list it was given", async () => {
    const allowed = new Map([["TEST_MOVER", new Set(["stop_lat"])]]);
    const {files} = await build(new FakeSource(feed(), [stop("TON", "TONBDG")]), [mover], context, allowed);
    const station = files["stops.txt"].find(s => s.stop_id === "910GTONBDG");

    expect(station.stop_lat).to.equal(51.5);
    expect(station.stop_lon).to.equal(0);
  });

  it("leaves an enricher the list says nothing about alone", async () => {
    const allowed = new Map([["SOMETHING_ELSE", new Set(["stop_lat"])]]);
    const {files} = await build(new FakeSource(feed(), [stop("TON", "TONBDG")]), [mover], context, allowed);
    const station = files["stops.txt"].find(s => s.stop_id === "910GTONBDG");

    expect(station.stop_lon).to.equal(-0.1);
  });

  it("records what the list turned away, against the enricher it turned away", async () => {
    const allowed = new Map([["TEST_MOVER", new Set(["stop_lat"])]]);
    const {files} = await build(new FakeSource(feed(), [stop("TON", "TONBDG")]), [mover], context, allowed);
    const [provenance] = files["provenance.json"];

    expect(provenance.enrichers).to.deep.equal([
      {id: "TEST_MOVER", matched: 1, unmatched: 0, conflicts: 0, refused: 1}
    ]);
  });

});

describe("BuildFeed with an association", () => {

  const base = schedule(1, "A", "2024-01-08", "2024-03-04", "SE", ["TON", "ASH", "RAM"]);
  const associated = schedule(2, "B", "2024-01-08", "2024-03-04", "SE", ["ASH", "DOV"]);

  const divide = new Association(
    1, "A", "B", "ASH", DateIndicator.Same, AssociationType.Split,
    new ScheduleCalendar(
      Temporal.PlainDate.from("2024-01-08"), Temporal.PlainDate.from("2024-03-04"), {...NO_DAYS, 1: 1}
    ),
    STP.Permanent
  );

  const built = () => build(new FakeSource([base, associated], [], [], [], [divide]));

  it("writes both trips whole, and no concatenation of them", async () => {
    const {files} = await built();
    const trips = files["trips.txt"].map(t => t.trip_id);

    expect(trips).to.deep.equal(["A_20240108_20240304", "B_20240108_20240304"]);

    const calls = (tripId: string) =>
      files["stop_times.txt"].filter(s => s.trip_id === tripId).map(s => s.stop_id);

    expect(calls("A_20240108_20240304")).to.deep.equal(["9100TON", "9100ASH", "9100RAM"]);
    expect(calls("B_20240108_20240304")).to.deep.equal(["9100ASH", "9100DOV"]);
  });

  it("couples them with an in-seat transfer carrying no calendar of its own", async () => {
    const {files} = await built();
    const [link] = files["transfers.txt"].filter(t => t.transfer_type === 4);

    expect(link.from_trip_id).to.equal("A_20240108_20240304");
    expect(link.to_trip_id).to.equal("B_20240108_20240304");
    expect(link.from_stop_id).to.equal("9100ASH");
    expect(link.to_stop_id).to.equal("9100ASH");
    expect(link.min_transfer_time).to.equal(null);
    expect(link.start_date).to.equal(null);
    expect(link.monday).to.equal(null);
  });

  it("puts both trips on the same service, so the days they share are the days they are coupled", async () => {
    const {files} = await built();
    const serviceOf = (tripId: string) => files["trips.txt"].find(t => t.trip_id === tripId).service_id;

    expect(serviceOf("A_20240108_20240304")).to.equal(serviceOf("B_20240108_20240304"));
  });

  it("gives every row of transfers.txt the same columns, whichever kind it is", async () => {
    const {files} = await build(
      new FakeSource([base, associated], [], [transfer("TON", "TON")], [], [divide])
    );
    const [first, ...rest] = files["transfers.txt"];

    for (const row of rest) {
      expect(Object.keys(row)).to.deep.equal(Object.keys(first));
    }
  });

});

/**
 * The turnback that no association names, which is `reversingTrips`' business. The rules themselves
 * are ReversingTrips.spec's; this is that the build asks, with the trips as it publishes them.
 */
describe("BuildFeed with a train turning back", () => {

  const arrives = schedule(
    1, "T1", "2024-01-08", "2024-03-04", "TL", ["WIM", {crs: "SUO", time: "10:00:00", platform: "4"}]
  );
  const departs = schedule(
    2, "T2", "2024-01-08", "2024-03-04", "TL", [{crs: "SUO", time: "10:02:00", platform: "4"}, "HCB"]
  );

  it("couples the two halves at the platform they share", async () => {
    const {files} = await build(new FakeSource([arrives, departs]));
    const [link] = files["transfers.txt"].filter(t => t.transfer_type === 4);

    expect(link.from_trip_id).to.equal("T1_20240108_20240304");
    expect(link.to_trip_id).to.equal("T2_20240108_20240304");
    expect(link.from_stop_id).to.equal("9100SUO4");
    expect(link.to_stop_id).to.equal("9100SUO4");
  });

  it("leaves both trips whole, because each is still boarded on its own", async () => {
    const {files} = await build(new FakeSource([arrives, departs]));

    expect(files["trips.txt"].map(t => t.trip_id))
      .to.deep.equal(["T1_20240108_20240304", "T2_20240108_20240304"]);
    expect(files["stop_times.txt"].map(s => s.stop_id))
      .to.deep.equal(["9100WIM", "9100SUO4", "9100SUO4", "9100HCB"]);
  });

});

/**
 * Where excludeServices runs in the pipeline, which is the whole of the design.
 *
 * Both cases are about ordering rather than about the rules: the rules
 * themselves are ExcludeServices.spec's business.
 */
describe("BuildFeed with services excluded", () => {

  const excluding = (exclude: ServiceExclusions): BuildContext => ({...context, exclude});

  it("does not run a train on the days it ran as something excluded", async () => {
    // The Monday train, replaced by a bus on 15 January. Excluding the bus must
    // not hand those days back to the train: the overlay has already taken them
    // off its calendar, and it is only right because the exclusion happens after
    // applyOverlays. Filtering the schedules as they arrive publishes a train
    // that did not run.
    const train = schedule(1, "A", "2024-01-08", "2024-03-04", "SE", ["TON", "ASH"]);
    const replacement = schedule(
      2, "A", "2024-01-15", "2024-01-15", "SE", ["TON", "ASH"], RouteType.Bus, STP.Overlay
    );

    const {files} = await build(
      new FakeSource([train, replacement]), [], excluding({...NO_EXCLUSIONS, modes: [RouteType.Bus]})
    );

    expect(files["trips.txt"].map(t => t.trip_id)).to.deep.equal(["A_20240108_20240304"]);
    expect(files["calendar_dates.txt"].map(d => [d.date, d.exception_type]))
      .to.deep.equal([["20240115", 2]]);
  });

  it("does not cut a portion in two for a coupling to a train it excluded", async () => {
    // applyAssociations cuts the associated schedule into the days it is
    // coupled and the days it runs alone. Excluding the base after that has
    // happened leaves the portion split in two with nothing coupled to either
    // half; excluding it first means the association finds no base and the
    // portion is published whole, which is what it is.
    //
    // The coupling itself is safe either way - linkedTrips drops a link whose
    // trip is not in trips.txt - so the split is the observable difference.
    const base = schedule(1, "A", "2024-01-08", "2024-03-04", "LT", ["TON", "ASH", "RAM"]);
    const portion = schedule(2, "B", "2024-01-08", "2024-03-04", "SE", ["ASH", "DOV"]);
    const divide = new Association(
      1, "A", "B", "ASH", DateIndicator.Same, AssociationType.Split,
      // Only the first three Mondays, so a cut leaves a remainder to see
      new ScheduleCalendar(
        Temporal.PlainDate.from("2024-01-08"), Temporal.PlainDate.from("2024-01-22"), {...NO_DAYS, 1: 1}
      ),
      STP.Permanent
    );

    const {files} = await build(
      new FakeSource([base, portion], [], [], [], [divide]),
      [],
      excluding({...NO_EXCLUSIONS, operators: ["LT"]})
    );

    expect(files["trips.txt"].map(t => t.trip_id)).to.deep.equal(["B_20240108_20240304"]);
    expect(files["transfers.txt"].filter(t => t.transfer_type === 4)).to.deep.equal([]);
  });

  it("publishes everything when the context says nothing about exclusions", async () => {
    // The field is optional, so a caller that predates it builds the feed it
    // always did rather than failing to compile or excluding by accident.
    const {files} = await build(new FakeSource(feed()), [], {...context, exclude: undefined});

    expect(files["trips.txt"]).to.have.length(3);
  });

});
