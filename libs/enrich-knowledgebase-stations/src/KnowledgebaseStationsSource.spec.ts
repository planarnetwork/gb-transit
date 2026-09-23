import {describe, it, expect} from "vitest";
import {parseKnowledgebaseStations} from "./KnowledgebaseStationsSource";

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

  it("says so rather than enriching nothing when the feed changes shape", () => {
    // An empty result would be indistinguishable from a source that matched no
    // stations, and the build would publish a feed quietly missing this.
    expect(() => parseKnowledgebaseStations(JSON.stringify({}))).to.throw(/no stations/);
    expect(() => parseKnowledgebaseStations(JSON.stringify({stations: {}}))).to.throw(/no stations/);
  });

});
