import {describe, it, expect} from "vitest";
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import {knowledgebaseStationsFile, parseKnowledgebaseStations} from "./KnowledgebaseStationsSource";

const feed = (...stations: object[]) => JSON.stringify({stations});

const station = (crs: string, category: string | null) => ({
  name: `${crs} station`,
  slug: crs.toLowerCase(),
  crsCode: crs,
  stationAccessibility: {stepFreeCategory: {category, notes: null, levelAccess: null}}
});

describe("parseKnowledgebaseStations", () => {

  it("reads a station down to the parts a stop has a field for", () => {
    const [parsed] = parseKnowledgebaseStations(feed({
      name: "Abbey Wood",
      slug: "abbey-wood",
      crsCode: "ABW",
      nationalLocationCode: "513100",
      minimumConnectionTime: 4,
      stationAccessibility: {
        stepFreeCategory: {
          category: "A, Compliant step-free access to all platform(s)",
          notes: "<p>This station has step-free access to all platforms.</p>",
          levelAccess: null
        }
      }
    }));

    expect(parsed).to.deep.equal({
      crs: "ABW",
      name: "Abbey Wood",
      slug: "abbey-wood",
      stepFree: "A"
    });
  });

  it("drops a record with no CRS, which is the only thing it joins on", () => {
    expect(parseKnowledgebaseStations(feed({...station("ABW", "A"), crsCode: null}))).to.deep.equal([]);
  });

  it("keeps a station the Knowledgebase has not classified", () => {
    // Its name and its page are still worth having, and leaving it out would
    // count it as a station the feed has and the source does not.
    const [parsed] = parseKnowledgebaseStations(feed(station("BDS", null)));

    expect(parsed.crs).to.equal("BDS");
    expect(parsed.stepFree).to.equal(undefined);
  });

  it("survives a station missing the whole accessibility section", () => {
    const [parsed] = parseKnowledgebaseStations(feed({name: "Nowhere", slug: "nowhere", crsCode: "NWH"}));

    expect(parsed).to.deep.equal({crs: "NWH", name: "Nowhere", slug: "nowhere", stepFree: undefined});
  });

  it("refuses two records for one CRS rather than taking the last", () => {
    // Taking the last would give one station another's accessibility, and the
    // report would call the loser a station "not in this feed".
    expect(() => parseKnowledgebaseStations(feed(station("ABW", "A"), station("ABW", "C"))))
      .to.throw(/two stations with the CRS code ABW/);
  });

  it("says so rather than enriching nothing when the feed changes shape", () => {
    // An empty result would be indistinguishable from a source that matched no
    // stations, and the build would publish a feed quietly missing this.
    expect(() => parseKnowledgebaseStations(JSON.stringify({}))).to.throw(/no stations/);
    expect(() => parseKnowledgebaseStations(JSON.stringify({stations: {}}))).to.throw(/no stations/);
  });

});

describe("knowledgebaseStationsFile", () => {

  const scratch = () => fs.mkdtempSync(path.join(os.tmpdir(), "kb-source-"));
  const cached = (dir: string) => path.join(dir, "knowledgebase-stations.json");

  it("uses a current copy without asking for a key", async () => {
    const dir = scratch();

    fs.writeFileSync(cached(dir), "{}");

    expect(await knowledgebaseStationsFile(dir, "")()).to.equal(cached(dir));
  });

  /**
   * The promise the config makes. A step-free category moves when a lift is
   * commissioned rather than hourly, so a stale answer is right about almost
   * every station and is worth more than a nightly that did not build.
   */
  it("falls back to a stale copy rather than failing the build", async () => {
    const dir = scratch();

    fs.writeFileSync(cached(dir), "{}");
    fs.utimesSync(cached(dir), new Date(0), new Date(0));

    const warnings: string[] = [];
    const warn = console.warn;

    console.warn = (m: string) => warnings.push(m);

    try {
      expect(await knowledgebaseStationsFile(dir, "")()).to.equal(cached(dir));
    }
    finally {
      console.warn = warn;
    }

    // Loud and dated, because a cache quietly months old is how a source stops
    // being updated without anybody noticing.
    expect(warnings.join(" ")).to.match(/stale copy .* last written 1970-01-01/);
  });

  it("fails when there is no copy at all to fall back to", async () => {
    await expect(knowledgebaseStationsFile(scratch(), "")()).rejects.toThrow(/subscription key/);
  });

});
