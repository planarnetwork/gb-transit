import * as fs from "node:fs";
import * as zlib from "node:zlib";

/**
 * Write a zip holding the given files, deflated unless `stored` is set. Enough of the format for ZipFile to read.
 */
export function writeZip(path: string, files: {[name: string]: string}, stored: boolean = false): void {
  const locals: Buffer[] = [];
  const central: Buffer[] = [];
  let offset = 0;

  for (const [name, content] of Object.entries(files)) {
    const raw = Buffer.from(content, "latin1");
    const data = stored ? raw : zlib.deflateRawSync(raw);
    const nameBytes = Buffer.from(name, "latin1");
    const local = Buffer.alloc(30);

    local.writeUInt32LE(0x04034b50, 0);
    local.writeUInt16LE(stored ? 0 : 8, 8);
    local.writeUInt32LE(data.length, 18);
    local.writeUInt32LE(raw.length, 22);
    local.writeUInt16LE(nameBytes.length, 26);

    const header = Buffer.alloc(46);

    header.writeUInt32LE(0x02014b50, 0);
    header.writeUInt16LE(stored ? 0 : 8, 10);
    header.writeUInt32LE(data.length, 20);
    header.writeUInt32LE(raw.length, 24);
    header.writeUInt16LE(nameBytes.length, 28);
    header.writeUInt32LE(offset, 42);

    locals.push(local, nameBytes, data);
    central.push(header, nameBytes);
    offset += local.length + nameBytes.length + data.length;
  }

  const directory = Buffer.concat(central);
  const end = Buffer.alloc(22);

  end.writeUInt32LE(0x06054b50, 0);
  end.writeUInt16LE(Object.keys(files).length, 8);
  end.writeUInt16LE(Object.keys(files).length, 10);
  end.writeUInt32LE(directory.length, 12);
  end.writeUInt32LE(offset, 16);

  fs.writeFileSync(path, Buffer.concat([...locals, directory, end]));
}

/**
 * Lines as a DTD file: a comment header and CRLF line endings
 */
export function feedFile(lines: string[]): string {
  return ["/!! Start of file", ...lines, "/!! End of file"].join("\r\n") + "\r\n";
}
