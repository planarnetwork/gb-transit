import { SECONDS_IN_DAY } from "@gb-transit/gtfs-schema/scalars";
import type { ShapeID, ShapeIndex, ShapePoint, Stop, StopID, StopIndex, StopTime, Trip, TripID, TripLink } from "./GTFS.js";
import { LinkedService, type ServiceCalendar } from "./Service.js";

/**
 * The trips a passenger can stay on across a coupling, one per link.
 *
 * A link says a vehicle carries on as another trip, so staying on it is a trip in its own right:
 * the arriving trip's calls up to the coupling, then the departing trip's. The two trips are left
 * as they are and the through trip is added alongside them, because each still runs alone on the
 * days the other does not, and each is still boarded by passengers who really do change.
 *
 * A trip tells its times in its own service day, so a portion leaving after midnight departs
 * earlier in the day than the trip it continues arrived. It is moved onto the arriving trip's day,
 * forwards only, so that the through trip reads from its first call however the feed dated it.
 *
 * The through trip is the train the passenger boarded, so it keeps the arriving trip's route and
 * headcode, and it goes where the departing trip goes, so it takes that one's headsign. Its shape is
 * the two trips' shapes joined at the coupling, which `linkShapes` makes.
 */
export function linkTrips(
  trips: Trip[],
  links: TripLink[],
  station: (stop: StopID) => StopID
): Trip[] {
  if (links.length === 0) {
    return [];
  }

  const byId = index(trips, links);
  const dayEarlier = new Map<ServiceCalendar, ServiceCalendar>();
  const linked: Trip[] = [];

  for (const link of links) {
    const from = byId.get(link.fromTripId);
    const to = byId.get(link.toTripId);

    if (from === undefined || to === undefined) {
      continue;
    }

    const alights = indexOfStop(from.stopTimes, link.fromStop, station, true);
    const boards = indexOfStop(to.stopTimes, link.toStop, station, false);

    if (alights === -1 || boards === -1) {
      continue;
    }

    const arrival = from.stopTimes[alights].arrivalTime;
    const departure = to.stopTimes[boards].departureTime;
    const shift = departure < arrival ? SECONDS_IN_DAY : 0;

    // a coupling more than a day apart is not one a day's shift can put in order
    if (departure + shift < arrival) {
      continue;
    }

    linked.push({
      tripId: `${from.tripId}_${to.tripId}`,
      serviceId: `${from.serviceId}_${to.serviceId}`,
      stopTimes: join(from.stopTimes, alights, to.stopTimes, boards, shift),
      service: new LinkedService(from.service, shift === 0 ? to.service : earlier(dayEarlier, to.service)),
      routeId: from.routeId,
      shortName: from.shortName,
      headsign: to.headsign,
      shapeId: linkedShapeId(from, to, link)
    });
  }

  return linked;
}

/**
 * The shapes of the trips a coupling makes, keyed as `linkTrips` names them: the arriving trip's
 * shape as far as the coupling, then the departing trip's from it.
 *
 * Shapes rarely say how far along them each call is, so the coupling is found by where it is: the
 * last point of the arriving shape nearest the stop the link names, and the first of the departing
 * one. A link that names no stop joins the shapes end to end. Couplings between the same two shapes
 * at the same stops make one shape.
 */
export function linkShapes(trips: Trip[], links: TripLink[], shapes: ShapeIndex, stops: StopIndex): ShapeIndex {
  const linked: ShapeIndex = {};

  if (links.length === 0) {
    return linked;
  }

  const byId = index(trips, links);

  for (const link of links) {
    const from = byId.get(link.fromTripId);
    const to = byId.get(link.toTripId);

    if (from === undefined || to === undefined) {
      continue;
    }

    const id = linkedShapeId(from, to, link);
    const arriving = shapes[from.shapeId ?? ""];
    const departing = shapes[to.shapeId ?? ""];

    if (id === undefined || linked[id] !== undefined || arriving === undefined || departing === undefined) {
      continue;
    }

    const end = nearestPoint(arriving, stops[link.fromStop ?? ""], true) ?? arriving.length - 1;
    const start = nearestPoint(departing, stops[link.toStop ?? ""], false) ?? 0;
    const joint = arriving[end];
    const first = departing[start];
    const repeated = joint.latitude === first.latitude && joint.longitude === first.longitude;

    linked[id] = [...arriving.slice(0, end + 1), ...departing.slice(repeated ? start + 1 : start)];
  }

  return linked;
}

/**
 * The shape of the trip a coupling makes, named after the two shapes it joins and where. The same two
 * trains can couple at one station on some dates and another on others, and those are different
 * lines.
 */
function linkedShapeId(from: Trip, to: Trip, link: TripLink): ShapeID | undefined {
  if (from.shapeId === undefined || to.shapeId === undefined) {
    return undefined;
  }

  return link.fromStop === undefined || link.toStop === undefined
    ? `${from.shapeId}_${to.shapeId}`
    : `${from.shapeId}_${to.shapeId}_${link.fromStop}_${link.toStop}`;
}

/**
 * The index of the point nearest the stop, the last of equally near points or the first. Nothing
 * where there is no stop to be near.
 */
function nearestPoint(shape: ShapePoint[], stop: Stop | undefined, last: boolean): number | undefined {
  if (stop === undefined) {
    return undefined;
  }

  // near enough to flat over the distance between two points of a line, and only ever compared
  const scale = Math.cos(stop.latitude * Math.PI / 180);
  let nearest = 0;
  let distance = Number.POSITIVE_INFINITY;

  for (let i = 0; i < shape.length; i++) {
    const d = (shape[i].latitude - stop.latitude) ** 2 + ((shape[i].longitude - stop.longitude) * scale) ** 2;

    if (d < distance || (last && d === distance)) {
      nearest = i;
      distance = d;
    }
  }

  return nearest;
}

/**
 * Every trip a link names.
 *
 * Planning for a single date keeps only the trips running on it, and a portion leaving after
 * midnight runs on the day after the trip it continues, so the coupled trips are kept whatever date
 * is planned for. The calendar still decides which of them can be boarded.
 */
export function coupledTripIds(links: TripLink[]): Set<TripID> {
  const ids = new Set<TripID>();

  for (const link of links) {
    ids.add(link.fromTripId);
    ids.add(link.toTripId);
  }

  return ids;
}

/**
 * The trips the links name. Only a few thousand trips of a feed's hundreds of thousands are coupled,
 * so they are picked out rather than all of them indexed.
 */
function index(trips: Trip[], links: TripLink[]): Map<TripID, Trip> {
  const wanted = coupledTripIds(links);
  const byId = new Map<TripID, Trip>();

  for (const trip of trips) {
    if (wanted.has(trip.tripId)) {
      byId.set(trip.tripId, trip);
    }
  }

  return byId;
}

/**
 * The two trips' calls as one, sharing a single call at the coupling: the passenger arrives on the
 * first trip and leaves on the second, so that call is set down by one and picked up by the other.
 */
function join(
  from: StopTime[],
  alights: number,
  to: StopTime[],
  boards: number,
  shift: number
): StopTime[] {
  const stopTimes = from.slice(0, alights);

  stopTimes.push({
    ...from[alights],
    departureTime: to[boards].departureTime + shift,
    pickUp: to[boards].pickUp
  });

  for (let i = boards + 1; i < to.length; i++) {
    stopTimes.push(shift === 0 ? to[i] : {
      ...to[i],
      arrivalTime: to[i].arrivalTime + shift,
      departureTime: to[i].departureTime + shift
    });
  }

  return stopTimes;
}

/**
 * Where the coupling is within a trip: the last call there for the trip being left, the first for
 * the one being joined, which is as far as the passenger rides one and as early as they board the
 * other. A link that names no stop couples the trips end to end.
 */
function indexOfStop(
  stopTimes: StopTime[],
  stop: StopID | undefined,
  station: (stop: StopID) => StopID,
  last: boolean
): number {
  if (stop === undefined) {
    return last ? stopTimes.length - 1 : 0;
  }

  const at = station(stop);

  for (let i = 0; i < stopTimes.length; i++) {
    const position = last ? stopTimes.length - 1 - i : i;

    if (station(stopTimes[position].stop) === at) {
      return position;
    }
  }

  return -1;
}

function earlier(
  cache: Map<ServiceCalendar, ServiceCalendar>,
  service: ServiceCalendar
): ServiceCalendar {
  let shifted = cache.get(service);

  if (shifted === undefined) {
    shifted = service.dayEarlier();
    cache.set(service, shifted);
  }

  return shifted;
}
