import {describe, it, expect} from 'vitest';
import {EventEmitter} from "events";
import {ScheduleBuilder} from "../build/ScheduleBuilder";
import {ScheduleStopTimeRow} from "../source/TimetableSource";
import {PickupDropOffType} from "@gb-transit/gtfs-schema";

/**
 * The schedules query returns a stream of rows, so feed the builder an emitter that behaves
 * like one.
 */
function stream(rows: object[], error?: Error): EventEmitter {
  const emitter = new EventEmitter();

  process.nextTick(() => {
    rows.forEach(row => emitter.emit("result", row));
    error ? emitter.emit("error", error) : emitter.emit("end");
  });

  return emitter;
}

const row = (overrides: object = {}): ScheduleStopTimeRow => (<ScheduleStopTimeRow>Object.assign({
  id: 1,
  train_uid: "C00001",
  retail_train_id: "SR000100",
  runs_from: "2026-08-01",
  runs_to: "2026-12-01",
  monday: 1, tuesday: 1, wednesday: 1, thursday: 1, friday: 1, saturday: 0, sunday: 0,
  stp_indicator: "P",
  crs_code: "TBW",
  train_category: "OO",
  atoc_code: "SE",
  stop_id: 10,
  public_arrival_time: "10:00:00",
  public_departure_time: "10:01:00",
  scheduled_arrival_time: "10:00:00",
  scheduled_departure_time: "10:01:00",
  scheduled_pass_time: null,
  platform: "1",
  activity: "T ",
  train_class: "S",
  reservations: null
}, overrides));

describe("ScheduleBuilder", () => {

  it("loads a schedule with stop times", async () => {
    const builder = new ScheduleBuilder();

    await builder.loadSchedules(stream([
      row({ stop_id: 10, crs_code: "TBW" }),
      row({ stop_id: 11, crs_code: "TON", public_arrival_time: "10:10:00", public_departure_time: "10:11:00" })
    ]));

    expect(builder.results.schedules.length).to.equal(1);
    expect(builder.results.schedules[0].stopTimes.length).to.equal(2);
  });

  /**
   * getSchedules keeps schedules that have no stop times (`stop_time.id IS NULL`), which arrive
   * as a single row with every stop_time column null. Building a stop from one of those used to
   * throw inside the driver's result listener, where the error was swallowed - the query then
   * emitted neither "end" nor "error" and the whole build hung with no output.
   */
  it("loads a schedule that has no stop times", async () => {
    const builder = new ScheduleBuilder();

    await builder.loadSchedules(stream([
      row({
        stop_id: null,
        crs_code: null,
        activity: null,
        platform: null,
        public_arrival_time: null,
        public_departure_time: null,
        scheduled_arrival_time: null,
        scheduled_departure_time: null
      })
    ]));

    expect(builder.results.schedules.length).to.equal(1);
    expect(builder.results.schedules[0].stopTimes.length).to.equal(0);
  });

  it("does not let a schedule without stop times affect the next schedule", async () => {
    const builder = new ScheduleBuilder();

    await builder.loadSchedules(stream([
      row({ id: 1, stop_id: null, crs_code: null, activity: null, public_arrival_time: null, public_departure_time: null, scheduled_arrival_time: null, scheduled_departure_time: null }),
      row({ id: 2, stop_id: 20, crs_code: "TBW" }),
      row({ id: 2, stop_id: 21, crs_code: "TON" })
    ]));

    expect(builder.results.schedules.length).to.equal(2);
    expect(builder.results.schedules[0].stopTimes.length).to.equal(0);
    expect(builder.results.schedules[1].stopTimes.length).to.equal(2);
  });

  it("rejects rather than hanging when a row cannot be processed", async () => {
    const builder = new ScheduleBuilder();
    // a row that claims a stop time but carries no times at all cannot produce a stop
    const promise = builder.loadSchedules(stream([
      row({
        stop_id: 10,
        public_arrival_time: null,
        public_departure_time: null,
        scheduled_arrival_time: null,
        scheduled_departure_time: null
      })
    ]));

    let message = "did not reject";
    try { await promise; } catch (err: any) { message = err.message; }

    expect(message).to.contain("no arrival or departure time");
  });

  it("propagates a stream error", async () => {
    const builder = new ScheduleBuilder();
    let message = "did not reject";

    try { await builder.loadSchedules(stream([], new Error("connection lost"))); }
    catch (err: any) { message = err.message; }

    expect(message).to.equal("connection lost");
  });

  /**
   * An operator the build has no agency for keeps its ATOC code, so it gets a
   * route of its own rather than sharing one with every other operator the
   * build does not know. The route is attributed to the catch-all agency until
   * the agency list catches up, and keeps its id when it does - which is what
   * matters when an operator starts running before the software knows about it.
   *
   * Only a schedule with no code at all is ZZ.
   */
  it("keeps an ATOC code the build has no agency for", () => {
    const builder = new ScheduleBuilder();

    builder.load([
      row({ id: 1, stop_id: 10, atoc_code: "SE" }),
      row({ id: 2, stop_id: 11, atoc_code: "QQ" }),
      row({ id: 3, stop_id: 12, atoc_code: null })
    ]);

    expect(builder.results.schedules.map(s => s.operator)).to.deep.equal(["SE", "QQ", "ZZ"]);
  });
  
  it("generates the correct pick up and drop off types", async () => {
    const builder = new ScheduleBuilder();

    await builder.loadSchedules(stream([
      row({ stop_id: 10, crs_code: "AAA", public_arrival_time: null, public_departure_time: "10:01:00", activity: "TB" }),
      row({ stop_id: 11, crs_code: "BBB", public_arrival_time: null, public_departure_time: "10:06:00", activity: "U " }),
      row({ stop_id: 12, crs_code: "CCC", public_arrival_time: "10:10:00", public_departure_time: "10:11:00", activity: "R " }),
      row({ stop_id: 14, crs_code: "DDD", public_arrival_time: null, public_departure_time: null, activity: "T N " }),
      row({ stop_id: 16, crs_code: "EEE", public_arrival_time: "10:20:00", public_departure_time: "10:21:00", activity: "T " }),
      row({ stop_id: 18, crs_code: "FFF", public_arrival_time: "10:25:00", public_departure_time: null, activity: "D " }),
      row({ stop_id: 19, crs_code: "GGG", public_arrival_time: null, public_departure_time: null, activity: "TFN " }),
    ]));

    const schedule = builder.results.schedules[0];
    expect(schedule.stopTimes[0].drop_off_type).to.equal(PickupDropOffType.None);
    expect(schedule.stopTimes[0].pickup_type).to.equal(PickupDropOffType.Scheduled);
    expect(schedule.stopTimes[1].drop_off_type).to.equal(PickupDropOffType.None);
    expect(schedule.stopTimes[1].pickup_type).to.equal(PickupDropOffType.Scheduled);
    expect(schedule.stopTimes[2].drop_off_type).to.equal(PickupDropOffType.CoordinateWithDriver);
    expect(schedule.stopTimes[2].pickup_type).to.equal(PickupDropOffType.CoordinateWithDriver);
    expect(schedule.stopTimes[3].drop_off_type).to.equal(PickupDropOffType.None);
    expect(schedule.stopTimes[3].pickup_type).to.equal(PickupDropOffType.None);
    expect(schedule.stopTimes[4].drop_off_type).to.equal(PickupDropOffType.Scheduled);
    expect(schedule.stopTimes[4].pickup_type).to.equal(PickupDropOffType.Scheduled);
    expect(schedule.stopTimes[5].drop_off_type).to.equal(PickupDropOffType.Scheduled);
    expect(schedule.stopTimes[5].pickup_type).to.equal(PickupDropOffType.None);
    expect(schedule.stopTimes[6].drop_off_type).to.equal(PickupDropOffType.None);
    expect(schedule.stopTimes[6].pickup_type).to.equal(PickupDropOffType.None);
  })

});

describe("ScheduleBuilder ordering contract", () => {

  it("builds the same schedules from an iterable as from a stream", async () => {
    const rows = [
      row({ id: 1, stop_id: 10, crs_code: "TBW" }),
      row({ id: 1, stop_id: 11, crs_code: "TON" }),
      row({ id: 2, train_uid: "C00002", stop_id: 12, crs_code: "SEV" }),
      row({ id: 2, train_uid: "C00002", stop_id: 13, crs_code: "ORP" })
    ];

    const streamed = new ScheduleBuilder();
    await streamed.loadSchedules(stream(rows));

    const iterated = new ScheduleBuilder();
    iterated.load(rows);

    expect(iterated.results.schedules.map(s => [s.id, s.tuid, s.stopTimes.length]))
      .to.deep.equal(streamed.results.schedules.map(s => [s.id, s.tuid, s.stopTimes.length]));
  });

  it("keeps two concurrent loads from splicing stops into each other's trains", async () => {
    // Passenger schedules and z-trains loaded into one builder at the same time
    // arrive interleaved.
    const builder = new ScheduleBuilder();

    await Promise.all([
      builder.loadSchedules(stream([
        row({ id: 1, stop_id: 10, crs_code: "TBW" }),
        row({ id: 1, stop_id: 11, crs_code: "TON" })
      ])),
      builder.loadSchedules(stream([
        row({ id: 500, train_uid: "Z00001", stop_id: 20, crs_code: "SEV" }),
        row({ id: 500, train_uid: "Z00001", stop_id: 21, crs_code: "ORP" })
      ]))
    ]);

    const byId = new Map(builder.results.schedules.map(s => [s.id, s]));

    expect(byId.get(1)!.stopTimes.map(s => s.stop_id)).to.deep.equal(["TBW", "TON"]);
    expect(byId.get(500)!.stopTimes.map(s => s.stop_id)).to.deep.equal(["SEV", "ORP"]);
  });

  it("numbers stop times in the order the rows arrive", () => {
    const builder = new ScheduleBuilder();

    builder.load([
      row({ id: 1, stop_id: 10, crs_code: "TBW" }),
      row({ id: 1, stop_id: 11, crs_code: "TON" }),
      row({ id: 1, stop_id: 12, crs_code: "SEV" })
    ]);

    expect(builder.results.schedules[0].stopTimes.map(s => s.stop_sequence)).to.deep.equal([1, 2, 3]);
  });

  it("starts a new schedule whenever the id changes, so an unsorted source produces duplicates", () => {
    const builder = new ScheduleBuilder();

    builder.load([
      row({ id: 1, stop_id: 10, crs_code: "TBW" }),
      row({ id: 2, train_uid: "C00002", stop_id: 12, crs_code: "SEV" }),
      row({ id: 1, stop_id: 11, crs_code: "TON" })
    ]);

    // Three schedules from two ids: this is why the ordering is part of the contract
    expect(builder.results.schedules.map(s => s.id)).to.deep.equal([1, 2, 1]);
  });

});

/**
 * What a location the service runs through becomes, in a build that keeps them.
 *
 * The source hands one over either way - the path is drawn through it whatever
 * the feed does with its stop times - so every builder here is told to keep
 * them. `a build that removes the passing points` is the other half.
 */
describe("a passing point", () => {

  const keeping = () => new ScheduleBuilder(new Set(), false);

  // What the CIF gives for one: a pass time, no arrival and no departure of
  // either kind, a blank activity and the running line it takes through.
  const passing = (overrides: object = {}) => row({
    public_arrival_time: null,
    public_departure_time: null,
    scheduled_arrival_time: null,
    scheduled_departure_time: null,
    scheduled_pass_time: "10:05:00",
    activity: "  ",
    ...overrides
  });

  it("takes the pass time as both its arrival and its departure", () => {
    const builder = keeping();

    builder.load([row({stop_id: 10, crs_code: "TBW"}), passing({stop_id: 11, crs_code: "TON"})]);

    const [, through] = builder.results.schedules[0].stopTimes;

    expect(through.arrival_time).to.equal("10:05:00");
    expect(through.departure_time).to.equal("10:05:00");
  });

  it("is a call nobody boards or alights at", () => {
    const builder = keeping();

    builder.load([row({stop_id: 10, crs_code: "TBW"}), passing({stop_id: 11, crs_code: "TON"})]);

    const [, through] = builder.results.schedules[0].stopTimes;

    expect(through.pickup_type).to.equal(1);
    expect(through.drop_off_type).to.equal(1);
  });

  /**
   * The platform a train runs through is a real platform, and naming it means a
   * passing call carries the same stop id a stopping call at that platform
   * carries - which is what anything promoting one to a real stop needs.
   */
  it("names the platform it runs through, like any other call", () => {
    const builder = keeping();

    builder.load([row({stop_id: 10, crs_code: "TBW"}), passing({stop_id: 11, crs_code: "TON", platform: "4"})]);

    const [, through] = builder.results.schedules[0].stopTimes;

    expect(through.platform).to.equal("4");
  });

  it("falls back to the station where the pass record names no platform", () => {
    const builder = keeping();

    builder.load([row({stop_id: 10, crs_code: "TBW"}), passing({stop_id: 11, crs_code: "TON", platform: null})]);

    const [, through] = builder.results.schedules[0].stopTimes;

    expect(through.platform).to.equal(null);
  });

  it("rolls over midnight the same way a call does", () => {
    const builder = keeping();

    builder.load([
      row({stop_id: 10, crs_code: "TBW", public_arrival_time: "23:00:00", public_departure_time: "23:01:00",
           scheduled_arrival_time: "23:00:00", scheduled_departure_time: "23:01:00"}),
      passing({stop_id: 11, crs_code: "TON", scheduled_pass_time: "00:05:00"})
    ]);

    expect(builder.results.schedules[0].stopTimes[1].arrival_time).to.equal("24:05:00");
  });

  /**
   * Two of a service's timing points can share a CRS - a station and the
   * junction on its approach - and the one it stops at is the one that belongs
   * in the feed.
   */
  it("gives way to a call at the same station", () => {
    const builder = keeping();

    builder.load([
      row({stop_id: 10, crs_code: "TBW"}),
      passing({stop_id: 11, crs_code: "TON"}),
      row({stop_id: 12, crs_code: "TON", public_arrival_time: "10:06:00", public_departure_time: "10:07:00"})
    ]);

    const stops = builder.results.schedules[0].stopTimes;

    expect(stops.map(s => s.stop_id)).to.deep.equal(["TBW", "TON"]);
    expect(stops[1].arrival_time).to.equal("10:06:00");
    expect(stops[1].pickup_type).to.equal(0);
  });

  /**
   * A request stop boards on request, so it is pickup_type 3 rather than 0 and
   * has no 0 to win the station with. 28 of them lost it to the point the
   * service passes on the way in.
   */
  it("gives way to a request stop at the same station", () => {
    const builder = keeping();

    builder.load([
      row({stop_id: 10, crs_code: "TBW"}),
      passing({stop_id: 11, crs_code: "TON"}),
      row({stop_id: 12, crs_code: "TON", activity: "R ", public_arrival_time: "10:06:00",
           public_departure_time: "10:07:00"})
    ]);

    const stops = builder.results.schedules[0].stopTimes;

    expect(stops.map(s => s.stop_id)).to.deep.equal(["TBW", "TON"]);
    expect(stops[1].pickup_type).to.equal(3);
    expect(stops[1].drop_off_type).to.equal(3);
  });

  it("does not take a station back off a call it already gave way to", () => {
    const builder = keeping();

    builder.load([
      row({stop_id: 10, crs_code: "TBW"}),
      passing({stop_id: 11, crs_code: "TON"}),
      row({stop_id: 12, crs_code: "TON", public_arrival_time: "10:06:00", public_departure_time: "10:07:00"}),
      passing({stop_id: 13, crs_code: "TON", scheduled_pass_time: "10:08:00"})
    ]);

    const stops = builder.results.schedules[0].stopTimes;

    expect(stops.map(s => s.stop_id)).to.deep.equal(["TBW", "TON"]);
    expect(stops[1].arrival_time).to.equal("10:06:00");
  });

  it("is an approximate time, where a call is an exact one", () => {
    const builder = keeping();

    builder.load([
      row({stop_id: 10, crs_code: "TBW"}),
      passing({stop_id: 11, crs_code: "TON"}),
      row({stop_id: 12, crs_code: "HGR", public_arrival_time: "10:10:00", public_departure_time: "10:11:00",
           scheduled_arrival_time: "10:10:00", scheduled_departure_time: "10:11:00"})
    ]);

    expect(builder.results.schedules[0].stopTimes.map(s => s.timepoint)).to.deep.equal([1, 0, 1]);
  });

});

/**
 * A call is published at its public time and a passing point has only its
 * working time, so a build that keeps passing points has two clocks to
 * reconcile. The calls either side of a pass say how the two line up.
 */
describe("a passing point between two calls", () => {

  const keeping = () => new ScheduleBuilder(new Set(), false);

  const call = (overrides: object) => row({activity: "T ", ...overrides});

  const passing = (overrides: object) => row({
    public_arrival_time: null,
    public_departure_time: null,
    scheduled_arrival_time: null,
    scheduled_departure_time: null,
    activity: "  ",
    ...overrides
  });

  const times = (builder: ScheduleBuilder) => builder.results.schedules[0].stopTimes
    .map(s => [s.stop_id, s.arrival_time, s.departure_time]);

  /**
   * C02035 on the CIF: set down only at both calls, with public times a quarter
   * of an hour ahead of the working ones.
   */
  it("keeps its share of the working time between them, on the public clock", () => {
    const builder = keeping();

    builder.load([
      call({stop_id: 10, crs_code: "DON", activity: "D ", public_arrival_time: "00:35:00", public_departure_time: null,
            scheduled_arrival_time: "00:49:30", scheduled_departure_time: "00:51:30"}),
      passing({stop_id: 11, crs_code: "AWK", scheduled_pass_time: "00:55:30"}),
      call({stop_id: 12, crs_code: "WKF", activity: "D ", public_arrival_time: "00:52:00", public_departure_time: null,
            scheduled_arrival_time: "01:06:30", scheduled_departure_time: "01:08:30"})
    ]);

    expect(times(builder)).to.deep.equal([
      ["DON", "00:35:00", "00:35:00"],
      ["AWK", "00:41:00", "00:41:00"],
      ["WKF", "00:52:00", "00:52:00"]
    ]);
  });

  /**
   * The Night Riviera sets down at Reading from a public 03:12 and stands there
   * until 04:18. Its published departure is the 03:12 repeated, which is not when
   * it leaves, so the passes towards Paddington are not spread back to it.
   */
  it("stays behind a train standing at a call that only sets down", () => {
    const builder = keeping();

    builder.load([
      call({stop_id: 10, crs_code: "RDG", activity: "D ", public_arrival_time: "03:12:00", public_departure_time: null,
            scheduled_arrival_time: "03:12:00", scheduled_departure_time: "04:18:00"}),
      passing({stop_id: 11, crs_code: "TWY", scheduled_pass_time: "04:24:30"}),
      call({stop_id: 12, crs_code: "PAD", activity: "TF", public_arrival_time: "05:04:00", public_departure_time: null,
            scheduled_arrival_time: "05:04:00", scheduled_departure_time: null})
    ]);

    expect(times(builder)[1]).to.deep.equal(["TWY", "04:24:30", "04:24:30"]);
  });

  /**
   * The sleeper from Scotland reaches Preston at 03:51 and sets down from a
   * public 04:20, which is its departure less two minutes rather than its
   * arrival half an hour late.
   */
  it("follows a train leaving a call whose public time is nearer its departure", () => {
    const builder = keeping();

    builder.load([
      call({stop_id: 10, crs_code: "PRE", activity: "D ", public_arrival_time: "04:20:00", public_departure_time: null,
            scheduled_arrival_time: "03:51:00", scheduled_departure_time: "04:22:00"}),
      passing({stop_id: 11, crs_code: "WGN", scheduled_pass_time: "04:35:00"}),
      call({stop_id: 12, crs_code: "CRE", activity: "D ", public_arrival_time: "05:12:00", public_departure_time: null,
            scheduled_arrival_time: "05:11:00", scheduled_departure_time: "05:14:00"})
    ]);

    expect(times(builder)[1]).to.deep.equal(["WGN", "04:34:00", "04:34:00"]);
  });

  it("is not stretched towards the late public time of a call it arrives at early", () => {
    const builder = keeping();

    builder.load([
      call({stop_id: 10, crs_code: "CAR", public_arrival_time: "02:28:00", public_departure_time: "02:30:00",
            scheduled_arrival_time: "02:28:30", scheduled_departure_time: "02:30:30"}),
      passing({stop_id: 11, crs_code: "LAN", scheduled_pass_time: "03:28:00"}),
      call({stop_id: 12, crs_code: "PRE", activity: "D ", public_arrival_time: "04:20:00", public_departure_time: null,
            scheduled_arrival_time: "03:51:00", scheduled_departure_time: "04:22:00"})
    ]);

    expect(times(builder)[1]).to.deep.equal(["LAN", "03:26:30", "03:26:30"]);
  });

  it("is not drawn towards a call that only picks up and publishes only its departure", () => {
    const builder = keeping();

    builder.load([
      call({stop_id: 10, crs_code: "TBW"}),
      passing({stop_id: 11, crs_code: "TON", scheduled_pass_time: "10:05:00"}),
      call({stop_id: 12, crs_code: "HGR", activity: "U ", public_arrival_time: null, public_departure_time: "10:20:00",
            scheduled_arrival_time: "10:08:00", scheduled_departure_time: "10:20:00"})
    ]);

    expect(times(builder)[1]).to.deep.equal(["TON", "10:05:00", "10:05:00"]);
  });

  it("does not move where the two clocks agree", () => {
    const builder = keeping();

    builder.load([
      call({stop_id: 10, crs_code: "TBW"}),
      passing({stop_id: 11, crs_code: "TON", scheduled_pass_time: "10:05:30"}),
      passing({stop_id: 12, crs_code: "SEV", scheduled_pass_time: "10:07:00"}),
      call({stop_id: 13, crs_code: "HGR", public_arrival_time: "10:10:00", public_departure_time: "10:11:00",
            scheduled_arrival_time: "10:10:00", scheduled_departure_time: "10:11:00"})
    ]);

    expect(times(builder).slice(1, 3)).to.deep.equal([
      ["TON", "10:05:30", "10:05:30"],
      ["SEV", "10:07:00", "10:07:00"]
    ]);
  });

  it("measures from the working time of a call that has no public one", () => {
    const builder = keeping();

    builder.load([
      call({stop_id: 10, crs_code: "TBW", public_arrival_time: null, public_departure_time: null,
            scheduled_arrival_time: "10:00:00", scheduled_departure_time: "10:01:00"}),
      passing({stop_id: 11, crs_code: "TON", scheduled_pass_time: "10:05:30"}),
      call({stop_id: 12, crs_code: "HGR", public_arrival_time: "10:07:00", public_departure_time: "10:08:00",
            scheduled_arrival_time: "10:10:00", scheduled_departure_time: "10:11:00"})
    ]);

    expect(times(builder)[1]).to.deep.equal(["TON", "10:04:00", "10:04:00"]);
  });

  it("is held to the next call when the source has it passing after that call", () => {
    const builder = keeping();

    builder.load([
      call({stop_id: 10, crs_code: "TBW"}),
      passing({stop_id: 11, crs_code: "TON", scheduled_pass_time: "10:12:00"}),
      call({stop_id: 12, crs_code: "HGR", public_arrival_time: "10:10:00", public_departure_time: "10:11:00",
            scheduled_arrival_time: "10:10:00", scheduled_departure_time: "10:11:00"})
    ]);

    expect(times(builder)[1]).to.deep.equal(["TON", "10:10:00", "10:10:00"]);
  });

  it("is not published before the pass ahead of it", () => {
    const builder = keeping();

    builder.load([
      call({stop_id: 10, crs_code: "TBW"}),
      passing({stop_id: 11, crs_code: "TON", scheduled_pass_time: "10:06:00"}),
      passing({stop_id: 12, crs_code: "SEV", scheduled_pass_time: "10:04:00"}),
      call({stop_id: 13, crs_code: "HGR", public_arrival_time: "10:10:00", public_departure_time: "10:11:00",
            scheduled_arrival_time: "10:10:00", scheduled_departure_time: "10:11:00"})
    ]);

    expect(times(builder).slice(1, 3)).to.deep.equal([
      ["TON", "10:06:00", "10:06:00"],
      ["SEV", "10:06:00", "10:06:00"]
    ]);
  });

  it("takes the time of the call behind it when the two calls share a working time", () => {
    const builder = keeping();

    builder.load([
      call({stop_id: 10, crs_code: "TBW", public_departure_time: "10:01:00", scheduled_departure_time: "10:05:00"}),
      passing({stop_id: 11, crs_code: "TON", scheduled_pass_time: "10:05:00"}),
      call({stop_id: 12, crs_code: "HGR", public_arrival_time: "10:04:00", public_departure_time: "10:06:00",
            scheduled_arrival_time: "10:05:00", scheduled_departure_time: "10:06:00"})
    ]);

    expect(times(builder)[1]).to.deep.equal(["TON", "10:01:00", "10:01:00"]);
  });

  /**
   * A schedule whose origin has no CRS reaches the builder starting with a
   * pass. Left on the working clock it would be published after the call it
   * runs towards.
   */
  it("moves with the first call when there is no call behind it", () => {
    const builder = keeping();

    builder.load([
      passing({stop_id: 10, crs_code: "BBB", scheduled_pass_time: "00:55:30"}),
      call({stop_id: 11, crs_code: "CCC", activity: "D ", public_arrival_time: "00:52:00", public_departure_time: null,
            scheduled_arrival_time: "01:06:30", scheduled_departure_time: "01:08:30"})
    ]);

    expect(times(builder)).to.deep.equal([
      ["BBB", "24:41:00", "24:41:00"],
      ["CCC", "24:52:00", "24:52:00"]
    ]);
  });

  it("is held to the first call when the source has it passing after that call", () => {
    const builder = keeping();

    builder.load([
      passing({stop_id: 10, crs_code: "AAA", scheduled_pass_time: "10:04:00"}),
      passing({stop_id: 11, crs_code: "BBB", scheduled_pass_time: "10:12:00"}),
      call({stop_id: 12, crs_code: "CCC", public_arrival_time: "10:10:00", public_departure_time: "10:11:00",
            scheduled_arrival_time: "10:10:00", scheduled_departure_time: "10:11:00"})
    ]);

    expect(times(builder).slice(0, 2)).to.deep.equal([
      ["AAA", "10:04:00", "10:04:00"],
      ["BBB", "10:10:00", "10:10:00"]
    ]);
  });

  it("moves with the last call when there is no call ahead of it", () => {
    const builder = keeping();

    builder.load([
      call({stop_id: 10, crs_code: "AAA", public_arrival_time: "10:00:00", public_departure_time: "10:01:00",
            scheduled_arrival_time: "10:03:00", scheduled_departure_time: "10:05:00"}),
      passing({stop_id: 11, crs_code: "BBB", scheduled_pass_time: "10:08:00"}),
      passing({stop_id: 12, crs_code: "CCC", scheduled_pass_time: "10:03:00"})
    ]);

    expect(times(builder).slice(1)).to.deep.equal([
      ["BBB", "10:04:00", "10:04:00"],
      ["CCC", "10:04:00", "10:04:00"]
    ]);
  });

  it("keeps its working time on a trip with no call at all", () => {
    const builder = keeping();

    builder.load([
      passing({stop_id: 10, crs_code: "AAA", scheduled_pass_time: "10:04:00"}),
      passing({stop_id: 11, crs_code: "BBB", scheduled_pass_time: "10:08:30"})
    ]);

    expect(times(builder)).to.deep.equal([
      ["AAA", "10:04:00", "10:04:00"],
      ["BBB", "10:08:30", "10:08:30"]
    ]);
  });

  it("is placed across midnight on the same clock as the calls", () => {
    const builder = keeping();

    builder.load([
      call({stop_id: 10, crs_code: "TBW", public_arrival_time: "23:49:00", public_departure_time: "23:50:00",
            scheduled_arrival_time: "23:54:00", scheduled_departure_time: "23:55:00"}),
      passing({stop_id: 11, crs_code: "TON", scheduled_pass_time: "00:02:00"}),
      call({stop_id: 12, crs_code: "HGR", public_arrival_time: "00:05:00", public_departure_time: "00:06:00",
            scheduled_arrival_time: "00:10:00", scheduled_departure_time: "00:11:00"})
    ]);

    expect(times(builder)).to.deep.equal([
      ["TBW", "23:49:00", "23:50:00"],
      ["TON", "23:57:00", "23:57:00"],
      ["HGR", "24:05:00", "24:06:00"]
    ]);
  });

});

/**
 * The default, and what the published feed is built with.
 *
 * The source sends the locations a service runs through whatever this says, so
 * these are the rows the `a passing point` block uses, put through a builder
 * told to leave them out of the stop times.
 */
describe("a build that removes the passing points", () => {

  const passing = (overrides: object = {}) => row({
    public_arrival_time: null,
    public_departure_time: null,
    scheduled_arrival_time: null,
    scheduled_departure_time: null,
    scheduled_pass_time: "10:05:00",
    activity: "  ",
    ...overrides
  });

  it("leaves a location the service runs through out of the stop times", () => {
    const builder = new ScheduleBuilder();

    builder.load([
      row({stop_id: 10, crs_code: "TBW"}),
      passing({stop_id: 11, crs_code: "TON"}),
      row({stop_id: 12, crs_code: "HGR", public_arrival_time: "10:10:00", public_departure_time: "10:11:00"})
    ]);

    expect(builder.results.schedules[0].stopTimes.map(s => s.stop_id)).to.deep.equal(["TBW", "HGR"]);
  });

  it("numbers the calls as though the passing point had never been there", () => {
    const builder = new ScheduleBuilder();

    builder.load([
      row({stop_id: 10, crs_code: "TBW"}),
      passing({stop_id: 11, crs_code: "TON"}),
      row({stop_id: 12, crs_code: "HGR", public_arrival_time: "10:10:00", public_departure_time: "10:11:00"})
    ]);

    expect(builder.results.schedules[0].stopTimes.map(s => s.stop_sequence)).to.deep.equal([1, 2]);
  });

  /**
   * The reason `Cursor` remembers the CRS of the last stop rather than reading
   * it off the previous row. A passing point that is dropped leaves the row
   * before this one and the stop before this one at different stations, and a
   * builder comparing against the row would overwrite Tonbridge with Hildenborough.
   */
  it("does not let a dropped passing point make the next call collide with the last", () => {
    const builder = new ScheduleBuilder();

    builder.load([
      row({stop_id: 10, crs_code: "TBW"}),
      row({stop_id: 11, crs_code: "TON", public_arrival_time: "10:06:00", public_departure_time: "10:07:00"}),
      passing({stop_id: 12, crs_code: "HGR"}),
      row({stop_id: 13, crs_code: "HGR", public_arrival_time: "10:10:00", public_departure_time: "10:11:00"})
    ]);

    const stops = builder.results.schedules[0].stopTimes;

    expect(stops.map(s => s.stop_id)).to.deep.equal(["TBW", "TON", "HGR"]);
    expect(stops[1].arrival_time).to.equal("10:06:00");
    expect(stops[2].arrival_time).to.equal("10:10:00");
  });

});

/**
 * `Schedule.path` - every station the train touches, which is what the shapes
 * are drawn through. It is the same list whichever way the build treats the
 * passing points, which is the point of keeping it separate from the calls.
 */
describe("the path", () => {

  const passing = (overrides: object = {}) => row({
    public_arrival_time: null,
    public_departure_time: null,
    scheduled_arrival_time: null,
    scheduled_departure_time: null,
    scheduled_pass_time: "10:05:00",
    activity: "  ",
    ...overrides
  });

  const rows = [
    row({stop_id: 10, crs_code: "TBW"}),
    passing({stop_id: 11, crs_code: "TON"}),
    row({stop_id: 12, crs_code: "HGR", public_arrival_time: "10:10:00", public_departure_time: "10:11:00"})
  ];

  it("holds the stations the service runs through as well as the ones it calls at", () => {
    const builder = new ScheduleBuilder();

    builder.load(rows);

    expect(builder.results.schedules[0].path).to.deep.equal(["TBW", "TON", "HGR"]);
  });

  it("is the same whether or not the passing points reach the stop times", () => {
    const removing = new ScheduleBuilder();
    const keeping = new ScheduleBuilder(new Set(), false);

    removing.load(rows);
    keeping.load(rows);

    expect(removing.results.schedules[0].path).to.deep.equal(keeping.results.schedules[0].path);
  });

  /**
   * A station and the junction on its approach are two timing points and one
   * place, so the line is drawn through it once.
   */
  it("names a station once where two timing points share it", () => {
    const builder = new ScheduleBuilder();

    builder.load([
      row({stop_id: 10, crs_code: "TBW"}),
      passing({stop_id: 11, crs_code: "TON"}),
      row({stop_id: 12, crs_code: "TON", public_arrival_time: "10:06:00", public_departure_time: "10:07:00"})
    ]);

    expect(builder.results.schedules[0].path).to.deep.equal(["TBW", "TON"]);
  });

  it("leaves out a station that is not a place", () => {
    const builder = new ScheduleBuilder(new Set(["TON"]));

    builder.load([
      row({stop_id: 10, crs_code: "TBW"}),
      passing({stop_id: 11, crs_code: "TON"}),
      row({stop_id: 12, crs_code: "HGR", public_arrival_time: "10:10:00", public_departure_time: "10:11:00"})
    ]);

    expect(builder.results.schedules[0].path).to.deep.equal(["TBW", "HGR"]);
  });

  it("is empty for a cancellation, which goes nowhere", () => {
    const builder = new ScheduleBuilder();

    builder.load([row({stop_id: 10, crs_code: "TBW", stp_indicator: "C"})]);

    expect(builder.results.schedules[0].path).to.deep.equal([]);
  });

});
