import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import {afterEach, beforeEach, describe, expect, it} from "vitest";
import schema from "@gb-transit/dtd-schema";
import {FeedFile} from "@gb-transit/feed-parser";
import {FaresFeed} from "./FaresFeed";
import {feedFile, writeZip} from "../test/WriteZip";

const {FSC, FFL} = schema.fares as {[extension: string]: FeedFile};

function cluster(action: string, id: string, nlc: string, end = "31122999"): string {
  return `${action}${id}${nlc}${end}01012020`;
}

function flow(action: string, origin: string, destination: string, route: string, id: number): string {
  return `${action}F${origin}${destination}${route}000AR3112299901012020ATO000${String(id).padStart(7, "0")}`;
}

function fare(action: string, id: number, ticket: string, price: number): string {
  return `${action}T${String(id).padStart(7, "0")}${ticket}${String(price).padStart(8, "0")}  `;
}

describe("FaresFeed.files", () => {
  let directory: string;

  beforeEach(() => {
    directory = fs.mkdtempSync(path.join(os.tmpdir(), "fares-feeds"));
  });

  afterEach(() => {
    fs.rmSync(directory, {recursive: true, force: true});
  });

  it("starts at the most recent refresh and orders by sequence", () => {
    for (const name of ["RJFAC848.ZIP", "RJFAF847.ZIP", "RJFAF845.ZIP", "RJFAC846.ZIP", "RJFAC849.ZIP", "RJTTF918.ZIP"]) {
      fs.writeFileSync(path.join(directory, name), "");
    }

    expect(FaresFeed.files(directory).map(f => path.basename(f))).toEqual(["RJFAF847.ZIP", "RJFAC848.ZIP", "RJFAC849.ZIP"]);
  });

  it("rejects files that are not fares feeds", () => {
    const file = path.join(directory, "RJTTF918.ZIP");
    fs.writeFileSync(file, "");

    expect(() => FaresFeed.files(file)).toThrow("not a fares feed");
  });
});

describe("FaresFeed", () => {
  let directory: string;

  beforeEach(() => {
    directory = fs.mkdtempSync(path.join(os.tmpdir(), "fares-feed"));
  });

  afterEach(() => {
    fs.rmSync(directory, {recursive: true, force: true});
  });

  async function lines(extension: string, file: FeedFile): Promise<string[]> {
    const result: string[] = [];
    await new FaresFeed(directory).eachLine(extension, file, line => result.push(line));

    return result;
  }

  it("reads a full file, skipping comments and line endings", async () => {
    writeZip(path.join(directory, "RJFAF001.ZIP"), {
      "RJFAF001.FSC": feedFile([cluster("R", "Q001", "1111"), cluster("R", "Q001", "2222")])
    });

    expect(await lines("FSC", FSC)).toEqual([cluster("R", "Q001", "1111"), cluster("R", "Q001", "2222")]);
  });

  it("reads stored entries", async () => {
    writeZip(path.join(directory, "RJFAF001.ZIP"), {"RJFAF001.FSC": feedFile([cluster("R", "Q001", "1111")])}, true);

    expect(await lines("FSC", FSC)).toEqual([cluster("R", "Q001", "1111")]);
  });

  it("applies inserts, amendments and deletes from change files in order", async () => {
    writeZip(path.join(directory, "RJFAF001.ZIP"), {
      "RJFAF001.FFL": feedFile([
        flow("R", "1111", "2222", "00000", 1),
        flow("R", "1111", "3333", "00000", 2),
        fare("R", 1, "SOS", 1000),
        fare("R", 1, "SDS", 2000),
        fare("R", 2, "SOS", 3000)
      ])
    });
    writeZip(path.join(directory, "RJFAC002.ZIP"), {
      "RJFAC002.FFL": feedFile([
        fare("A", 1, "SOS", 1100),
        fare("D", 1, "SDS", 0),
        fare("I", 2, "SOS", 9999),
        fare("I", 2, "CDS", 500),
        flow("D", "1111", "3333", "00000", 2)
      ])
    });
    writeZip(path.join(directory, "RJFAC003.ZIP"), {
      "RJFAC003.FFL": feedFile([
        fare("I", 1, "SDS", 2200),
        fare("I", 2, "CDS", 600),
        fare("D", 2, "SOS", 0)
      ])
    });

    expect(await lines("FFL", FFL)).toEqual([
      flow("R", "1111", "2222", "00000", 1),
      fare("A", 1, "SOS", 1100),
      fare("I", 1, "SDS", 2200),
      fare("I", 2, "CDS", 500)
    ]);
  });

  it("writes a changed key once when the full file repeats it", async () => {
    writeZip(path.join(directory, "RJFAF001.ZIP"), {"RJFAF001.FSC": feedFile([cluster("R", "Q001", "1111"), cluster("R", "Q001", "1111")])});
    writeZip(path.join(directory, "RJFAC002.ZIP"), {"RJFAC002.FSC": feedFile([cluster("A", "Q001", "1111")])});

    expect(await lines("FSC", FSC)).toEqual([cluster("A", "Q001", "1111")]);
  });

  it("ignores an insert of a key the full file already has", async () => {
    writeZip(path.join(directory, "RJFAF001.ZIP"), {"RJFAF001.FSC": feedFile([cluster("R", "Q001", "1111")])});
    writeZip(path.join(directory, "RJFAC002.ZIP"), {"RJFAC002.FSC": feedFile([cluster("I", "Q001", "1111")])});

    expect(await lines("FSC", FSC)).toEqual([cluster("R", "Q001", "1111")]);
  });

  it("treats a full file inside a change zip as replacing what came before", async () => {
    writeZip(path.join(directory, "RJFAF001.ZIP"), {"RJFAF001.FSC": feedFile([cluster("R", "Q001", "1111")])});
    writeZip(path.join(directory, "RJFAC002.ZIP"), {"RJFAF002.FSC": feedFile([cluster("R", "Q002", "2222")])});
    writeZip(path.join(directory, "RJFAC003.ZIP"), {"RJFAC003.FSC": feedFile([cluster("I", "Q003", "3333")])});

    expect(await lines("FSC", FSC)).toEqual([cluster("R", "Q002", "2222"), cluster("I", "Q003", "3333")]);
  });

  it("fails when there is no full file", async () => {
    writeZip(path.join(directory, "RJFAC002.ZIP"), {"RJFAC002.FSC": feedFile([])});

    await expect(lines("FSC", FSC)).rejects.toThrow("No full FSC file");
  });
});
