import {Temporal} from "temporal-polyfill";
import {IdGenerator, STP} from "../model/OverlayRecord";
import {Schedule, tripId} from "../model/Schedule";
import {CRS, Duration, PickupDropOffType, RouteType, StopTime, parseDuration} from "@gb-transit/gtfs-schema";
import {NO_DAYS, ScheduleCalendar} from "../model/ScheduleCalendar";
import {ScheduleStopTimeRow} from "../source/TimetableSource";

const pickupActivities = ["T ", "TB", "U "];
const dropOffActivities = ["T ", "TF", "D "];
const requestStopActivity = "R ";
const notAdvertisedActivity = "N ";

/**
 * Where a run of rows for one schedule is accumulated.
 *
 * One per run, not one per builder: the MySQL source loads the passenger
 * schedules and the z-trains concurrently into the same builder, and two
 * interleaved streams sharing a cursor would splice each other's stop times into
 * the wrong trains.
 */
interface Cursor {
  stops: StopTime[];
  /**
   * The times of each stop in `stops` on both clocks, index for index. A
   * passing point is timed against them.
   */
  clocks: StopClocks[];
  /**
   * Every station the run has touched, calling or passing, in order - what
   * `Schedule.path` is built from.
   */
  path: CRS[];
  prevRow?: ScheduleStopTimeRow;
  departureHour: number;
  /**
   * Whether the last stop in `stops` is somewhere the service runs through
   * rather than calls at. Kept here because a StopTime does not say: a passing
   * point is a call with pickup_type and drop_off_type 1, and so is an
   * operational stop, and only one of the two should give way to a real call at
   * the same station.
   */
  lastIsPassing: boolean;
  /**
   * The CRS of the last stop in `stops`, which is what a row arriving at the
   * same station has to collide with to displace it.
   *
   * Not `prevRow.crs_code`: a passing row that the build is dropping never
   * becomes a stop, so the row before this one and the stop before this one are
   * no longer the same place.
   */
  lastStopCrs?: CRS;
}

/**
 * When a stop arrives and departs by the times the train runs to and by the
 * times the timetable publishes. A passing point is on the working clock only,
 * and all four are its pass time.
 */
interface StopClocks {
  passing: boolean;
  workingArrival: Duration;
  workingDeparture: Duration;
  publicArrival: Duration;
  publicDeparture: Duration;
}

/**
 * This class takes rows in the TimetableSource ordering and builds a list of Schedules.
 *
 * The ordering is the contract: rows for one schedule must be contiguous and in
 * stop sequence, and schedules must arrive stp_indicator DESC so a cancellation
 * or overlay follows the permanent record it replaces. The builder groups on
 * `id` changing, so a source that interleaves two schedules produces two trains
 * with each other's stops.
 */
export class ScheduleBuilder {
  private readonly schedules: Schedule[] = [];
  private maxId: number = 0;
  private droppedStops: number = 0;

  /**
   * `exclude` holds the CRS codes of stations that are not places - see
   * Placeholder. Their stop times are dropped here rather than at the source
   * because the z-train query takes its stop id straight from the ZTR location
   * and never meets physical_station, and every affected trip is a z-train.
   *
   * `removePassingPoints` decides whether a location the service runs through
   * becomes a stop time. It does not decide whether the source hands one over:
   * the path is built from every row either way, because a feed without passing
   * points in `stop_times.txt` still draws its shapes through them.
   */
  constructor(
    private readonly exclude: ReadonlySet<string> = new Set(),
    private readonly removePassingPoints: boolean = true
  ) {}

  /**
   * How many stop times were dropped for calling at a station that is not a
   * place. Reported rather than left silent: it is the only visible effect on
   * services, and a jump in it means the match has started catching something
   * it should not.
   */
  public get dropped(): number {
    return this.droppedStops;
  }

  private getTripId(row: ScheduleStopTimeRow) {
    return tripId(row.train_uid, new ScheduleCalendar(
      Temporal.PlainDate.from(row.runs_from),
      Temporal.PlainDate.from(row.runs_to),
      NO_DAYS
    ));
  }

  /**
   * Take a stream of ScheduleStopTimeRow, turn them into Schedule objects and add the result to the schedules
   */
  public loadSchedules(results: any): Promise<void> {
    return new Promise<void>((resolve, reject) => {
      const cursor = newCursor();
      let failed = false;

      results.on("result", (row: ScheduleStopTimeRow) => {
        // an error thrown from here is emitted inside the driver's packet parser, where it is
        // swallowed - the query then emits neither "end" nor "error" and this promise never
        // settles. Catch it so a bad row fails the build rather than hanging it forever.
        if (failed) return;

        try {
          this.processRow(cursor, row);
        }
        catch (err) {
          failed = true;
          reject(err);
        }
      });

      results.on("end", () => {
        if (failed) return;

        this.flush(cursor);
        resolve();
      });
      results.on("error", reject);
    });
  }

  /**
   * Take rows from anything iterable in the same order a stream would deliver
   * them. This is what a source that is not a database query uses.
   */
  public load(rows: Iterable<ScheduleStopTimeRow>): void {
    const cursor = newCursor();

    for (const row of rows) {
      this.processRow(cursor, row);
    }

    this.flush(cursor);
  }

  /**
   * Take rows from an async iterable, in the same order a stream would deliver
   * them. This is what a query builder that yields rows rather than emitting
   * them uses, where loadSchedules takes a driver's own emitter.
   */
  public async loadStream(rows: AsyncIterable<ScheduleStopTimeRow>): Promise<void> {
    const cursor = newCursor();

    for await (const row of rows) {
      this.processRow(cursor, row);
    }

    this.flush(cursor);
  }

  private processRow(cursor: Cursor, row: ScheduleStopTimeRow): void {
    const startsSchedule = !cursor.prevRow || cursor.prevRow.id !== row.id;

    if (cursor.prevRow && startsSchedule) {
      this.schedules.push(this.createSchedule(cursor.prevRow, cursor.stops, cursor.clocks, cursor.path));
      cursor.stops = [];
      cursor.clocks = [];
      cursor.path = [];
      cursor.lastIsPassing = false;
      cursor.lastStopCrs = undefined;
    }

    // The origin's departure hour decides whether a later stop has rolled over
    // midnight, so it is taken from the first row of every schedule - including
    // the first schedule in the run.
    if (startsSchedule) {
      cursor.departureHour = row.public_arrival_time
        ? parseInt(row.public_arrival_time.substr(0, 2), 10)
        : row.public_departure_time ? parseInt(row.public_departure_time.substr(0, 2), 10) : 4;
    }

    // A schedule with no stop times is returned as a single row with every stop_time
    // column null, because getSchedules keeps them with `stop_time.id IS NULL`. There is
    // no stop to build from that row, and the schedule is dropped later on when it turns
    // out to have fewer than two stops.
    if (row.stp_indicator !== STP.Cancellation && row.stop_id !== null && this.exclude.has(row.crs_code)) {
      this.droppedStops++;
    }
    else if (row.stp_indicator !== STP.Cancellation && row.stop_id !== null) {
      const passing = !!row.scheduled_pass_time;

      // The same CRS twice running is one place on the ground, whichever of the
      // two timing points the feed goes on to keep, so the line is drawn
      // through it once.
      if (cursor.path[cursor.path.length - 1] !== row.crs_code) {
        cursor.path.push(row.crs_code);
      }

      // A location the service runs through is on the path and nowhere else,
      // unless the build asked for it. The path is the whole of what a feed
      // without passing points wants from one.
      if (!passing || !this.removePassingPoints) {
        this.addStop(cursor, row, passing);
      }
    }

    cursor.prevRow = row;
  }

  private addStop(cursor: Cursor, row: ScheduleStopTimeRow, passing: boolean): void {
    if (cursor.stops.length > 0 && row.crs_code === cursor.lastStopCrs) {
      const stop = this.createStop(row, cursor.stops.length, cursor.departureHour);
      const clock = this.createClock(row, stop, cursor.departureHour);

      // Two timing points of one service can share a CRS - a station and the
      // junction on its approach - and only one of them belongs in the feed.
      // The one that boards or alights wins, and anything the service actually
      // calls at beats one it only runs through: without that second clause a
      // passing point displaced 28 request stops, which board on request and so
      // have no Scheduled to win with.
      if (stop.pickup_type === PickupDropOffType.Scheduled
        || stop.drop_off_type === PickupDropOffType.Scheduled
        || (cursor.lastIsPassing && !passing)) {
        cursor.stops[cursor.stops.length - 1] = stop;
        cursor.clocks[cursor.clocks.length - 1] = clock;
        cursor.lastIsPassing = passing;
      }

      return;
    }

    const stop = this.createStop(row, cursor.stops.length + 1, cursor.departureHour);

    cursor.stops.push(stop);
    cursor.clocks.push(this.createClock(row, stop, cursor.departureHour));
    cursor.lastIsPassing = passing;
    cursor.lastStopCrs = row.crs_code;
  }

  private flush(cursor: Cursor): void {
    if (cursor.prevRow) {
      this.schedules.push(this.createSchedule(cursor.prevRow, cursor.stops, cursor.clocks, cursor.path));
      cursor.prevRow = undefined;
      cursor.stops = [];
      cursor.clocks = [];
      cursor.path = [];
      cursor.lastIsPassing = false;
      cursor.lastStopCrs = undefined;
    }
  }

  private createSchedule(row: ScheduleStopTimeRow, stops: StopTime[], clocks: StopClocks[], path: CRS[]): Schedule {
    this.maxId = Math.max(this.maxId, row.id);

    if (!this.removePassingPoints) {
      onPublicClock(stops, clocks);
    }

    const mode = routeTypeIndex.hasOwnProperty(row.train_category) ? routeTypeIndex[row.train_category] : RouteType.Rail;

    return new Schedule(
      row.id,
      stops,
      row.train_uid,
      row.retail_train_id,
      new ScheduleCalendar(
        Temporal.PlainDate.from(row.runs_from),
        Temporal.PlainDate.from(row.runs_to),
        {
          0: row.sunday,
          1: row.monday,
          2: row.tuesday,
          3: row.wednesday,
          4: row.thursday,
          5: row.friday,
          6: row.saturday
        }
      ),
      mode,
      row.atoc_code ?? "ZZ",
      row.stp_indicator,
      mode === RouteType.Rail && row.train_class !== "S",
      row.reservations !== null,
      path
    );
  }

  private static getPickupDropOffType(activity: string, pickupOrDropOffActivities: string[]): PickupDropOffType {
    if (hasActivity(activity, notAdvertisedActivity)) {
      return PickupDropOffType.None;
    }

    if (hasActivity(activity, requestStopActivity)) {
      return PickupDropOffType.CoordinateWithDriver;
    }

    return pickupOrDropOffActivities.some(a => hasActivity(activity, a))
      ? PickupDropOffType.Scheduled
      : PickupDropOffType.None;
  }

  private createStop(row: ScheduleStopTimeRow, stopId: number, departHour: number): StopTime {
    let arrivalTime, departureTime;

    // A passing point has no arrival and no departure of any kind - the service
    // does not stop, so the pass time is the only time it has, and it is both
    // until onPublicClock moves it. Checked first because the other two
    // branches would find nothing.
    if (row.scheduled_pass_time) {
      arrivalTime = departureTime = this.formatTime(row.scheduled_pass_time, departHour);
    }
    // if either public time is set, use those
    else if (row.public_arrival_time || row.public_departure_time) {
      arrivalTime = this.formatTime(row.public_arrival_time, departHour);
      departureTime = this.formatTime(row.public_departure_time, departHour);
    }
    // if no public time at all (no set down or pick) use the scheduled time
    else {
      arrivalTime = this.formatTime(row.scheduled_arrival_time, departHour);
      departureTime = this.formatTime(row.scheduled_departure_time, departHour);
    }

    const arrival = arrivalTime || departureTime;
    const departure = departureTime || arrivalTime;

    if (arrival === null || departure === null) {
      throw new Error(`Stop ${row.crs_code} on trip ${row.id} has no arrival or departure time`);
    }

    return {
      trip_id: this.getTripId(row),
      arrival_time: arrival,
      departure_time: departure,
      stop_id: row.crs_code,
      stop_sequence: stopId,
      // Not the platform. stop_headsign overrides the trip headsign at a stop -
      // it means "this service terminates here", not "platform 3". The platform
      // belongs on a platform-level stop, which needs the station hierarchy.
      stop_headsign: null,
      // A passing point's activity is blank in 885,596 of the 892,016 that are
      // at a station, and the rest are X and A - passing or waiting for another
      // train. None of them is a pickup or a drop off activity, so the mapping
      // already gives a passing point pickup_type 1 and drop_off_type 1 without
      // being told what it is looking at.
      pickup_type: ScheduleBuilder.getPickupDropOffType(row.activity, pickupActivities),
      drop_off_type: ScheduleBuilder.getPickupDropOffType(row.activity, dropOffActivities),
      shape_dist_traveled: null,
      // A passing point's time is placed between the published times either
      // side of it, which makes it an estimate - see onPublicClock.
      timepoint: row.scheduled_pass_time ? 0 : 1,
      // A passing point names its platform like any other call. 461,901 of them
      // give one, and the platform a train runs through is a real platform: 89%
      // of passing calls land on a boarding point the feed already publishes
      // because something stops there, so the id a passing call carries is the
      // one a stopping call at that platform carries. Anything promoting a
      // passing point to a real stop needs no translation.
      //
      // It also produces fewer stops, not more. Dropping the platform forced 99
      // station-level children into existence with nothing but passing calls to
      // host; keeping it reuses what is there and mints 12 - Pilning 2, New
      // Cross Gate 3 and 4, Wembley Central 3 and 4, and eight more, all real
      // platforms that this window happens to have no calls at.
      platform: row.platform,
      tiploc: row.tiploc
    };
  }

  /**
   * A call's times on both clocks. Where the source gives no working time the
   * published one stands in for it.
   *
   * A call published at only one end is set down only or picked up only, and
   * its one public time need not be when the train arrives, nor when it leaves.
   * It is nearer one end of the working dwell than the other, and both ends are
   * offset from their working times by as much: the Night Riviera sets down at
   * Reading from a public and working 03:12 and stands until a working 04:18,
   * so it leaves at 04:18 on either clock; the sleeper from Scotland reaches
   * Preston at a working 03:51 and sets down from a public 04:20, two minutes
   * before its working 04:22, so on the public clock it arrives at 03:49 and
   * leaves at 04:20.
   */
  private createClock(row: ScheduleStopTimeRow, stop: StopTime, departHour: number): StopClocks {
    if (row.scheduled_pass_time) {
      const pass = parseDuration(stop.arrival_time);

      return {passing: true, workingArrival: pass, workingDeparture: pass, publicArrival: pass, publicDeparture: pass};
    }

    const arrival = this.formatTime(row.scheduled_arrival_time ?? row.scheduled_departure_time, departHour);
    const departure = this.formatTime(row.scheduled_departure_time ?? row.scheduled_arrival_time, departHour);
    const workingArrival = parseDuration(arrival ?? stop.arrival_time);
    const workingDeparture = parseDuration(departure ?? stop.departure_time);
    const clocks = {passing: false, workingArrival, workingDeparture};

    if (!row.public_arrival_time === !row.public_departure_time) {
      return {...clocks, publicArrival: parseDuration(stop.arrival_time), publicDeparture: parseDuration(stop.departure_time)};
    }

    const published = parseDuration(row.public_arrival_time ? stop.arrival_time : stop.departure_time);
    const offset = Math.abs(published - workingArrival) <= Math.abs(published - workingDeparture)
      ? published - workingArrival
      : published - workingDeparture;

    return {...clocks, publicArrival: workingArrival + offset, publicDeparture: workingDeparture + offset};
  }

  private formatTime(time: string | null, originDepartureHour: number) {
    if (time === null) return null;

    const departureHour = parseInt(time.substr(0, 2), 10);

    // if the service started after 4am and after the current stops departure hour we've probably rolled over midnight
    if (originDepartureHour >= 4 && originDepartureHour > departureHour) {
      return (departureHour + 24) + time.substr(2);
    }

    return time;
  }

  public get results(): ScheduleResults {
    return {
      schedules: this.schedules,
      idGenerator: this.getIdGenerator(this.maxId)
    };
  }

  private *getIdGenerator(startId: number): IterableIterator<number> {
    let id = startId + 1;
    while (true) {
      yield id++;
    }
  }
}

export interface ScheduleResults {
  schedules: Schedule[],
  idGenerator: IdGenerator
}

const routeTypeIndex: { [trainCategory: string]: RouteType } = {
  "OO": RouteType.Rail,
  "XX": RouteType.Rail,
  "XZ": RouteType.Rail,
  "BR": RouteType.ReplacementBus,
  "BS": RouteType.Bus,
  "OL": RouteType.Subway,
  "XC": RouteType.Rail,
  "SS": RouteType.Ferry
};

function newCursor(): Cursor {
  return {stops: [], clocks: [], path: [], departureHour: 4, lastIsPassing: false};
}

/**
 * Put each passing point on the clock the calls around it are published on.
 *
 * A call is published at its public time and a passing point has only its
 * working time, and the two clocks can be a quarter of an hour apart: C02035
 * sets down at Doncaster from a public 00:35 and a working 00:49½, so its
 * working pass of Adwick at 00:55½ would be published after its public arrival
 * at Wakefield Westgate, 00:52. The calls either side say how one clock maps
 * onto the other over that stretch, so a passing point keeps its share of the
 * working time between them: Adwick, 4 of the 15 working minutes out of
 * Doncaster, is published at 00:41. Where the two clocks agree, nothing moves.
 *
 * A trip whose first or last stop the source gives as a pass - its origin has
 * no CRS, or is a station that is not a place - has passes with a call on one
 * side only. They move by that call's own difference between the clocks.
 *
 * A pass is never published before the departure of the call behind it, after
 * the arrival of the call ahead of it, or before the pass ahead of it, so a
 * trip never runs backwards through a location it does not stop at - including
 * where the source times one outside the calls either side. A trip with no
 * call at all keeps its working times.
 */
function onPublicClock(stops: StopTime[], clocks: StopClocks[]): void {
  const calls = clocks.flatMap((clock, i) => clock.passing ? [] : [i]);

  if (calls.length === 0) return;

  retimeBefore(stops, clocks, calls[0]);

  for (let i = 1; i < calls.length; i++) {
    if (calls[i] - calls[i - 1] > 1) {
      retimeBetween(stops, clocks, calls[i - 1], calls[i]);
    }
  }

  retimeAfter(stops, clocks, calls[calls.length - 1]);
}

function retimeBefore(stops: StopTime[], clocks: StopClocks[], to: number): void {
  const latest = parseDuration(stops[to].arrival_time);
  const offset = Math.min(clocks[to].publicArrival, latest) - clocks[to].workingArrival;
  let next = latest;

  for (let i = to - 1; i >= 0; i--) {
    const time = Math.min(halfMinute(clocks[i].workingArrival + offset), next);

    stops[i].arrival_time = stops[i].departure_time = clockTime(time);
    next = time;
  }
}

function retimeAfter(stops: StopTime[], clocks: StopClocks[], from: number): void {
  const earliest = parseDuration(stops[from].departure_time);
  const offset = Math.max(clocks[from].publicDeparture, earliest) - clocks[from].workingDeparture;
  let previous = earliest;

  for (let i = from + 1; i < stops.length; i++) {
    const time = Math.max(halfMinute(clocks[i].workingDeparture + offset), previous);

    stops[i].arrival_time = stops[i].departure_time = clockTime(time);
    previous = time;
  }
}

function retimeBetween(stops: StopTime[], clocks: StopClocks[], from: number, to: number): void {
  const earliest = parseDuration(stops[from].departure_time);
  const latest = Math.max(earliest, parseDuration(stops[to].arrival_time));
  const publicStart = clamp(clocks[from].publicDeparture, earliest, latest);
  const publicEnd = clamp(clocks[to].publicArrival, publicStart, latest);
  const workingStart = clocks[from].workingDeparture;
  const workingLength = clocks[to].workingArrival - workingStart;
  let previous = publicStart;

  for (let i = from + 1; i < to; i++) {
    const share = workingLength > 0 ? clamp((clocks[i].workingArrival - workingStart) / workingLength, 0, 1) : 0;
    const time = clamp(halfMinute(publicStart + share * (publicEnd - publicStart)), previous, publicEnd);

    stops[i].arrival_time = stops[i].departure_time = clockTime(time);
    previous = time;
  }
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

function halfMinute(time: Duration): Duration {
  return Math.round(time / 30) * 30;
}

function clockTime(time: Duration): string {
  const pad = (n: number) => String(n).padStart(2, "0");

  return `${pad(Math.floor(time / 3600))}:${pad(Math.floor(time / 60) % 60)}:${pad(time % 60)}`;
}

function hasActivity(activity: string, code: string): boolean {
  for (let i = 0; i < activity.length; i += 2) {
    if (activity.startsWith(code, i)) {
      return true;
    }
  }

  return false;
}
