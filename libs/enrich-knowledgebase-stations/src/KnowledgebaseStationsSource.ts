import * as fs from "node:fs";
import * as path from "node:path";
import {KnowledgebaseStation} from "./KnowledgebaseStations";
import {stepFreeCategory} from "./StepFree";

/**
 * The stations feed, as the Rail Data Marketplace serves it. RSPS5050 is the
 * specification; this is the 5.0 JSON product of it.
 */
export const KNOWLEDGEBASE_STATIONS_URL =
  "https://api1.raildata.org.uk/1010-nationalrail-knowledgebase-stations-feed" +
  "-_json_---production5_0/stations";

/**
 * The stations, from a cached copy if there is one.
 */
export function knowledgebaseStationsFromApi(
  cacheDirectory: string,
  apiKey: string,
  maxAgeDays = 7
): () => Promise<readonly KnowledgebaseStation[]> {
  const file = knowledgebaseStationsFile(cacheDirectory, apiKey, maxAgeDays);

  return async () => parseKnowledgebaseStations(fs.readFileSync(await file(), "utf8"));
}

/**
 * The path of the cached feed, downloading it if there is no current copy.
 *
 * Fifty-four megabytes, and a nightly that fails because the marketplace is
 * briefly down has failed for no good reason. A week rather than NaPTAN's
 * month: the feed is rebuilt daily and a station's category can change on the
 * day a lift is commissioned.
 */
export function knowledgebaseStationsFile(
  cacheDirectory: string,
  apiKey: string,
  maxAgeDays = 7
): () => Promise<string> {
  return async () => {
    const file = path.join(cacheDirectory, "knowledgebase-stations.json");

    if (!fresh(file, maxAgeDays)) {
      if (apiKey === "") {
        throw new Error(
          `The Knowledgebase needs a Rail Data Marketplace subscription key, ` +
          `and there is no current copy at ${file}.`
        );
      }

      fs.mkdirSync(cacheDirectory, {recursive: true});
      console.log(`Downloading the Knowledgebase stations feed to ${file}`);

      const response = await fetch(KNOWLEDGEBASE_STATIONS_URL, {headers: {"x-apikey": apiKey}});

      if (!response.ok) {
        // 401 and 403 are the two that will actually happen, and they mean
        // different things: a key that is wrong, and a key that is right for a
        // subscription this product is not in.
        throw new Error(
          `The Knowledgebase returned ${response.status} ${response.statusText}. ` +
          `401 or 403 is the subscription key rather than the request.`
        );
      }

      // Written under a temporary name and moved, so an interrupted download
      // does not leave a truncated file that looks like a good cache.
      const partial = `${file}.partial`;

      fs.writeFileSync(partial, Buffer.from(await response.arrayBuffer()));
      fs.renameSync(partial, file);
    }

    return file;
  };
}

/**
 * The stations out of the feed's JSON.
 *
 * Separate from the download so a fixture can drive an enrichment with no
 * network and no subscription, and so a record that has changed shape upstream
 * is a parsing problem here rather than a station that quietly stops being
 * accessible.
 *
 * A record with no CRS is dropped: the CRS is the only thing this joins on, so
 * a record without one cannot reach a stop however good its contents are.
 */
export function parseKnowledgebaseStations(json: string): KnowledgebaseStation[] {
  const parsed = JSON.parse(json) as {stations?: unknown};
  const records = parsed.stations;

  if (!Array.isArray(records)) {
    throw new Error("The Knowledgebase feed has no stations in it.");
  }

  const stations: KnowledgebaseStation[] = [];

  for (const record of records as Raw[]) {
    const crs = String(record?.crsCode ?? "").trim().toUpperCase();

    if (crs === "") {
      continue;
    }

    stations.push({
      crs,
      name: String(record.name ?? ""),
      slug: String(record.slug ?? ""),
      stepFree: stepFreeCategory(record.stationAccessibility?.stepFreeCategory?.category)
    });
  }

  return stations;
}

/**
 * What this reads of a station. Everything is optional because the only thing
 * checked upstream is that the feed parses.
 */
interface Raw {
  readonly crsCode?: unknown;
  readonly name?: unknown;
  readonly slug?: unknown;
  readonly stationAccessibility?: {
    readonly stepFreeCategory?: {
      readonly category?: string | null;
    } | null;
  } | null;
}

function fresh(file: string, maxAgeDays: number): boolean {
  if (!fs.existsSync(file)) {
    return false;
  }

  const age = Date.now() - fs.statSync(file).mtimeMs;

  return age < maxAgeDays * 24 * 60 * 60 * 1000;
}
