import proj4 from "proj4";

proj4.defs(
  "EPSG:27700",
  "+proj=tmerc +lat_0=49 +lon_0=-2 +k=0.9996012717 +x_0=400000 +y_0=-100000 " +
  "+ellps=airy +datum=OSGB36 +units=m +no_defs"
);

/**
 * A National Grid easting and northing as a longitude and latitude.
 *
 * NaPTAN gives every stop a grid reference and only most of them a longitude and
 * latitude, so without this around 37,000 of its 435,000 stops have no position.
 *
 * The projection is the one the rail feed applies to the MSN's eastings and
 * northings, written out again rather than shared: six lines, against a bus
 * conversion reaching into the library that builds the rail feed.
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
 * lands somewhere plausible rather than failing: 0,0 is the grid origin, in the
 * sea off the Scillies. A stop nothing can place is better left unplaced.
 */
function inGrid(east: number, north: number): boolean {
  return Number.isFinite(east) && Number.isFinite(north)
    && east > 0 && east < 700_000
    && north > 0 && north < 1_300_000;
}
