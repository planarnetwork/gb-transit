import {Location} from "../transxchange/TransXChange";
import {ATCOCode, NaPTANIndex} from "./NaPTAN";
import {areaOf, StopAreaIndex} from "./StopAreas";

/**
 * Where a stop is, from the best source that says.
 *
 * NaPTAN's surveyed position first. Then the position the TransXChange document
 * gives it, which a stop NaPTAN does not list can carry - an absent one is read
 * as 0,0 and is not a position. Then its station's, for a platform NaPTAN does
 * not list, which is where it is to within a station's width.
 */
export function stopPosition(
  stop: ATCOCode,
  naptan: NaPTANIndex,
  areas: StopAreaIndex,
  documented?: Location
): Location | undefined {
  const surveyed = naptan[stop];

  if (surveyed !== undefined && surveyed.latitude !== "" && surveyed.longitude !== "") {
    return {Latitude: Number(surveyed.latitude), Longitude: Number(surveyed.longitude)};
  }

  if (documented !== undefined && (documented.Latitude !== 0 || documented.Longitude !== 0)) {
    return documented;
  }

  const station = areaOf(areas, stop);

  return station === undefined || station.latitude === "" || station.longitude === ""
    ? undefined
    : {Latitude: Number(station.latitude), Longitude: Number(station.longitude)};
}
