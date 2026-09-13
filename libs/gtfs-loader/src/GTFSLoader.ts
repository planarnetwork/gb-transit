import type { AgencyIndex, AreaIndex, DateNumber, Interchange, RouteIndex, ShapeIndex, StopIndex, TransfersByOrigin, Trip, TripLink } from "./GTFS.js";
import { COLUMNS, entityTypeOf } from "./EntityType.js";
import { CSVParser } from "./CSVParser.js";
import { FeedBuilder } from "./FeedBuilder.js";
import { type LoadOptions, ProgressReporter } from "./Progress.js";
import { type GTFSSource, sizeOf, toChunks } from "./Source.js";
import { readZip } from "./ZipReader.js";
import type { FeedFileName, FeedRowTypes } from "./FeedFile.js";
import { readFeedRows } from "./ReadFeed.js";

/**
 * Returns the contents of a GTFS zip.
 *
 * The zip is read as it arrives rather than after it has all been collected, so the source can be
 * anything the environment can give bytes from: a file stream in node, a fetch response in a
 * browser, or the bytes themselves.
 *
 * Stops are returned as the feed gives them. Resolving them to the stations the algorithm plans
 * between is done when the timetable is created.
 */
/**
 * A feed as the rows it was written as, keyed by file.
 */
export type RawFeed<F extends FeedFileName = FeedFileName> = {[K in F]: FeedRowTypes[K][]};

export interface RawOptions<F extends FeedFileName = FeedFileName> extends LoadOptions {
  /**
   * Give back the rows rather than a timetable: every column, values as the file
   * held them, nothing interpreted.
   *
   * What a tool that rewrites a feed wants. The default reads a feed into what a
   * journey planner plans over - times as seconds, calls indexed by stop, six of
   * the ten columns of stop_times.txt - which is lossy on purpose and no use if
   * you mean to write the feed back out.
   */
  raw: true;
  /** Which files to read. Anything else is not decompressed. Defaults to all. */
  files?: readonly F[];
}

export function loadGTFS(source: GTFSSource, options?: LoadOptions): Promise<GTFSFeed>;
export function loadGTFS<F extends FeedFileName>(
  source: GTFSSource,
  options: RawOptions<F>
): Promise<RawFeed<F>>;

export function loadGTFS(
  source: GTFSSource,
  options: LoadOptions | RawOptions = {}
): Promise<GTFSFeed | RawFeed> {
  return "raw" in options && options.raw
    ? readFeedRows(source, (options as RawOptions).files)
    : loadTimetable(source, options);
}

async function loadTimetable(source: GTFSSource, options: LoadOptions = {}): Promise<GTFSFeed> {
  const builder = new FeedBuilder();
  const progress = new ProgressReporter(options, sizeOf(source));
  let found = 0;

  await readZip(
    toChunks(source),
    entry => {
      const type = entityTypeOf(entry.name);

      if (type === undefined) {
        return undefined;
      }

      found++;

      const parser = progress.wanted
        ? new CSVParser(COLUMNS[type], row => { progress.rows++; builder.add(type, row); })
        : new CSVParser(COLUMNS[type], row => builder.add(type, row));

      return (text, final) => {
        parser.write(text);

        if (final) {
          parser.end();
        }
      };
    },
    {
      onBytes: bytes => progress.onBytes(bytes),
      onEntryBytes: (entry, bytes) => progress.onEntryBytes(entry, bytes)
    }
  );

  // an unzipper reading forwards finds no entries in something that is not a zip and says nothing
  // about it, so a feed that turned out to be an error page would otherwise load as an empty one
  if (found === 0) {
    throw new Error(
      "No GTFS files found. The source has to be a zip containing stops.txt, trips.txt, "
      + "stop_times.txt and the rest; if it came from a url, check that the url really returns a "
      + "feed rather than an error page."
    );
  }

  progress.onBuilding();

  return builder.build();
}

/**
 * Fetches a GTFS zip and loads it, parsing it as it downloads.
 *
 * The feed has to be readable by the page, which for a browser means the host either serves it from
 * the same origin or sends an Access-Control-Allow-Origin header. Most GTFS publishers do neither,
 * so expect to proxy or to host the feed yourself.
 */
export async function loadGTFSFromUrl(url: string | URL, options: FetchOptions = {}): Promise<GTFSFeed> {
  const request = options.fetch ?? globalThis.fetch;
  const href = url.toString();

  if (typeof request !== "function") {
    throw new Error("No fetch available, pass one in options.fetch");
  }

  let response: Response;

  try {
    response = await request(href, { signal: options.signal, headers: options.headers });
  }
  catch (cause) {
    // an abort is the caller's own doing and is reported as itself
    if (cause instanceof Error && cause.name === "AbortError") {
      throw cause;
    }

    throw new GTFSFetchError(href, undefined, { cause });
  }

  if (!response.ok) {
    throw new GTFSFetchError(href, response.status);
  }

  return loadGTFS(response, options);
}

export interface FetchOptions extends LoadOptions {
  signal?: AbortSignal;
  headers?: HeadersInit;
  /** The fetch to use, for an environment that does not have one or for a test that fakes it */
  fetch?: typeof fetch;
}

/**
 * A feed that could not be fetched.
 */
export class GTFSFetchError extends Error {

  constructor(
    public readonly url: string,
    public readonly status?: number,
    options?: { cause?: unknown }
  ) {
    super(describe(url, status, options?.cause), options);

    this.name = "GTFSFetchError";
  }

}

/**
 * A browser refuses a cross origin fetch by rejecting with a TypeError that says nothing, on
 * purpose, so the likely reason is given here rather than left to be guessed at.
 */
function describe(url: string, status: number | undefined, cause: unknown): string {
  if (status !== undefined) {
    return `Could not fetch ${url}, the server responded ${status}`;
  }

  const reason = cause instanceof Error ? cause.message : String(cause);

  return `Could not fetch ${url}. In a browser this is nearly always CORS: a feed on another origin `
    + `is only readable if the server sends an Access-Control-Allow-Origin header, and most GTFS `
    + `hosts do not. Serve the feed from your own origin, or put a proxy in front of it that adds `
    + `the header. Asking for it with mode "no-cors" does not help, because the response is then `
    + `opaque and has no body to read. The underlying error was: ${reason}`;
}

/**
 * Contents of the GTFS zip file
 */
export interface GTFSFeed {
  trips: Trip[];
  transfers: TransfersByOrigin;
  /** Couplings between trips, which the timetable turns into the trips a passenger stays on */
  links: TripLink[];
  interchange: Interchange;
  stops: StopIndex;
  routes: RouteIndex;
  agencies: AgencyIndex;
  areas: AreaIndex;
  /**
   * The lines the trips run over, which a feed does not have to provide - empty where it does not.
   * Holds the shapes of the trips couplings make as well, named as those trips name them.
   */
  shapes: ShapeIndex;
  /** feed_info.txt, which a feed does not have to provide */
  feedInfo?: FeedInfo;
}

/**
 * The period the feed covers, and the version it was published as
 */
export interface FeedInfo {
  startDate?: DateNumber;
  endDate?: DateNumber;
  version?: string;
}
