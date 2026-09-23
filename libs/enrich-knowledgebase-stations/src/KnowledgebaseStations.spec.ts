import {describe, it, expect} from "vitest";
import {MutableFeed} from "@gb-transit/gtfs";
import type {Stop} from "@gb-transit/gtfs";
import {
  KNOWLEDGEBASE_STATIONS,
  KnowledgebaseStationsEnricher,
  stationUrl
} from "./KnowledgebaseStations";
import type {KnowledgebaseStation} from "./KnowledgebaseStations";
import type {StepFreeCategory} from "./StepFree";

const station = (crs: string, wheelchair: 0 | 1 | 2 = 0): Stop => ({
  stop_id: `910G${crs}`, crs, tiploc: crs, stop_name: crs, stop_desc: "", stop_lat: 51,
  stop_lon: -1, zone_id: 0, stop_url: "", location_type: 1, parent_station: null,
  platform_code: null, stop_timezone: "Europe/London", wheelchair_boarding: wheelchair, located: true
});

const known = (crs: string, stepFree: StepFreeCategory | undefined): KnowledgebaseStation =>
  ({crs, name: crs, slug: crs.toLowerCase(), stepFree});

const enrich = (stops: Stop[], stations: KnowledgebaseStation[]) => {
  const feed = new MutableFeed(stops, [], []);
  const report = new KnowledgebaseStationsEnricher(async () => stations).apply(feed, stations);

  return {feed, report};
};

describe("KnowledgebaseStationsEnricher", () => {

  it("says a station with step-free access to every platform is accessible", () => {
    const stop = station("ABW");

    enrich([stop], [known("ABW", "A")]);

    expect(stop.wheelchair_boarding).to.equal(1);
  });

  it("says a station with step-free access to some platforms is accessible", () => {
    // B3 reaches only some platforms, which GTFS still calls 1: the question
    // the field answers is whether a path exists, not how good it is.
    const stop = station("BHM");

    enrich([stop], [known("BHM", "B3")]);

    expect(stop.wheelchair_boarding).to.equal(1);
  });

  it("says a station with no step-free access at all is not", () => {
    const stop = station("ACB");

    enrich([stop], [known("ACB", "C")]);

    expect(stop.wheelchair_boarding).to.equal(2);
  });

  it("leaves an unclassified station exactly as it found it", () => {
    // Writing the 0 that means "no information" would replace the value the
    // override file has with an assertion that nobody knows.
    const stop = station("BDS", 2);

    const {report} = enrich([stop], [known("BDS", undefined)]);

    expect(stop.wheelchair_boarding).to.equal(2);
    expect(report.notes).to.include("1 stations have no step-free category, so their accessibility was left alone");
  });

  it("points at the station's own page", () => {
    const stop = station("ABW");

    enrich([stop], [known("ABW", "A")]);

    expect(stop.stop_url).to.equal("https://www.nationalrail.co.uk/stations/abw/");
  });

  it("leaves stop_desc alone, which carries the interchange status", () => {
    const stop = {...station("ABE"), stop_desc: "3"};

    enrich([stop], [known("ABE", "B2")]);

    expect(stop.stop_desc).to.equal("3");
  });

  it("counts a stop the Knowledgebase does not cover, and says what those are", () => {
    // The feed also carries the Underground, the Metro, trams, ferries and
    // buses. None of them has a Knowledgebase record, and an unexplained number
    // invites somebody to chase it.
    const {report} = enrich([station("ABW"), station("AAA")], [known("ABW", "A")]);

    expect(report.matched).to.equal(1);
    expect(report.unmatched).to.equal(1);
    expect(report.notes).to.include(
      "1 stops are not National Rail stations, so the Knowledgebase does not cover them"
    );
  });

  it("counts a station the Knowledgebase has and this feed does not", () => {
    const {report} = enrich([station("ABW")], [known("ABW", "A"), known("XXX", "A")]);

    expect(report.notes).to.include("1 Knowledgebase stations are not in this feed");
  });

  it("does not reach a platform, which has a station above it", () => {
    const platform = {...station("ABW"), stop_id: "9100ABW1", location_type: 0 as const, parent_station: "910GABW"};

    enrich([station("ABW"), platform], [known("ABW", "C")]);

    expect(platform.wheelchair_boarding).to.equal(0);
  });

  it("records who wrote every field it wrote", () => {
    const {feed} = enrich([station("ABW")], [known("ABW", "A")]);
    const written = feed.ledger.entries().filter(entry => entry.by === KNOWLEDGEBASE_STATIONS);

    expect(written.map(entry => entry.field)).to.deep.equal(["stop_url", "wheelchair_boarding"]);
  });

  it("writes only what an apply list allows", () => {
    const stop = station("ACB");
    const allowed = new Map([[KNOWLEDGEBASE_STATIONS, new Set(["wheelchair_boarding"])]]);
    const feed = new MutableFeed([stop], [], [], undefined, allowed);

    new KnowledgebaseStationsEnricher(async () => []).apply(feed, [known("ACB", "C")]);

    expect(stop.wheelchair_boarding).to.equal(2);
    expect(stop.stop_url).to.equal("");
  });

});

describe("stationUrl", () => {

  it("is the slug the Knowledgebase publishes, not the CRS", () => {
    expect(stationUrl("abbey-wood")).to.equal("https://www.nationalrail.co.uk/stations/abbey-wood/");
  });

});
