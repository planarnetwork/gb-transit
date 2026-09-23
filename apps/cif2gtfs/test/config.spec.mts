import {describe, it, expect} from "vitest";
import * as fs from "node:fs";
import * as path from "node:path";
import {parse} from "yaml";
import {parseConfig} from "@gb-transit/gtfs";
import {REGISTERED, REGISTERED_EXTENSIONS} from "../src/build.js";

/**
 * The configs the nightly publishes from, and the pages that describe them.
 *
 * They describe the same feed and differ by what one of them leaves out, so a
 * source, an enricher or a window added to one and not the other is a mistake -
 * and one that only shows up as two releases quietly disagreeing.
 */
const root = path.join(import.meta.dirname, "..", "..", "..");
const read = (file: string) =>
  parseConfig(parse(fs.readFileSync(path.join(root, file), "utf8")), REGISTERED, REGISTERED_EXTENSIONS);
const site = (file: string) => fs.readFileSync(path.join(root, "apps/website/src", file), "utf8");

describe("the published configs", () => {

  const feed = read("gtfs.config.yaml");
  const nationalRailOnly = read("gtfs.national-rail-only.config.yaml");

  it("agree on everything but where they write and what they exclude", () => {
    const {out: _out, exclude: _exclude, ...rest} = feed;
    const {out: _theirs, exclude: _theirExclude, ...theirs} = nationalRailOnly;

    expect(theirs).to.deep.equal(rest);
  });

  it("write to different places, or the nightly would build over itself", () => {
    expect(nationalRailOnly.out).to.not.equal(feed.out);
  });

  it("leave the standard feed with everything in it", () => {
    expect(feed.exclude).to.deep.equal({modes: [], operators: [], replacementBuses: [], links: []});
  });

  it("leave both of #176's rules on in the other", () => {
    expect(nationalRailOnly.exclude.modes.length).to.be.greaterThan(0);
    expect(nationalRailOnly.exclude.operators).to.include.members(["LT", "TW"]);
    // The Overground and Elizabeth line trains stay; TfL runs their replacements
    expect(nationalRailOnly.exclude.replacementBuses).to.deep.equal(["LO", "XR"]);
    expect(nationalRailOnly.exclude.operators).to.not.include.members(["LO", "XR"]);
  });

});

/**
 * The guide says which operators the National Rail only feed leaves out, by
 * code. That is the config's answer written down a second time, and it has
 * already drifted once - the section landed on master describing the operator
 * rule and not the replacement bus one.
 *
 * Only the codes are checked. The prose around them is prose.
 */
describe("the guide to the National Rail only feed", () => {

  const guide = site("pages/feeds/using-this-data.mdx");
  const section = guide.slice(
    guide.indexOf("## The National Rail only feed"),
    guide.indexOf("## transfers.txt")
  );
  const {operators, replacementBuses} = read("gtfs.national-rail-only.config.yaml").exclude;

  it("has a section to check", () => {
    expect(section).to.include("gtfs-national-rail-only.zip");
  });

  it("names every operator code the config excludes, and no others", () => {
    const named = [...new Set([...section.matchAll(/`([A-Z]{2})`/g)].map(([, code]) => code))].sort();

    expect(named).to.deep.equal([...new Set([...operators, ...replacementBuses])].sort());
  });

});
