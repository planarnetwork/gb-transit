import {CSVParser, Row} from "./CSVParser.js";
import {GTFSSource, toChunks} from "./Source.js";
import {readZip} from "./ZipReader.js";
import {FeedFileName, FeedRowTypes, FEED_FILES, READ_COLUMNS, feedFileOf, toRow} from "./FeedFile.js";

/**
 * What to do with each file's rows. A file with no handler is never inflated.
 */
export type FeedHandlers = {
  [F in FeedFileName]?: (row: FeedRowTypes[F]) => void;
};

export interface ReadFeedOptions {
  /**
   * Called for a file the caller asked for that the feed does not have. The
   * default is to ignore it, because most feeds are missing most files.
   */
  onMissing?: (file: FeedFileName) => void;
  /**
   * Columns to read from a file beyond the ones the schema knows, carried on the
   * row as the text the file held. For a tool that passes a feed's columns
   * through rather than interpreting them; see `readHeaders` for finding out
   * what they are.
   */
  extraColumns?: Partial<Record<FeedFileName, readonly string[]>>;
}

/**
 * Read a feed, calling back once per row.
 *
 * The row object is REUSED between rows, as CSVParser's is. Copy out what you
 * keep.
 *
 * Only the files with a handler are decompressed: readZip skips an entry whose
 * sink is undefined, so a merge that does not want shapes.txt does not pay to
 * inflate it.
 */
export async function readFeed(
  source: GTFSSource,
  handlers: FeedHandlers,
  options: ReadFeedOptions = {}
): Promise<void> {
  const seen = new Set<FeedFileName>();

  await readZip(toChunks(source), entry => {
    const file = feedFileOf(entry.name);

    if (file === undefined) {
      return undefined;
    }

    const handler = handlers[file] as ((row: unknown) => void) | undefined;

    if (handler === undefined) {
      return undefined;
    }

    seen.add(file);

    const extra = (options.extraColumns?.[file] ?? []).filter(column => !READ_COLUMNS[file].includes(column));
    const parser = extra.length === 0
      ? new CSVParser(READ_COLUMNS[file], row => handler(toRow(file, row)))
      : new CSVParser([...READ_COLUMNS[file], ...extra], row => handler(withExtra(toRow(file, row), row, extra)));

    return (text, final) => {
      parser.write(text);

      if (final) {
        parser.end();
      }
    };
  });

  if (options.onMissing !== undefined) {
    for (const file of FEED_FILES) {
      if (handlers[file] !== undefined && !seen.has(file)) {
        options.onMissing(file);
      }
    }
  }
}

function withExtra<T>(typed: T, row: Row, extra: readonly string[]): T {
  const out = typed as Record<string, unknown>;

  for (const column of extra) {
    out[column] = row[column];
  }

  return typed;
}

/**
 * Every row of every file asked for, in memory.
 *
 * What a merge needs, and what the round-trip test needs. A feed whose
 * stop_times.txt is three million rows costs what those rows cost; read with
 * `readFeed` instead if that matters.
 */
export async function readFeedRows<F extends FeedFileName>(
  source: GTFSSource,
  files: readonly F[] = FEED_FILES as readonly FeedFileName[] as readonly F[]
): Promise<{[K in F]: FeedRowTypes[K][]}> {
  const rows = {} as {[K in F]: FeedRowTypes[K][]};
  const handlers: FeedHandlers = {};

  for (const file of files) {
    const collected: unknown[] = rows[file] = [];

    // The row object is reused, so a copy is what gets kept.
    (handlers as Record<string, (row: unknown) => void>)[file] =
      row => collected.push({...(row as object)});
  }

  await readFeed(source, handlers);

  return rows;
}
