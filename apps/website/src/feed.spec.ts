import {describe, it, expect} from "vitest";
import {board, built, date, FEEDS, number, sources} from "./feed.js";
import type {FeedMeta} from "./feed.js";

const feed = (extra: Partial<FeedMeta> = {}): FeedMeta => ({
  built: "2026-08-27T05:00:00.000Z",
  commit: "abc1234",
  trips: 276000,
  feed_version: "RJTTF918.ZIP",
  feed_start_date: "20260827",
  feed_end_date: "20261127",
  ...extra
});

const platform = (n: number) => FEEDS.find(f => f.platform === n)!;

describe("sources", () => {

  // NaPTAN is OGL v3.0, which makes acknowledgement a condition of use. A page
  // that lists the timetable and not the DfT is the page failing at the one job
  // this section has.
  it("credits every source the feed was built from", () => {
    const listed = sources(feed({sources: [
      {organisation: "Rail Delivery Group", licence: "Rail Settlement Plan data licence"},
      {organisation: "Department for Transport", licence: "Open Government Licence v3.0", url: "https://naptan.dft.gov.uk"}
    ]}));

    expect(listed.map(s => s.organisation)).to.deep.equal([
      "Rail Delivery Group", "Department for Transport"
    ]);
  });

  // Releases published before the build declared its sources have none, and an
  // empty list would read as a feed built from nothing.
  it("names the timetable when a release predates the source list", () => {
    expect(sources(feed())[0].organisation).to.equal("Rail Delivery Group");
    expect(sources(feed({sources: []}))[0].organisation).to.equal("Rail Delivery Group");
  });

  it("says the same when there is no feed at all", () => {
    expect(sources(undefined)[0].organisation).to.equal("Rail Delivery Group");
  });
});

describe("the feeds", () => {

  it("has one platform per zip the nightly build publishes", () => {
    expect(FEEDS.map(f => f.file)).to.deep.equal([
      "gtfs.zip", "gtfs-national-rail-only.zip"
    ]);
  });

  // The whole reason the catalogue asks the release rather than being told. A
  // download link to an asset the release does not carry is a 404 with a button
  // on it, and platform two is in exactly that state until the build that
  // produces it reaches master.
  it("does not offer a feed the latest release does not carry", () => {
    const release = feed({stop_times: 2840000});

    expect(platform(1).published(release)).to.equal(true);
    expect(platform(2).published(release)).to.equal(false);
  });

  it("offers each feed as soon as the release describes it", () => {
    const release = feed({
      stop_times: 2840000,
      trips_national_rail_only: 240000,
      stop_times_national_rail_only: 2400000
    });

    expect(FEEDS.every(f => f.published(release))).to.equal(true);
  });

  it("offers nothing at all when nothing has been published", () => {
    expect(FEEDS.some(f => f.published(undefined))).to.equal(false);
  });

  // A figure the release does not carry is left out rather than blanked: a
  // labelled empty value reads as a feed holding none of something.
  it("states only the figures the release actually carries", () => {
    expect(platform(1).figures(feed()).map(f => f.label)).to.deep.equal(["Trips"]);
    expect(platform(1).figures(feed({stop_times: 10})).map(f => f.label))
      .to.deep.equal(["Trips", "Stop times"]);
    expect(platform(2).figures(feed())).to.deep.equal([]);
  });

  it("counts the National Rail only feed's own trips rather than the whole feed's", () => {
    const release = feed({trips_national_rail_only: 240000});

    expect(platform(2).figures(release)).to.deep.equal([{label: "Trips", value: "240,000"}]);
  });
});

describe("formatting", () => {

  it("writes a feed date the way the rest of the page writes one", () => {
    expect(date("20260904")).to.equal("04/09/2026");
  });

  it("groups a count so it can be read at a glance", () => {
    expect(number(294202)).to.equal("294,202");
  });

  // The build runs at 05:00 UTC and the site is deployed by a runner in an
  // unstated timezone. Pinning the zone is what stops the same release being
  // described as built on two different days depending on who built the page.
  it("states the build time in the zone the build ran in", () => {
    expect(built(feed({built: "2026-08-27T23:30:00.000Z"}))).to.contain("27 Aug 2026");
  });

  it("puts the coverage window first on the board", () => {
    expect(board(feed())[0]).to.deep.equal({
      label: "Covers", value: "27/08/2026 → 27/11/2026"
    });
  });
});
