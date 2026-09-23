import * as fs from "node:fs";
import * as path from "node:path";
import {FeedFile, FixedWidthRecord, Record, RecordAction} from "@gb-transit/feed-parser";
import {eachLine, ZipEntry, ZipFile} from "./ZipFile";

/**
 * A fares feed zip: RJFAF847.ZIP is a full refresh, RJFAC848.ZIP a change file.
 */
const FARES_FEED = /^RJFA([FC])(\d+)\.zip$/i;

/**
 * A file inside a fares feed zip. A change zip carries change files (RJFAC848.FFL) for some extensions and full
 * files (RJFAF848.TVL) for others, so whether a file replaces or amends is decided per entry, not per zip.
 */
const FEED_ENTRY = /^RJFA([FC])\d+\.(\w+)$/i;

/**
 * Expand what was given into the fares feeds to apply, in the order to apply them.
 *
 * A path to a zip is taken as given. A directory contributes every fares feed in it, ordered by sequence number and
 * starting at the most recent full refresh - anything before that refresh is superseded by it.
 */
export function faresFeeds(sources: string | string[]): string[] {
  return (Array.isArray(sources) ? sources : [sources]).flatMap(source => {
    if (!fs.existsSync(source)) {
      throw new Error(`Source ${source} does not exist.`);
    }

    if (fs.statSync(source).isDirectory()) {
      return feedsIn(source);
    }

    if (!FARES_FEED.test(path.basename(source))) {
      throw new Error(`${source} is not a fares feed. Expected a file named RJFAFxxx.ZIP or RJFACxxx.ZIP.`);
    }

    return [source];
  });
}

function feedsIn(directory: string): string[] {
  const feeds = fs.readdirSync(directory)
    .map(entry => ({entry, parsed: FARES_FEED.exec(entry)}))
    .filter(({parsed}) => parsed !== null)
    .map(({entry, parsed}) => ({
      path: path.join(directory, entry),
      sequence: parseInt(parsed![2], 10),
      refresh: parsed![1].toUpperCase() === "F"
    }))
    .sort((a, b) => a.sequence - b.sequence || a.path.localeCompare(b.path));

  if (feeds.length === 0) {
    throw new Error(`No fares feeds in ${directory}.`);
  }

  const lastRefresh = feeds.findLastIndex(feed => feed.refresh);

  return feeds.slice(lastRefresh === -1 ? 0 : lastRefresh).map(feed => feed.path);
}

/**
 * The lines of a fares feed file as they stand once every change has been applied.
 *
 * Changes follow the importer: I is an insert that is ignored if the key exists, A replaces the row with that key and
 * D deletes it. The changes are small, so they are folded into a final state per key first, then the full file is
 * streamed once with each changed key substituted as it passes.
 */
export class FaresFeed {

  private readonly zips: ZipFile[];

  constructor(sources: string | string[]) {
    this.zips = faresFeeds(sources).map(ZipFile.open);
  }

  /**
   * Call back with every current line of the file with the given extension. Lines keep their action and record type
   * characters so they can be sliced at the positions the schema gives.
   */
  public async eachLine(extension: string, file: FeedFile, onLine: (line: string) => void): Promise<void> {
    const [full, ...changes] = this.entriesFor(extension);
    const keys = new KeyReader(file);
    const pending = new Map<string, Change>();

    for (const change of changes) {
      await eachLine(change.zip.stream(change.entry), line => {
        const key = keys.read(line);

        if (key !== null) {
          pending.set(key, apply(pending.get(key), line, keys.action(line)));
        }
      });
    }

    await eachLine(full.zip.stream(full.entry), line => {
      if (pending.size > 0) {
        const key = keys.read(line);
        const change = key === null ? undefined : pending.get(key);

        if (change !== undefined) {
          pending.delete(key!);

          if (change.ifAbsent) {
            onLine(line);
          }
          else if (change.line !== null) {
            onLine(change.line);
          }

          return;
        }
      }

      onLine(line);
    });

    for (const change of pending.values()) {
      if (change.line !== null) {
        onLine(change.line);
      }
    }
  }

  /**
   * The most recent full file with the given extension followed by the change files after it
   */
  private entriesFor(extension: string): FeedEntry[] {
    const entries: FeedEntry[] = [];
    let hasFull = false;

    for (const zip of this.zips) {
      for (const entry of zip.entries) {
        const parsed = FEED_ENTRY.exec(path.basename(entry.name));

        if (parsed === null || parsed[2].toUpperCase() !== extension.toUpperCase()) {
          continue;
        }
        if (parsed[1].toUpperCase() === "F") {
          entries.length = 0;
          hasFull = true;
        }

        entries.push({zip, entry});
      }
    }

    if (!hasFull) {
      throw new Error(`No full ${extension} file in ${this.zips.map(z => z.path).join(", ")}`);
    }

    return entries;
  }

}

interface FeedEntry {
  zip: ZipFile;
  entry: ZipEntry;
}

/**
 * The net effect of a key's changes. With ifAbsent set the line only applies if the full file does not have the key.
 * A null line is a deletion.
 */
interface Change {
  line: string | null;
  ifAbsent: boolean;
}

function apply(previous: Change | undefined, line: string, action: RecordAction): Change {
  switch (action) {
    case RecordAction.Delete:
      return {line: null, ifAbsent: false};
    case RecordAction.Update:
      return {line, ifAbsent: false};
    case RecordAction.Insert:
      if (previous === undefined) {
        return {line, ifAbsent: true};
      }

      return previous.line === null && !previous.ifAbsent ? {line, ifAbsent: false} : previous;
    default:
      throw new Error(`Unsupported action ${action} for line ${line}`);
  }
}

/**
 * The unique key of a line, taken from the raw characters of the record's key fields
 */
class KeyReader {

  private readonly slices = new Map<Record, [number, number][]>();

  constructor(private readonly file: FeedFile) {
    for (const record of file.recordTypes) {
      this.slices.set(record, record.key.map(name => [record.fields[name].position, record.fields[name].length]));
    }
  }

  public read(line: string): string | null {
    const record = this.file.getRecord(line);

    if (record === null || record === undefined) {
      return null;
    }

    let key = record.name;

    for (const [position, length] of this.slices.get(record)!) {
      key += "|" + line.substr(position, length);
    }

    return key;
  }

  public action(line: string): RecordAction {
    const record = this.file.getRecord(line);
    const action = record instanceof FixedWidthRecord ? record.actionMap[line.charAt(record.charPosition)] : undefined;

    return action ?? RecordAction.Insert;
  }

}
