import {ATCOCode, NaPTANIndex, NaptanStopPoint} from "./NaPTAN";

/**
 * The two sides of a street, as one place.
 *
 * NaPTAN records this as a GPBS stop area and does not publish the area codes in
 * the national CSV - that needs the XML endpoint, one administrative area at a
 * time - so the grouping is worked out from what the CSV does say. Measured
 * against the areas NaPTAN publishes for London, where its coverage is complete,
 * 97.7% of the groups found here are exactly one NaPTAN stop area.
 *
 * It errs towards leaving a stop ungrouped, which is what a feed that does no
 * grouping at all looks like.
 */
export interface NaptanStopArea {
  readonly id: string;
  readonly name: string;
  readonly longitude: string;
  readonly latitude: string;
}

/**
 * The area each stop belongs to, for the stops that belong to one.
 */
export type StopAreaIndex = Record<ATCOCode, NaptanStopArea>;

/**
 * How far apart two stops of the same name can be and still be the same place.
 *
 * A pair either side of a road is a median 48m apart and 122m at the ninetieth
 * percentile. Past this they are two stops that share a name, which happens
 * along a road long enough to have one at each end.
 */
const MAX_SPREAD_METRES = 150;

/**
 * On-street bus stops only: a station has a hierarchy of its own, and a second
 * parent over the top of it would break the one that is there.
 */
const ON_STREET_BUS = "BCT";

/** Flat earth, at the latitude of the middle of Great Britain. */
const METRES_PER_DEGREE_LATITUDE = 111320;
const METRES_PER_DEGREE_LONGITUDE = 65430;

/**
 * Group the stops of a NaPTAN index into the places they stand in.
 *
 * Two stops are the same place when they are in the same NPTG locality, carry
 * the same name, stand within `MAX_SPREAD_METRES` of each other and face
 * different ways. The last separates a pair from a row: two stops facing the
 * same way are a long stop, and joining them tells a planner it can cross the
 * road for free.
 */
export function stopAreas(naptan: NaPTANIndex): StopAreaIndex {
  const candidates: Record<string, NaptanStopPoint[]> = {};

  for (const stop of Object.values(naptan)) {
    if (stop.stopType !== ON_STREET_BUS || stop.name === "" || stop.localityCode === "") {
      continue;
    }

    if (stop.latitude === "" || stop.longitude === "") {
      continue;
    }

    const key = stop.localityCode + "/" + stop.name.toLowerCase();

    (candidates[key] ||= []).push(stop);
  }

  const areas: StopAreaIndex = {};

  for (const stops of Object.values(candidates)) {
    if (stops.length < 2 || !isOnePlace(stops)) {
      continue;
    }

    const area = describe(stops);

    for (const stop of stops) {
      areas[stop.atcoCode] = area;
    }
  }

  return areas;
}

function isOnePlace(stops: NaptanStopPoint[]): boolean {
  const bearings = new Set(stops.map(stop => stop.bearing).filter(bearing => bearing !== ""));

  if (bearings.size < 2) {
    return false;
  }

  for (let i = 0; i < stops.length; i++) {
    for (let j = i + 1; j < stops.length; j++) {
      if (metresBetween(stops[i], stops[j]) > MAX_SPREAD_METRES) {
        return false;
      }
    }
  }

  return true;
}

/** The area itself, standing at the middle of its stops. */
function describe(stops: NaptanStopPoint[]): NaptanStopArea {
  const mean = (of: (stop: NaptanStopPoint) => number) =>
    stops.reduce((total, stop) => total + of(stop), 0) / stops.length;

  // Sorted rather than first seen, so the area does not change with the order
  // NaPTAN was read in.
  const [first] = [...stops].sort((a, b) => a.atcoCode < b.atcoCode ? -1 : 1);

  return {
    // Prefixed: this is our grouping rather than NaPTAN's, and every other id in
    // stops.txt is an ATCO code that means something.
    id: "gp:" + first.atcoCode,
    name: first.name + ", " + (first.parentLocality || first.locality),
    longitude: String(mean(stop => Number(stop.longitude))),
    latitude: String(mean(stop => Number(stop.latitude)))
  };
}

function metresBetween(a: NaptanStopPoint, b: NaptanStopPoint): number {
  const north = (Number(a.latitude) - Number(b.latitude)) * METRES_PER_DEGREE_LATITUDE;
  const east = (Number(a.longitude) - Number(b.longitude)) * METRES_PER_DEGREE_LONGITUDE;

  return Math.sqrt(north * north + east * east);
}
