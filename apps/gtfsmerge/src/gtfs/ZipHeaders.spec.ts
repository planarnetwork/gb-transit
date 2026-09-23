import {describe, it, expect, beforeAll, vi} from "vitest";
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import {strToU8, zipSync} from "fflate";
import {readHeaders} from "./ZipHeaders";

let dir: string;

beforeAll(() => {
  dir = fs.mkdtempSync(path.join(os.tmpdir(), "zip-headers"));
});

function write(name: string, bytes: Uint8Array): string {
  const file = path.join(dir, name);

  fs.writeFileSync(file, bytes);

  return file;
}

/** Rows that deflate badly, so the compressed data runs well past one read. */
function noisyStopTimes(rows: number): string {
  let seed = 7;
  const next = () => (seed = (seed * 1103515245 + 12345) % 2147483648);
  const lines = ["trip_id,arrival_time,departure_time,stop_id,stop_sequence"];

  for (let i = 0; i < rows; i++) {
    lines.push(`t${next()},${next() % 24}:00:00,${next() % 60}:00:00,s${next()},${i}`);
  }

  return lines.join("\n") + "\n";
}

describe("readHeaders", () => {

  it("gives the header of each feed file, and nothing for a file a feed does not have", async () => {
    const file = write("plain.zip", zipSync({
      "stops.txt": strToU8("stop_id,stop_name,platform_code\r\ns1,One,2\n"),
      "transfers.txt": strToU8("from_stop_id,to_stop_id,transfer_type,min_transfer_time,mode\n"),
      "fare_rules.txt": strToU8("fare_id,route_id\n")
    }));

    expect(await readHeaders(file)).to.deep.equal({
      "stops.txt": ["stop_id", "stop_name", "platform_code"],
      "transfers.txt": ["from_stop_id", "to_stop_id", "transfer_type", "min_transfer_time", "mode"]
    });
  });

  it("reads a header as the rows are read: past a blank line, without a byte order mark, quotes and all", async () => {
    const file = write("awkward.zip", zipSync({
      "agency.txt": strToU8("\n﻿agency_id,\"odd, name\",agency_name\na1,x,A\n"),
      "routes.txt": strToU8("route_id,route_type")
    }));

    expect(await readHeaders(file)).to.deep.equal({
      "agency.txt": ["agency_id", "odd, name", "agency_name"],
      "routes.txt": ["route_id", "route_type"]
    });
  });

  it("reads an entry stored rather than deflated", async () => {
    const file = write("stored.zip", zipSync({"trips.txt": strToU8("route_id,service_id,trip_id\nr,s,t\n")}, {level: 0}));

    expect(await readHeaders(file)).to.deep.equal({"trips.txt": ["route_id", "service_id", "trip_id"]});
  });

  /**
   * The whole point: a national feed's stop_times.txt is gigabytes, and its header is the first
   * line. Counting what is read from disk shows the rest of it is never touched.
   */
  it("reads a large file only as far as its header", async () => {
    const zip = zipSync({"stop_times.txt": strToU8(noisyStopTimes(100_000)), "trips.txt": strToU8("trip_id\n")});
    const file = write("large.zip", zip);
    const open = fs.promises.open;
    let bytesRead = 0;

    vi.spyOn(fs.promises, "open").mockImplementation(async (...args: Parameters<typeof open>) => {
      const handle = await open(...args);
      const read = handle.read.bind(handle) as (...a: unknown[]) => Promise<fs.promises.FileReadResult<Buffer>>;

      handle.read = (async (...a: unknown[]) => {
        const result = await read(...a);

        bytesRead += result.bytesRead;

        return result;
      }) as typeof handle.read;

      return handle;
    });

    const headers = await readHeaders(file);

    vi.restoreAllMocks();

    expect(headers).to.deep.equal({
      "stop_times.txt": ["trip_id", "arrival_time", "departure_time", "stop_id", "stop_sequence"],
      "trips.txt": ["trip_id"]
    });
    expect(zip.length).to.be.greaterThan(1_000_000);
    expect(bytesRead).to.be.lessThan(zip.length / 10);
  });

  it("finds its way round a ZIP64 archive", async () => {
    expect(await readHeaders(write("zip64.zip", zip64("stops.txt", "stop_id,stop_name\ns1,One\n"))))
      .to.deep.equal({"stops.txt": ["stop_id", "stop_name"]});
  });

});

/**
 * One stored entry in a zip whose sizes, offset and entry count are all in the ZIP64 records, as a
 * zip over 4GB has them. fflate does not write these, so it is built by hand.
 */
function zip64(name: string, text: string): Uint8Array {
  const data = Buffer.from(text);
  const fileName = Buffer.from(name);
  const size = BigInt(data.length);

  const local = Buffer.alloc(30 + fileName.length + 20);
  local.writeUInt32LE(0x04034b50, 0);
  local.writeUInt16LE(45, 4);
  local.writeUInt32LE(0xffffffff, 18);
  local.writeUInt32LE(0xffffffff, 22);
  local.writeUInt16LE(fileName.length, 26);
  local.writeUInt16LE(20, 28);
  fileName.copy(local, 30);
  local.writeUInt16LE(1, 30 + fileName.length);
  local.writeUInt16LE(16, 32 + fileName.length);
  local.writeBigUInt64LE(size, 34 + fileName.length);
  local.writeBigUInt64LE(size, 42 + fileName.length);

  const central = Buffer.alloc(46 + fileName.length + 28);
  central.writeUInt32LE(0x02014b50, 0);
  central.writeUInt16LE(45, 4);
  central.writeUInt16LE(45, 6);
  central.writeUInt32LE(0xffffffff, 20);
  central.writeUInt32LE(0xffffffff, 24);
  central.writeUInt16LE(fileName.length, 28);
  central.writeUInt16LE(28, 30);
  central.writeUInt32LE(0xffffffff, 42);
  fileName.copy(central, 46);
  central.writeUInt16LE(1, 46 + fileName.length);
  central.writeUInt16LE(24, 48 + fileName.length);
  central.writeBigUInt64LE(size, 50 + fileName.length);
  central.writeBigUInt64LE(size, 58 + fileName.length);
  central.writeBigUInt64LE(0n, 66 + fileName.length);

  const directoryOffset = BigInt(local.length + data.length);
  const end64 = Buffer.alloc(56);
  end64.writeUInt32LE(0x06064b50, 0);
  end64.writeBigUInt64LE(44n, 4);
  end64.writeUInt16LE(45, 12);
  end64.writeUInt16LE(45, 14);
  end64.writeBigUInt64LE(1n, 24);
  end64.writeBigUInt64LE(1n, 32);
  end64.writeBigUInt64LE(BigInt(central.length), 40);
  end64.writeBigUInt64LE(directoryOffset, 48);

  const locator = Buffer.alloc(20);
  locator.writeUInt32LE(0x07064b50, 0);
  locator.writeBigUInt64LE(directoryOffset + BigInt(central.length), 8);
  locator.writeUInt32LE(1, 16);

  const end = Buffer.alloc(22);
  end.writeUInt32LE(0x06054b50, 0);
  end.writeUInt16LE(0xffff, 8);
  end.writeUInt16LE(0xffff, 10);
  end.writeUInt32LE(0xffffffff, 12);
  end.writeUInt32LE(0xffffffff, 16);

  return Buffer.concat([local, data, central, end64, locator, end]);
}
