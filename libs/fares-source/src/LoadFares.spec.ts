import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import {afterEach, beforeEach, describe, expect, it} from "vitest";
import {loadFares} from "./LoadFares";
import {feedFile, writeZip} from "../test/WriteZip";

function flow(origin: string, destination: string, route: string, id: number, end: string, start: string, direction = "R"): string {
  return `RF${origin}${destination}${route}000A${direction}${end}${start}ATO000${String(id).padStart(7, "0")}`;
}

function fare(id: number, ticket: string, price: number, restriction = "  "): string {
  return `RT${String(id).padStart(7, "0")}${ticket}${String(price).padStart(8, "0")}${restriction}`;
}

function cluster(id: string, nlc: string, end: string): string {
  return `R${id}${nlc}${end}01012020`;
}

describe("loadFares", () => {
  let directory: string;

  beforeEach(() => {
    directory = fs.mkdtempSync(path.join(os.tmpdir(), "load-fares"));
    writeZip(path.join(directory, "RJFAF001.ZIP"), {
      "RJFAF001.FFL": feedFile([
        flow("1111", "2222", "00000", 1, "31122999", "01012020"),
        flow("1111", "3333", "00700", 2, "31122020", "01012020", "S"),
        fare(1, "SOS", 1000, "B1"),
        fare(1, "SDS", 2000),
        fare(2, "SOS", 3000)
      ]),
      "RJFAF001.LOC": feedFile([]),
      "RJFAF001.FSC": feedFile([cluster("Q001", "1111", "31122999"), cluster("Q001", "2222", "31122020")]),
      "RJFAF001.TTY": feedFile([]),
      "RJFAF001.NFO": feedFile([])
    });
  });

  afterEach(() => {
    fs.rmSync(directory, {recursive: true, force: true});
  });

  it("loads flows and fares into columns", async () => {
    const data = await loadFares(directory);
    const {flows, fares, codes} = data;

    expect(flows.length).toBe(2);
    expect(Array.from(flows.flowId)).toEqual([1, 2]);
    expect(codes.locations.value(flows.origin[1])).toBe("1111");
    expect(codes.locations.value(flows.destination[1])).toBe("3333");
    expect(codes.routes.value(flows.route[1])).toBe("00700");
    expect(String.fromCharCode(flows.direction[1])).toBe("S");
    expect(String.fromCharCode(flows.usage[0])).toBe("A");
    expect(flows.endDate[1]).toBe(20201231);

    expect(fares.length).toBe(3);
    expect(Array.from(fares.price)).toEqual([1000, 2000, 3000]);
    expect(Array.from(fares.ticket, t => codes.tickets.value(t))).toEqual(["SOS", "SDS", "SOS"]);
    expect(Array.from(fares.restriction, r => codes.restrictions.value(r))).toEqual(["B1", "", ""]);
    expect(data.stationClusters.map(c => c.nlc)).toEqual(["1111", "2222"]);
  });

  it("keeps only records valid on the date, and fares on those flows", async () => {
    const {flows, fares, stationClusters} = await loadFares(directory, {date: "2026-09-22"});

    expect(Array.from(flows.flowId)).toEqual([1]);
    expect(Array.from(fares.flowId)).toEqual([1, 1]);
    expect(stationClusters.map(c => c.nlc)).toEqual(["1111"]);
  });
});
