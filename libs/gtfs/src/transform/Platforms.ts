import {CRS, Platform, Stop, StopID, StopTime, StopTimeRow, TIPLOC} from "@gb-transit/gtfs-schema";
import {Schedule} from "../model/Schedule";
import {stopPointId} from "./Atco";

/**
 * A platform designation the feed can build a boarding facility from.
 *
 * `1`, `13`, `A`, `3A`, `4B` are platforms. `DF`, `UM`, `DPL`, `UGL` are running
 * lines - which track a service takes through a junction - and 45 of the 3,750
 * station-platform pairs are those. A passenger cannot stand on a running line,
 * so a call carrying one is treated as naming no platform.
 *
 * `BAY` is a real designation and does not match. It is a deliberate casualty
 * rather than a special case, and worth revisiting.
 */
const PLATFORM = /^([0-9]{1,2}[A-Z]?|[A-Z])$/;

/**
 * The stations, and the boarding points a service actually calls at.
 *
 * The GTFS best practice for a station with several boarding facilities is the
 * structure the spec already defines: the station is `location_type=1`, each
 * boarding point is `location_type=0` with `parent_station` pointing at it, and
 * the child's name identifies both.
 *
 * **Every call gets a child, whether or not it names a platform.** A stop time
 * may not reference a `location_type=1` stop, so a station where some calls name
 * a platform and some do not needs somewhere for the others to point: that is
 * the child with no platform in its id, `9100CLPHMJC`, a sibling of
 * `9100CLPHMJC15`. Without it a station like that could not be split at all -
 * splitting one regardless produced 907 `location_with_unexpected_stop_time`
 * errors - and 909 stations kept their platforms out of the feed.
 *
 * The TIPLOC is the timing point's own, so the boarding points at Clapham
 * Junction are `9100CLPHMJC15`, `9100CLPHMJW3` and `9100CLPHMJM11` under
 * `910GCLPHMJC` - the West London and Main Line platforms named as NaPTAN names
 * them, rather than flattened onto the station's TIPLOC.
 *
 * Nothing here touches a stop time. The child's id belongs to stop_times.txt and
 * is composed by `stopId` when the file is written, so overlays, associations
 * and merges only ever see the CRS. **Keep it that way**: an association names a
 * bare CRS, so a stop id carrying a platform stops every association matching,
 * silently.
 */
export function withStopPoints(stations: Stop[], schedules: Schedule[]): Stop[] {
  const byCrs = new Map(stations.map(station => [station.crs, station]));
  const called = new Map<StopID, Point>();

  for (const schedule of schedules) {
    for (const stopTime of schedule.stopTimes) {
      const station = byCrs.get(stopTime.stop_id);

      if (station === undefined) {
        continue;
      }

      const point = {
        crs: station.crs,
        tiploc: stopTime.tiploc ?? station.tiploc,
        platform: platformOf(stopTime)
      };

      claim(called, stopPointId(point.tiploc, point.platform), point);
    }
  }

  // Two stations sharing a TIPLOC would share a stop_id the same way two
  // boarding points can, and the source picks one TIPLOC per CRS without
  // promising it picked a different one each time.
  const held = new Map<StopID, Point>();

  for (const station of stations) {
    claim(held, station.stop_id, {crs: station.crs, tiploc: station.tiploc, platform: null});
  }

  // A station is location_type=1 whether or not anything calls at it, so the
  // feed says the same thing about every station and transfers.txt references
  // one kind of stop. Returned as new objects rather than set on the caller's:
  // nothing here owns the input.
  const parents = stations.map(station => ({...station, location_type: 1 as const}));
  const children: Stop[] = [];

  for (const [stop_id, {crs, tiploc, platform}] of called) {
    const station = byCrs.get(crs)!;

    children.push({
      ...station,
      stop_id,
      tiploc,
      stop_name: platform === null ? station.stop_name : `${station.stop_name} Platform ${platform}`,
      location_type: 0,
      parent_station: station.stop_id,
      platform_code: platform,
      // On a child stop the spec reads `1` as "there is an accessible path
      // from outside to this platform" and `0` as "ask the station". Every
      // source here answers for the station as a whole - a category B3 station
      // is step-free to some of its platforms and nobody says which - so
      // copying its value down asserts something about each platform that
      // nothing knows. `0` points the reader at the station, which is where
      // the answer actually is.
      wheelchair_boarding: 0
    });
  }

  console.log(`Published ${parents.length} stations with ${children.length} boarding points beneath them`);

  return [...parents, ...children];
}

/**
 * Somewhere a train calls, before it is a Stop: which station it belongs to,
 * the timing point it is, and the platform if it is one.
 */
interface Point {
  readonly crs: CRS;
  readonly tiploc: TIPLOC;
  readonly platform: Platform | null;
}

/**
 * Record that a point holds an id, and refuse to let two of them hold the same.
 *
 * An ATCO code is a concatenation - `9100` and the TIPLOC and the platform - so
 * a TIPLOC ending in a digit can in principle produce the id another TIPLOC and
 * platform produce: `CLPHMJM` platform 11 and `CLPHMJM1` platform 1 are both
 * `9100CLPHMJM11`. Nothing in the feed collides today. If something ever does,
 * two timing points quietly become one stop, or two stations publish the same
 * `stop_id` and the feed fails a validator a long way from here. Say which two.
 */
function claim(claimed: Map<StopID, Point>, id: StopID, point: Point): void {
  const holder = claimed.get(id);

  if (holder === undefined) {
    claimed.set(id, point);

    return;
  }

  if (holder.crs !== point.crs || holder.tiploc !== point.tiploc || holder.platform !== point.platform) {
    throw new Error(
      `${id} is both ${describe(holder)} and ${describe(point)}. Two stops cannot share an id.`
    );
  }
}

function describe(point: Point): string {
  return `${point.crs}/${point.tiploc}${point.platform === null ? "" : ` platform ${point.platform}`}`;
}

/**
 * The stop id a call is written against: the boarding point beneath the station,
 * which is the platform where the call names one.
 *
 * `tiplocs` stands in for the calls the source could not give a TIPLOC for - a
 * z-train's location is a CRS code already - and is the same fallback
 * `withStopPoints` applied, so the id is one it declared.
 */
export function stopId(stopTime: StopTime, tiplocs: ReadonlyMap<CRS, TIPLOC>): string {
  const tiploc = stopTime.tiploc ?? tiplocs.get(stopTime.stop_id);

  return tiploc === undefined ? stopTime.stop_id : stopPointId(tiploc, platformOf(stopTime));
}

/**
 * The platform a call names, or null where it names none and where what it names
 * is not a platform.
 */
export function platformOf(stopTime: StopTime): Platform | null {
  return stopTime.platform !== null && PLATFORM.test(stopTime.platform) ? stopTime.platform : null;
}

/**
 * stop_times.txt as it is written: the platform decides the stop id and is not
 * a column of its own.
 */
export function toStopTimeRow(stopTime: StopTime, tiplocs: ReadonlyMap<CRS, TIPLOC>): StopTimeRow {
  return {
    trip_id: stopTime.trip_id,
    arrival_time: stopTime.arrival_time,
    departure_time: stopTime.departure_time,
    stop_id: stopId(stopTime, tiplocs),
    stop_sequence: stopTime.stop_sequence,
    stop_headsign: stopTime.stop_headsign,
    pickup_type: stopTime.pickup_type,
    drop_off_type: stopTime.drop_off_type,
    shape_dist_traveled: stopTime.shape_dist_traveled,
    timepoint: stopTime.timepoint
  };
}
