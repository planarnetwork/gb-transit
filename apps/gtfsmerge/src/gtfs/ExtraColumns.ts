import type {FeedFileName} from "@gb-transit/gtfs-loader";
import {readHeaders} from "./ZipHeaders";

/**
 * Per file, the columns to write after the ones the merge declares.
 */
export type ExtraColumns = Partial<Record<FeedFileName, readonly string[]>>;

/**
 * The columns of the input feeds that a merge does not write as its own, in the order they are
 * first met.
 *
 * A merge writes each file in the columns it declares in MergeFeed.ts. A feed can carry more - the
 * rail feed's transfers say which mode a fixed link is and when it runs, and a producer can add
 * columns nobody here has heard of - and those are passed through as the feed wrote them rather
 * than dropped. A column that only one of the feeds has is empty in the rows of the others.
 *
 * `declared` is the columns the merge writes for each file, and `withheld` the ones it will not pass
 * through: see `withheldColumns`.
 *
 * The same list is what the loader is asked to read, since a column the schema does not know is
 * only read when named, and naming one it does know changes nothing.
 */
export async function extraColumns(
  inputs: readonly string[],
  declared: Partial<Record<FeedFileName, readonly string[]>>,
  withheld: Partial<Record<FeedFileName, readonly string[]>> = {}
): Promise<ExtraColumns> {
  const extra: Partial<Record<FeedFileName, string[]>> = {};

  for (const headers of await Promise.all(inputs.map(readHeaders))) {
    for (const [file, columns] of Object.entries(headers) as [FeedFileName, string[]][]) {
      const own = declared[file];

      // A file the merge does not write, like links.txt, which becomes transfers.
      if (own === undefined) {
        continue;
      }

      for (const column of columns) {
        if (!own.includes(column) && !withheld[file]?.includes(column) && !(extra[file] ??= []).includes(column)) {
          extra[file].push(column);
        }
      }
    }
  }

  return extra;
}
