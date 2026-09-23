import * as fs from "node:fs";
import {Inflate} from "fflate";
import {CSVParser, FeedFileName, feedFileOf} from "@gb-transit/gtfs-loader";

/** How much of an entry's compressed data is read at a time, looking for the end of its header. */
const CHUNK = 64 * 1024;

const END_OF_CENTRAL_DIRECTORY = 0x06054b50;
const ZIP64_END_OF_CENTRAL_DIRECTORY = 0x06064b50;
const ZIP64_LOCATOR = 0x07064b50;
const CENTRAL_DIRECTORY_ENTRY = 0x02014b50;
const LOCAL_HEADER = 0x04034b50;
const ZIP64_EXTRA = 0x0001;
const STORED = 0;
const DEFLATED = 8;
/** A 32-bit size or offset that says the real one is in the ZIP64 extra field. */
const SEE_ZIP64 = 0xffffffff;

interface Entry {
  readonly name: string;
  readonly method: number;
  readonly compressedSize: number;
  readonly offset: number;
}

/**
 * The header row of each file in a feed, read from the start of each entry and nothing more.
 *
 * A merge has to know every column it will meet before it writes a row - each file is opened with
 * its header - so it asks this of every input first. Reading forward through the zip to get there
 * would mean decompressing all of it, stop_times.txt and shapes.txt included, which for a national
 * bus feed is gigabytes spent on a line each. So the zip is read the way it is meant to be read at
 * random: the central directory at the end says where each entry is, and only enough of an entry
 * is decompressed to reach the end of its first row.
 *
 * The header is parsed by CSVParser, so a blank line before it, a byte order mark and a quoted name
 * read exactly as they do when the rows themselves are read.
 */
export async function readHeaders(file: string): Promise<Partial<Record<FeedFileName, string[]>>> {
  const handle = await fs.promises.open(file, "r");

  try {
    const headers: Partial<Record<FeedFileName, string[]>> = {};

    for (const entry of await centralDirectory(handle)) {
      const name = feedFileOf(entry.name);

      if (name !== undefined) {
        headers[name] = await headerOf(handle, entry);
      }
    }

    return headers;
  }
  finally {
    await handle.close();
  }
}

async function read(handle: fs.promises.FileHandle, position: number, length: number): Promise<Buffer> {
  const buffer = Buffer.alloc(length);
  const {bytesRead} = await handle.read(buffer, 0, length, position);

  return buffer.subarray(0, bytesRead);
}

/**
 * Every entry the central directory lists, with where its data starts and how it is compressed.
 */
async function centralDirectory(handle: fs.promises.FileHandle): Promise<Entry[]> {
  const {size} = await handle.stat();
  // The end record is 22 bytes and a comment of up to 64KB can follow it.
  const tailStart = Math.max(0, size - 22 - 0xffff);
  const tail = await read(handle, tailStart, size - tailStart);
  let end = -1;

  for (let i = tail.length - 22; i >= 0; i--) {
    if (tail.readUInt32LE(i) === END_OF_CENTRAL_DIRECTORY) {
      end = i;
      break;
    }
  }

  if (end === -1) {
    throw new Error("Not a zip: no end of central directory record");
  }

  let count = tail.readUInt16LE(end + 10);
  let directoryOffset = tail.readUInt32LE(end + 16);

  // ZIP64, for a zip whose directory or entries are past what 32 bits can say
  if (end >= 20 && tail.readUInt32LE(end - 20) === ZIP64_LOCATOR) {
    const zip64End = Number(tail.readBigUInt64LE(end - 20 + 8));
    const record = await read(handle, zip64End, 56);

    if (record.readUInt32LE(0) === ZIP64_END_OF_CENTRAL_DIRECTORY) {
      count = Number(record.readBigUInt64LE(32));
      directoryOffset = Number(record.readBigUInt64LE(48));
    }
  }

  const directory = await read(handle, directoryOffset, size - directoryOffset);
  const entries: Entry[] = [];
  let at = 0;

  for (let i = 0; i < count && at + 46 <= directory.length; i++) {
    if (directory.readUInt32LE(at) !== CENTRAL_DIRECTORY_ENTRY) {
      throw new Error(`Corrupt zip: central directory entry ${i} is not where the directory says`);
    }

    const method = directory.readUInt16LE(at + 10);
    let compressedSize = directory.readUInt32LE(at + 20);
    const uncompressedSize = directory.readUInt32LE(at + 24);
    const nameLength = directory.readUInt16LE(at + 28);
    const extraLength = directory.readUInt16LE(at + 30);
    const commentLength = directory.readUInt16LE(at + 32);
    let offset = directory.readUInt32LE(at + 42);
    const name = directory.toString("utf8", at + 46, at + 46 + nameLength);
    const extra = directory.subarray(at + 46 + nameLength, at + 46 + nameLength + extraLength);

    // The ZIP64 field holds only the values its 32-bit slots gave up on, in this order.
    for (let e = 0; e + 4 <= extra.length;) {
      const id = extra.readUInt16LE(e);
      const length = extra.readUInt16LE(e + 2);

      if (id === ZIP64_EXTRA) {
        let field = e + 4;

        if (uncompressedSize === SEE_ZIP64) {
          field += 8;
        }

        if (compressedSize === SEE_ZIP64) {
          compressedSize = Number(extra.readBigUInt64LE(field));
          field += 8;
        }

        if (offset === SEE_ZIP64) {
          offset = Number(extra.readBigUInt64LE(field));
        }
      }

      e += 4 + length;
    }

    entries.push({name, method, compressedSize, offset});
    at += 46 + nameLength + extraLength + commentLength;
  }

  return entries;
}

/**
 * The header of one entry, decompressing a chunk at a time until CSVParser has read it.
 */
async function headerOf(handle: fs.promises.FileHandle, entry: Entry): Promise<string[]> {
  const local = await read(handle, entry.offset, 30);

  if (local.readUInt32LE(0) !== LOCAL_HEADER) {
    throw new Error(`Corrupt zip: ${entry.name} is not where the directory says`);
  }

  const start = entry.offset + 30 + local.readUInt16LE(26) + local.readUInt16LE(28);
  const end = start + entry.compressedSize;
  const decoder = new TextDecoder();
  const parser = new CSVParser([], () => {});
  let text = "";

  if (entry.method !== STORED && entry.method !== DEFLATED) {
    throw new Error(`${entry.name} is compressed with method ${entry.method}, which a feed is not`);
  }

  const inflate = new Inflate((data, final) => {
    text += decoder.decode(data, {stream: !final});
  });

  for (let at = start; at < end && parser.header === undefined; at += CHUNK) {
    const chunk = await read(handle, at, Math.min(CHUNK, end - at));
    const last = at + chunk.length >= end;

    if (entry.method === STORED) {
      text += decoder.decode(chunk, {stream: !last});
    }
    else {
      inflate.push(chunk, last);
    }

    parser.write(text);
    text = "";

    if (last) {
      parser.end();
    }
  }

  return [...parser.header ?? []];
}
