import * as fs from "fs";
import {FeedFileName, READ_COLUMNS, readHeaders} from "@gb-transit/gtfs-loader";

/**
 * The columns of the input feeds that a merge does not write as its own.
 *
 * A merge writes each file in the columns it declares in MergeFeed.ts. A feed can carry more - the
 * rail feed's transfers say which mode a fixed link is and when it runs, and a producer can add
 * columns nobody here has heard of - and those are passed through as the feed wrote them rather
 * than dropped. A column that only one of the feeds has is empty in the rows of the others.
 */
export interface ExtraColumns {
  /** Per file, the columns to write after the ones the merge declares. */
  readonly write: Partial<Record<FeedFileName, readonly string[]>>;
  /** Per file, the columns the loader has to be asked for, because the schema does not know them. */
  readonly read: Partial<Record<FeedFileName, readonly string[]>>;
}

/**
 * The extra columns of every input, in the order they are first met.
 *
 * `declared` is the columns the merge writes for each file, and `withheld` the ones it has decided
 * not to write - a merge without shapes writes no shape_id, and passing the feed's through would put
 * back the dangling reference leaving it out avoids.
 */
export async function extraColumns(
  inputs: readonly string[],
  declared: Partial<Record<FeedFileName, readonly string[]>>,
  withheld: Partial<Record<FeedFileName, readonly string[]>> = {}
): Promise<ExtraColumns> {
  const write: Partial<Record<FeedFileName, string[]>> = {};
  const read: Partial<Record<FeedFileName, string[]>> = {};

  for (const input of inputs) {
    const headers = await readHeaders(fs.createReadStream(input));

    for (const [file, columns] of Object.entries(headers) as [FeedFileName, string[]][]) {
      const own = declared[file];

      // A file the merge does not write, like links.txt, which becomes transfers.
      if (own === undefined) {
        continue;
      }

      for (const column of columns) {
        if (own.includes(column) || withheld[file]?.includes(column)) {
          continue;
        }

        if (!(write[file] ??= []).includes(column)) {
          write[file].push(column);
        }

        if (!READ_COLUMNS[file].includes(column) && !(read[file] ??= []).includes(column)) {
          read[file].push(column);
        }
      }
    }
  }

  return {write, read};
}
