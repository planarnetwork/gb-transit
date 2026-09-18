import proj4 from "proj4";

proj4.defs(
  "EPSG:27700",
  "+proj=tmerc +lat_0=49 +lon_0=-2 +k=0.9996012717 +x_0=400000 +y_0=-100000 " +
  "+ellps=airy +datum=OSGB36 +units=m +no_defs"
);

/**
 * A National Grid easting and northing as a longitude and latitude.
 *
 * NaPTAN gives every stop a grid reference and only most of them a longitude
 * and latitude: 37,210 of the 435,546 stops in the national file have the
 * easting and northing filled in and the other two columns empty. Read as they
 * come, 13,392 of the stops a national conversion uses arrive with no position
 * at all, and 1.26m calls are made at a stop nothing can place.
 *
 * The projection is the same one the rail feed uses on the eastings and
 * northings in the MSN, written out again here rather than shared: this is six
 * lines, and the alternative is a bus conversion reaching into the library that
 * builds the rail feed.
 */
export function fromGrid(easting: string, northing: string): {longitude: string, latitude: string} {
  const east = Number(easting);
  const north = Number(northing);

  if (easting === "" || northing === "" || !inGrid(east, north)) {
    return {longitude: "", latitude: ""};
  }

  const [longitude, latitude] = proj4("EPSG:27700", "EPSG:4326", [east, north]);

  return {longitude: String(longitude), latitude: String(latitude)};
}

/**
 * Inside the National Grid.
 *
 * The projection has an answer for every pair of numbers, so a zero or a typo
 * comes back as a coordinate somewhere rather than as an error: 0,0 is the grid
 * origin, in the sea off the Scillies. No row in the national NaPTAN file is
 * outside these bounds, so this is a guard against a bad file rather than a case
 * seen in the wild - the point of it is that a stop nothing can place stays
 * visibly unplaced instead of being quietly moved to the Atlantic.
 */
function inGrid(east: number, north: number): boolean {
  return Number.isFinite(east) && Number.isFinite(north)
    && east > 0 && east < 700_000
    && north > 0 && north < 1_300_000;
}
