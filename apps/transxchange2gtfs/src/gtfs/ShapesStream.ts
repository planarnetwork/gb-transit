import {ShapeRow} from "@gb-transit/gtfs-schema";
import {RowStream} from "./RowStream";
import {SHAPES} from "./TxcFeed";
import {TransXChangeJourney} from "../transxchange/TransXChangeJourneyStream";
import {shapeIdOf} from "./ShapeId";
import {Location, RouteLink} from "../transxchange/TransXChange";
import {NaPTANIndex} from "../reference/NaPTAN";
import {StopAreaIndex} from "../reference/StopAreas";
import {stopPosition} from "../reference/StopPosition";

// https://stackoverflow.com/questions/18883601/function-to-calculate-distance-between-two-coordinates
function getDistanceFromLatLonInM(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const R = 6371000; // Radius of the earth in metres
  const dLat = deg2rad(lat2 - lat1);
  const dLon = deg2rad(lon2 - lon1);
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(deg2rad(lat1)) * Math.cos(deg2rad(lat2)) *
    Math.sin(dLon / 2) * Math.sin(dLon / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
}

function deg2rad(deg: number): number {
  return deg * (Math.PI / 180);
}

function between(a: Location, b: Location): number {
  return getDistanceFromLatLonInM(a.Latitude, a.Longitude, b.Latitude, b.Longitude);
}

/** How far along a line of points each point is, from the first. */
function along(locations: Location[]): number[] {
  const distances: number[] = [];
  let travelled = 0;

  for (const [i, location] of locations.entries()) {
    travelled += i === 0 ? 0 : between(locations[i - 1], location);
    distances.push(travelled);
  }

  return distances;
}

/** A point of a shape, and how far along its link it is in metres. */
interface Point {
  location: Location;
  metres: number;
}

/**
 * Generate shapes from the location data
 *
 * A route link with no track - every one of TfL's, which say which stops a train
 * calls at and nothing of the line between them - is drawn as a straight line
 * from the stop it leaves to the stop it reaches. Without that, TripsStream names
 * a shape for the journey and this writes no points for it.
 *
 * Each point's distance is its link's start plus how far along the link it is,
 * and each link is measured on its own: TransXChange gives a distance per link
 * and not per point, so the points of a track are scaled to it, and the ends of
 * a link drawn without one are at its start and at its start plus its distance.
 * A link that gives no distance is as long as it measures.
 */
export class ShapesStream extends RowStream<TransXChangeJourney, ShapeRow> {
  public readonly file = SHAPES;

  protected existingShapes: Set<string> = new Set();

  constructor(
    private readonly naptan: NaPTANIndex = {},
    private readonly areas: StopAreaIndex = {}
  ) {
    super();
  }

  /** The points of a link, each with how far along the link it is, and the link's length. */
  private pointsOf(link: RouteLink, journey: TransXChangeJourney): [Point[], number] {
    if (link.Locations.length > 0) {
      const distances = along(link.Locations);
      const measured = distances[distances.length - 1];
      const scale = link.Distance > 0 && measured > 0 ? link.Distance / measured : 1;
      const length = link.Distance > 0 ? link.Distance : measured;

      return [link.Locations.map((location, i) => ({location, metres: distances[i] * scale})), length];
    }

    const position = (stop: string) => stopPosition(stop, this.naptan, this.areas, journey.stopLocations?.[stop]);
    const from = position(link.From);
    const to = position(link.To);
    const length = link.Distance > 0 ? link.Distance : from !== undefined && to !== undefined ? between(from, to) : 0;

    return [[
      ...from === undefined ? [] : [{location: from, metres: 0}],
      ...to === undefined ? [] : [{location: to, metres: length}]
    ], length];
  }

  protected transform(journey: TransXChangeJourney): void {
    let sequence = 0;
    const shapeId = shapeIdOf(journey);

    if (this.existingShapes.has(shapeId)) {
      return;
    }
    this.existingShapes.add(shapeId);

    let last: Location | null = null;
    let lastMetres = 0;
    let distanceSoFarM = 0;

    for (const link of journey.routeLinks) {
      const [points, length] = this.pointsOf(link, journey);

      for (const {location, metres} of points) {
        if (last !== null && last.Latitude === location.Latitude && last.Longitude === location.Longitude) {
          continue;
        }

        // Always further along the line than the point before, which a link's
        // figure shorter than the straight line to its end could otherwise put a
        // point behind - and at the same distance, a different point would be the
        // same place on the line
        lastMetres = sequence > 0 && distanceSoFarM + metres <= lastMetres
          ? lastMetres + 1
          : distanceSoFarM + metres;

        this.pushRow({
          shape_id: shapeId,
          shape_pt_lat: location.Latitude,
          shape_pt_lon: location.Longitude,
          shape_pt_sequence: sequence++,
          // Kept as the fixed five decimal places it was written with: turning
          // it into a number would drop the trailing zeros.
          shape_dist_traveled: (lastMetres / 1000).toFixed(5)
        });

        last = location;
      }

      distanceSoFarM += length;
    }
  }

}
