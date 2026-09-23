import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import {afterEach, beforeEach, describe, expect, it} from "vitest";
import {ZipFile} from "./ZipFile";
import {feedFile, writeZip} from "../test/WriteZip";

const OPEN_FILES = "/proc/self/fd";

describe("ZipFile", () => {
  let directory: string;

  beforeEach(() => {
    directory = fs.mkdtempSync(path.join(os.tmpdir(), "zip-file"));
  });

  afterEach(() => {
    fs.rmSync(directory, {recursive: true, force: true});
  });

  async function lines(zip: ZipFile, name: string): Promise<string[]> {
    const result: string[] = [];
    await zip.eachLine(zip.entries.find(e => e.name === name)!, line => result.push(line));

    return result;
  }

  it("reads stored and deflated entries", async () => {
    writeZip(path.join(directory, "deflated.zip"), {"A.TXT": feedFile(["one", "two"])});
    writeZip(path.join(directory, "stored.zip"), {"A.TXT": feedFile(["one", "two"])}, true);

    expect(await lines(ZipFile.open(path.join(directory, "deflated.zip")), "A.TXT")).toEqual(["one", "two"]);
    expect(await lines(ZipFile.open(path.join(directory, "stored.zip")), "A.TXT")).toEqual(["one", "two"]);
  });

  it("reads an empty entry as no lines", async () => {
    writeZip(path.join(directory, "stored.zip"), {"EMPTY.TXT": ""}, true);
    writeZip(path.join(directory, "deflated.zip"), {"EMPTY.TXT": ""});

    expect(await lines(ZipFile.open(path.join(directory, "stored.zip")), "EMPTY.TXT")).toEqual([]);
    expect(await lines(ZipFile.open(path.join(directory, "deflated.zip")), "EMPTY.TXT")).toEqual([]);
  });

  describe.skipIf(!fs.existsSync(OPEN_FILES))("closes the file", () => {

    it("when the reader stops early", async () => {
      writeZip(path.join(directory, "feed.zip"), {"A.TXT": "x".repeat(1 << 22)});

      const zip = ZipFile.open(path.join(directory, "feed.zip"));
      const before = openFiles();

      for await (const _ of zip.stream(zip.entries[0])) {
        break;
      }

      expect(await settled(before)).toBe(before);
    });

    it("when an entry is corrupt", async () => {
      const file = path.join(directory, "corrupt.zip");

      writeZip(file, {"A.TXT": "not deflated at all"}, true);
      markDeflated(file);

      const zip = ZipFile.open(file);
      const before = openFiles();

      await expect(lines(zip, "A.TXT")).rejects.toThrow();
      expect(await settled(before)).toBe(before);
    });

  });
});

function openFiles(): number {
  return fs.readdirSync(OPEN_FILES).length;
}

/**
 * The number of open files once any closing has happened, which is after the stream has finished being destroyed
 */
async function settled(expected: number): Promise<number> {
  for (let i = 0; i < 50 && openFiles() !== expected; i++) {
    await new Promise(resolve => setTimeout(resolve, 10));
  }

  return openFiles();
}

/**
 * Claim that a stored entry is deflated, so inflating it fails
 */
function markDeflated(file: string): void {
  const zip = fs.readFileSync(file);

  zip.writeUInt16LE(8, 8);
  zip.writeUInt16LE(8, zip.indexOf(Buffer.from([0x50, 0x4b, 0x01, 0x02])) + 10);
  fs.writeFileSync(file, zip);
}
