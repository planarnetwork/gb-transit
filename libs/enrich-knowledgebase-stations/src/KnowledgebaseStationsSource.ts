import * as fs from "node:fs";
import * as path from "node:path";
import {Readable} from "node:stream";
import {pipeline} from "node:stream/promises";
import type {ReadableStream as NodeReadableStream} from "node:stream/web";
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
 * How long to give the download before giving up on it.
 *
 * Fifty-four megabytes over a connection that has gone quiet looks exactly like
 * one that is merely slow, and `fetch` waits either way. Without a deadline a
 * stalled socket holds the build until the nightly job's own 90 minute timeout
 * kills it, which reports as a build that took an hour rather than as a feed
 * that did not answer.
 */
const TIMEOUT_MS = 5 * 60 * 1000;

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
 * Fifty-four megabytes, so not on every build. A week rather than NaPTAN's
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

    if (fresh(file, maxAgeDays)) {
      return file;
    }

    try {
      await download(file, cacheDirectory, apiKey);
    }
    catch (err) {
      // A copy on disk, however old, beats no feed at all: a step-free category
      // moves when a lift is commissioned rather than hourly, so last week's
      // answer is right about almost every station and a build that fails
      // because the marketplace is briefly down has failed for no good reason.
      //
      // Loud rather than silent, and dated, because a cache quietly months old
      // is how a source stops being updated without anybody noticing.
      if (!fs.existsSync(file)) {
        throw err;
      }

      console.warn(
        `${message(err)} Using the stale copy at ${file}, last written ${written(file)}.`
      );
    }

    return file;
  };
}

/**
 * Fetch the feed into the cache, or say why it could not be.
 *
 * Written under a temporary name and moved, so an interrupted download does not
 * leave a truncated file that looks like a good cache. Streamed rather than
 * buffered: `arrayBuffer()` holds all 54MB, and `Buffer.from` of it holds the
 * same bytes a second time.
 */
async function download(file: string, cacheDirectory: string, apiKey: string): Promise<void> {
  if (apiKey === "") {
    throw new Error("The Knowledgebase needs a Rail Data Marketplace subscription key.");
  }

  fs.mkdirSync(cacheDirectory, {recursive: true});
  console.log(`Downloading the Knowledgebase stations feed to ${file}`);

  const response = await fetch(KNOWLEDGEBASE_STATIONS_URL, {
    headers: {"x-apikey": apiKey},
    signal: AbortSignal.timeout(TIMEOUT_MS)
  });

  if (!response.ok) {
    // 401 and 403 are the two that will actually happen, and they mean
    // different things: a key that is wrong, and a key that is right for a
    // subscription this product is not in.
    throw new Error(
      `The Knowledgebase returned ${response.status} ${response.statusText}. ` +
      `401 or 403 is the subscription key rather than the request.`
    );
  }

  if (response.body === null) {
    throw new Error("The Knowledgebase returned no body.");
  }

  const partial = `${file}.partial`;

  try {
    // `response.body` is the DOM ReadableStream this repository's lib brings in
    // for gtfs-loader, and `fromWeb` wants node's. They are the same object.
    const body = response.body as NodeReadableStream<Uint8Array>;

    await pipeline(Readable.fromWeb(body), fs.createWriteStream(partial));
  }
  catch (err) {
    fs.rmSync(partial, {force: true});

    throw err;
  }

  fs.renameSync(partial, file);
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
  const seen = new Set<string>();

  for (const record of records as Raw[]) {
    const crs = String(record?.crsCode ?? "").trim().toUpperCase();

    if (crs === "") {
      continue;
    }

    // Two records for one CRS would become whichever the enricher indexed last,
    // and a station would take another's accessibility without anything saying
    // so. The feed has none - 2,613 records, 2,613 codes - so this is what
    // happens if that stops being true.
    if (seen.has(crs)) {
      throw new Error(`The Knowledgebase feed has two stations with the CRS code ${crs}.`);
    }

    seen.add(crs);

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

/** When the cache was last written, for a warning somebody has to act on. */
function written(file: string): string {
  return fs.statSync(file).mtime.toISOString().slice(0, 10);
}

function message(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}

function fresh(file: string, maxAgeDays: number): boolean {
  if (!fs.existsSync(file)) {
    return false;
  }

  const age = Date.now() - fs.statSync(file).mtimeMs;

  return age < maxAgeDays * 24 * 60 * 60 * 1000;
}
