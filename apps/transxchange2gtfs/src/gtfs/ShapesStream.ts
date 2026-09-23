import {ShapeRow} from "@gb-transit/gtfs-schema";
import {RowStream} from "./RowStream";
import {SHAPES} from "./TxcFeed";
import {TransXChangeJourney} from "../transxchange/TransXChangeJourneyStream";
import {shapeIdOf} from "./ShapeId";
import {Location, RouteLink} from "../transxchange/TransXChange";
import {ATCOCode, NaPTANIndex} from "../reference/NaPTAN";
import {areaOf, StopAreaIndex} from "../reference/StopAreas";

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

function routeLinkDistance(routeLink: RouteLink): number {
  let distance = 0;
  let lastLoc: Location | null = null;
  for (const location of routeLink.Locations) {
    if (lastLoc !== null) {
      distance += getDistanceFromLatLonInM(lastLoc.Latitude, lastLoc.Longitude, location.Latitude, location.Longitude);
    }
    lastLoc = location;
  }
  return distance;
}

/**
 * Generate shapes from the location data
 *
 * A route link with no track - every one of TfL's, which say which stops a train
 * calls at and nothing of the line between them - is drawn as a straight line
 * from the stop it leaves to the stop it reaches, where NaPTAN places them.
 * Without that, TripsStream names a shape for the journey and this writes no
 * points for it.
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

  /** The track of a link, or the two stops at either end of it where it has none. */
  private locationsOf(link: RouteLink): Location[] {
    if (link.Locations.length > 0) {
      return link.Locations;
    }

    return [link.From, link.To].map(stop => this.positionOf(stop)).filter(location => location !== undefined);
  }

  /** Where a stop is: NaPTAN's position for it, or its station's for a platform NaPTAN does not list. */
  private positionOf(stop: ATCOCode): Location | undefined {
    const place = this.naptan[stop] ?? areaOf(this.areas, stop);

    return place === undefined || place.latitude === "" || place.longitude === ""
      ? undefined
      : {Latitude: Number(place.latitude), Longitude: Number(place.longitude)};
  }

  protected transform(journey: TransXChangeJourney): void {
    let sequence = 0;
    const shapeId = shapeIdOf(journey);

    if (this.existingShapes.has(shapeId)) {
      return;
    }
    this.existingShapes.add(shapeId);

    let lastLocAdded: Location | null = null;
    let distanceSoFarM = 0;

    for (const link of journey.routeLinks) {
      const locations = this.locationsOf(link);
      // The TXC file only gives a distance per route link, not per point within it, but GTFS wants a
      // distance on each shape point. We approximate per-point distances via Haversine and scale them
      // so the per-link total matches the TXC figure. Fall back to a 1x scale when the measured
      // distance is zero so we don't divide by zero and emit NaN.
      const measured = routeLinkDistance({...link, Locations: locations});
      const scaleFactor = measured > 0 ? link.Distance / measured : 1;

      let linkDistance = 0;
      for (const location of locations) {
        if (
          lastLocAdded !== null &&
          lastLocAdded.Latitude === location.Latitude &&
          lastLocAdded.Longitude === location.Longitude
        ) {
          continue;
        }
        linkDistance += lastLocAdded
          ? getDistanceFromLatLonInM(lastLocAdded.Latitude, lastLocAdded.Longitude, location.Latitude, location.Longitude)
          : 0;

        this.pushRow({
          shape_id: shapeId,
          shape_pt_lat: location.Latitude,
          shape_pt_lon: location.Longitude,
          shape_pt_sequence: sequence++,
          // Kept as the fixed five decimal places it was written with: turning
          // it into a number would drop the trailing zeros.
          shape_dist_traveled: ((distanceSoFarM + linkDistance * scaleFactor) / 1000).toFixed(5)
        });

        lastLocAdded = location;
      }
      distanceSoFarM += link.Distance;
    }
  }

}
