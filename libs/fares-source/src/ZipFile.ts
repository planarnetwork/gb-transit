import * as fs from "node:fs";
import * as zlib from "node:zlib";
import {Readable} from "node:stream";

const END_OF_CENTRAL_DIRECTORY = 0x06054b50;
const CENTRAL_DIRECTORY_HEADER = 0x02014b50;
const LOCAL_FILE_HEADER = 0x04034b50;
const STORED = 0;
const DEFLATED = 8;
// the end of central directory record is 22 bytes followed by a comment of up to 65535
const MAX_TAIL = 22 + 0xffff;

export interface ZipEntry {
  readonly name: string;
  readonly method: number;
  readonly compressedSize: number;
  readonly localHeaderOffset: number;
}

/**
 * The entries of a zip file, read from its central directory so any entry can be streamed without reading the ones
 * before it. Inflation is done by node's zlib rather than in JavaScript.
 *
 * The DTD feeds are well under 4GB so ZIP64 is not supported.
 */
export class ZipFile {

  private constructor(
    public readonly path: string,
    public readonly entries: readonly ZipEntry[]
  ) {}

  public static open(path: string): ZipFile {
    const fd = fs.openSync(path, "r");

    try {
      return new ZipFile(path, readCentralDirectory(fd, path));
    }
    finally {
      fs.closeSync(fd);
    }
  }

  /**
   * The decompressed content of an entry
   */
  public stream(entry: ZipEntry): Readable {
    const fd = fs.openSync(this.path, "r");
    const header = Buffer.alloc(30);

    try {
      fs.readSync(fd, header, 0, 30, entry.localHeaderOffset);
    }
    catch (err) {
      fs.closeSync(fd);
      throw err;
    }

    if (header.readUInt32LE(0) !== LOCAL_FILE_HEADER) {
      fs.closeSync(fd);
      throw new Error(`${this.path}: no local header for ${entry.name}`);
    }

    const start = entry.localHeaderOffset + 30 + header.readUInt16LE(26) + header.readUInt16LE(28);
    const raw = fs.createReadStream("", {fd, start, end: start + entry.compressedSize - 1, highWaterMark: 1 << 20});

    if (entry.method === STORED) {
      return raw;
    }

    const inflate = zlib.createInflateRaw({chunkSize: 1 << 20});

    raw.on("error", err => inflate.destroy(err));

    return raw.pipe(inflate);
  }

}

function readCentralDirectory(fd: number, path: string): ZipEntry[] {
  const fileSize = fs.fstatSync(fd).size;
  const tailLength = Math.min(fileSize, MAX_TAIL);
  const tail = Buffer.alloc(tailLength);

  fs.readSync(fd, tail, 0, tailLength, fileSize - tailLength);

  let eocd = -1;
  for (let i = tailLength - 22; i >= 0; i--) {
    if (tail.readUInt32LE(i) === END_OF_CENTRAL_DIRECTORY) {
      eocd = i;
      break;
    }
  }

  if (eocd === -1) {
    throw new Error(`${path} is not a zip file`);
  }

  const count = tail.readUInt16LE(eocd + 10);
  const size = tail.readUInt32LE(eocd + 12);
  const offset = tail.readUInt32LE(eocd + 16);

  if (count === 0xffff || size === 0xffffffff || offset === 0xffffffff) {
    throw new Error(`${path} is a ZIP64 file, which is not supported`);
  }

  const directory = Buffer.alloc(size);
  fs.readSync(fd, directory, 0, size, offset);

  const entries: ZipEntry[] = [];

  for (let position = 0, i = 0; i < count; i++) {
    if (directory.readUInt32LE(position) !== CENTRAL_DIRECTORY_HEADER) {
      throw new Error(`${path}: corrupt central directory`);
    }

    const method = directory.readUInt16LE(position + 10);
    const nameLength = directory.readUInt16LE(position + 28);
    const extraLength = directory.readUInt16LE(position + 30);
    const commentLength = directory.readUInt16LE(position + 32);
    const name = directory.toString("latin1", position + 46, position + 46 + nameLength);

    if (method !== STORED && method !== DEFLATED) {
      throw new Error(`${path}: ${name} uses compression method ${method}, which is not supported`);
    }

    entries.push({
      name,
      method,
      compressedSize: directory.readUInt32LE(position + 20),
      localHeaderOffset: directory.readUInt32LE(position + 42)
    });

    position += 46 + nameLength + extraLength + commentLength;
  }

  return entries;
}

/**
 * Call back with every line of the stream, without line endings. Blank lines and the `/!!` comments are skipped.
 */
export async function eachLine(stream: Readable, onLine: (line: string) => void): Promise<void> {
  let remainder = "";

  for await (const chunk of stream) {
    const text = remainder + (chunk as Buffer).toString("latin1");
    let start = 0;
    let end = text.indexOf("\n");

    while (end !== -1) {
      emit(text, start, end, onLine);
      start = end + 1;
      end = text.indexOf("\n", start);
    }

    remainder = text.slice(start);
  }

  emit(remainder, 0, remainder.length, onLine);
}

function emit(text: string, start: number, end: number, onLine: (line: string) => void): void {
  if (end > start && text.charCodeAt(end - 1) === 13) {
    end--;
  }
  if (end > start && text.charCodeAt(start) !== 47) {
    onLine(text.slice(start, end));
  }
}
