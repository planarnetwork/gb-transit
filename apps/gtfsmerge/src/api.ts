import {workingDirectory} from "@gb-transit/gtfs-output";
import {Container, DEFAULT_LATITUDE} from "./Container";
import {toGTFSDate} from "./gtfs/calendar/gtfsDateUtils";

export interface MergeOptions {
  /** Feeds to merge, in order. */
  readonly inputs: readonly string[];
  /** A `.zip`, or a directory to write the files into. */
  readonly output: string;
  /** Kilometres between two stops for a walk transfer to be generated. 0 for none. */
  readonly transferDistance?: number;
  /** Drop everything before this date, `YYYYMMDD`. Undefined keeps the past. */
  readonly filterDatesBefore?: string;
  /** GTFS route types to drop, as numbers. */
  readonly removeRouteTypes?: readonly string[];
  /**
   * Whether to carry shapes.txt and the shape_id naming it. Default true.
   *
   * A shape is the line a vehicle is drawn along on a map, and nothing else: no
   * journey planner reads one. It is also the largest file a bus feed has - the
   * national one's is 2.5GB against 3GB of calls - so a consumer that draws no
   * maps is carrying half a feed for nothing.
   */
  readonly shapes?: boolean;
  /** The latitude the distance approximation is calibrated at. */
  readonly rulerLatitude?: number;
  /**
   * Where the files are assembled before being put at `output`. Defaults to a
   * sibling of the output, so moving them into place cannot cross a filesystem.
   */
  readonly tmp?: string;
}

/**
 * Merge feeds into one.
 *
 * The function the CLI is a wrapper around, so the end to end tests can merge
 * without a subprocess and `require("gtfsmerge")` does not run a merge.
 */
export async function merge(options: MergeOptions): Promise<void> {
  const {
    inputs,
    output,
    transferDistance = 1.6,
    filterDatesBefore,
    removeRouteTypes = [],
    shapes = true,
    rulerLatitude = DEFAULT_LATITUDE,
    tmp = workingDirectory(output)
  } = options;

  if (inputs.length === 0) {
    throw new Error("No input feeds given.");
  }

  await new Container()
    .getMergeCommand(tmp, transferDistance, [...removeRouteTypes], rulerLatitude, shapes)
    .run([...inputs], output, filterDatesBefore);
}

export {toGTFSDate};

// The columns of each file in a feed, read from the start of each entry and no
// further: scripts/combine-rail-and-tfl.mjs needs to know them too.
export {readHeaders} from "./gtfs/ZipHeaders";
