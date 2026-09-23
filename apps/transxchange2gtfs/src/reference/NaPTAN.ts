import {NaptanRow, eachNaptanRow, parseNaptanRows} from "@gb-transit/naptan";
import {fromGrid} from "./OSGridReference";

/**
 * String e.g. 3890D102801
 */
export type ATCOCode = string;

/**
 * One NaPTAN stop, as this conversion uses it.
 *
 * Read by column name. It used to be a nine element `string[]`, sliced out of
 * the national CSV at positions [0,1,4,10,14,18,19,29,30] by a separate download
 * step and then indexed by number all over `StopsStream` and `TransfersStream` -
 * so a column added or moved by the DfT would have silently put a street name in
 * the latitude.
 */
export interface NaptanStopPoint {
  readonly atcoCode: ATCOCode;
  readonly naptanCode: string;
  readonly name: string;
  readonly street: string;
  readonly indicator: string;
  readonly locality: string;
  readonly parentLocality: string;
  /** The locality as NPTG codes it, which is what groups stops into a place. */
  readonly localityCode: string;
  /** The direction a vehicle faces at the stop, e.g. `N`, `SW`. */
  readonly bearing: string;
  /** NaPTAN's own classification, e.g. `BCT` for an on-street bus stop. */
  readonly stopType: string;
  /** Kept as text: re-serialising through a number drops trailing digits. */
  readonly longitude: string;
  readonly latitude: string;
}

/**
 * NaPTAN indexed by ATCO code
 */
export type NaPTANIndex = Record<ATCOCode, NaptanStopPoint>;

/**
 * ATCO codes indexed by the locality they are in, which is how a stop's
 * neighbours are found without comparing it to all 400,000 of them.
 */
export type StopLocationIndex = Record<string, ATCOCode[]>;

/**
 * Index a NaPTAN CSV by ATCO code and by locality.
 *
 * Prefer `naptanIndexesFrom`, which streams. This holds the whole CSV and every
 * row of it at once, which for the national dataset is about 600MB more than
 * reading it a row at a time.
 */
export function naptanIndexes(csv: string): [NaPTANIndex, StopLocationIndex] {
  const indexes = emptyIndexes();

  for (const row of parseNaptanRows(csv)) {
    add(indexes, row);
  }

  return indexes;
}

/**
 * Index a NaPTAN CSV by ATCO code and by locality, reading it as it arrives.
 */
export async function naptanIndexesFrom(file: string): Promise<[NaPTANIndex, StopLocationIndex]> {
  const indexes = emptyIndexes();

  await eachNaptanRow(file, row => add(indexes, row));

  return indexes;
}

function emptyIndexes(): [NaPTANIndex, StopLocationIndex] {
  return [{}, {}];
}

/**
 * NaPTAN pads some fields, and a padded name reaches the feed as a stop called
 * `" Sutton Court Farm"`.
 */
function text(value: string | undefined): string {
  return value?.trim() ?? "";
}

function add([byCode, byLocation]: [NaPTANIndex, StopLocationIndex], row: NaptanRow): void {
  const code = text(row.ATCOCode);

  if (code === "") {
    return;
  }

  const latitude = text(row.Latitude);
  const longitude = text(row.Longitude);
  const position = latitude !== "" && longitude !== ""
    ? {latitude, longitude}
    : fromGrid(text(row.Easting), text(row.Northing));

  const stop: NaptanStopPoint = {
    atcoCode: code,
    naptanCode: text(row.NaptanCode),
    name: text(row.CommonName),
    street: text(row.Street),
    indicator: text(row.Indicator),
    locality: text(row.LocalityName),
    parentLocality: text(row.ParentLocalityName),
    localityCode: text(row.NptgLocalityCode),
    bearing: text(row.Bearing),
    stopType: text(row.StopType),
    longitude: position.longitude,
    latitude: position.latitude
  };

  byCode[code] = stop;

  const location = stop.parentLocality || stop.locality;

  (byLocation[location] ||= []).push(code);
}
