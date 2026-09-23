import { Unzip, UnzipInflate } from "fflate";
import { GTFSSource, toChunks } from "./Source.js";
import { FeedFileName, feedFileOf } from "./FeedFile.js";

/**
 * The header row of each file in a feed.
 *
 * For a tool that has to know every column it will meet before it writes a row - a merge opens its
 * output with a header, and a column that only turns up in the second feed is too late to add. Each
 * entry is decompressed until its first line and no further, so a feed's stop_times.txt costs a
 * chunk rather than the gigabyte it inflates to.
 */
export function readHeaders(source: GTFSSource): Promise<Partial<Record<FeedFileName, string[]>>> {
  const headers: Partial<Record<FeedFileName, string[]>> = {};

  return new Promise((resolve, reject) => {
    const unzip = new Unzip();

    unzip.register(UnzipInflate);

    unzip.onfile = file => {
      const name = feedFileOf(file.name);

      if (name === undefined) {
        return;
      }

      const decoder = new TextDecoder();
      let text = "";
      let done = false;

      file.ondata = (err, data, final) => {
        if (err) {
          throw err;
        }

        if (done) {
          return;
        }

        text += decoder.decode(data, { stream: !final });

        const end = text.search(/\r?\n/);

        if (end !== -1 || final) {
          done = true;
          headers[name] = parseHeader(end === -1 ? text : text.slice(0, end));
          file.terminate();
        }
      };

      file.start();
    };

    (async () => {
      for await (const chunk of toChunks(source)) {
        unzip.push(chunk);
      }

      unzip.push(new Uint8Array(0), true);
    })().then(() => resolve(headers), reject);
  });
}

/**
 * The column names of a header row, without a byte order mark and with any quoting taken off. A
 * header has no reason to quote a column name, but nothing stops a producer doing it. Not trimmed,
 * because CSVParser matches a column by its name exactly as the header spells it.
 */
function parseHeader(line: string): string[] {
  return line
    .replace(/^﻿/, "")
    .split(",")
    .map(column => column.replace(/^"(.*)"$/, "$1"))
    .filter(column => column !== "");
}
