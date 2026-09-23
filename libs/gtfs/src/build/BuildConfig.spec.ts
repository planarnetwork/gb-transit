import {describe, it, expect} from "vitest";
import {RouteType} from "@gb-transit/gtfs-schema";
import {parseConfig} from "./BuildConfig";
import {NO_EXCLUSIONS} from "../transform/ExcludeServices";

const minimal = {source: "RJTTF918.ZIP"};

describe("parseConfig", () => {

  it("takes a single source without making you write a list", () => {
    expect(parseConfig(minimal).source).to.deep.equal(["RJTTF918.ZIP"]);
    expect(parseConfig({source: ["a.zip", "b.zip"]}).source).to.deep.equal(["a.zip", "b.zip"]);
  });

  it("defaults the things a build can guess", () => {
    const config = parseConfig(minimal);

    expect(config.out).to.equal("gtfs.zip");
    expect(config.links).to.equal(false);
    expect(config.removePassingPoints).to.equal(true);
    expect(config.licence).to.equal("permissive");
    expect(config.enrichers).to.deep.equal([]);
    expect(config.extensions).to.deep.equal([]);
    expect(config.duplicateOvernightAssociations).to.equal(false);
  });

  it("insists on a source, since there is nothing to build without one", () => {
    expect(() => parseConfig({})).to.throw(/source must be a list/);
    expect(() => parseConfig({source: []})).to.throw(/at least one feed file/);
  });

  it("names an option it does not recognise, and lists the ones it does", () => {
    // A typo in a config is silent otherwise: the build runs and quietly does
    // not do the thing the option was meant to turn on.
    expect(() => parseConfig({...minimal, sources: ["x"]}))
      .to.throw(/sources is not a config option. Expected one of: source, out/);
  });

  it("rejects a licence tier it cannot honour", () => {
    expect(() => parseConfig({...minimal, licence: "whatever"}))
      .to.throw(/licence must be one of: permissive, full. Got whatever./);
  });

  it("keeps the locations a service passes through when told to", () => {
    expect(parseConfig({...minimal, removePassingPoints: false}).removePassingPoints).to.equal(false);
  });

  /**
   * `removePassingPoints !== false` would read "no" as true and quietly build a
   * feed a third larger than the one that was asked for.
   */
  it("refuses a removePassingPoints that is not a yes or a no", () => {
    expect(() => parseConfig({...minimal, removePassingPoints: "no"}))
      .to.throw(/removePassingPoints must be true or false. Got "no"./);
  });

  it("duplicates an overnight association when told to", () => {
    expect(parseConfig({...minimal, duplicateOvernightAssociations: true}).duplicateOvernightAssociations)
      .to.equal(true);
  });

  /**
   * `Boolean(duplicateOvernightAssociations)` would read "no" as a yes and publish every overnight
   * portion twice, which is a lot of feed to account for afterwards.
   */
  it("refuses a duplicateOvernightAssociations that is not a yes or a no", () => {
    expect(() => parseConfig({...minimal, duplicateOvernightAssociations: "no"}))
      .to.throw(/duplicateOvernightAssociations must be true or false. Got "no"./);
  });

});

describe("parseConfig extensions", () => {

  const known = ["fares_v2", "pathways"];

  it("reads a list of what to turn on", () => {
    expect(parseConfig({...minimal, extensions: ["fares_v2"]}, [], known).extensions)
      .to.deep.equal([{key: "fares_v2", options: {}}]);
  });

  it("takes a single extension without making you write a list", () => {
    expect(parseConfig({...minimal, extensions: "fares_v2"}, [], known).extensions)
      .to.deep.equal([{key: "fares_v2", options: {}}]);
  });

  it("reads the mapping form, where an extension has something to say", () => {
    const config = parseConfig(
      {...minimal, extensions: {fares_v2: {options: {feed: "RJFAF847.ZIP"}}}},
      [],
      known
    );

    expect(config.extensions).to.deep.equal([
      {key: "fares_v2", options: {feed: "RJFAF847.ZIP"}}
    ]);
  });

  it("treats a named extension with nothing under it as on with its defaults", () => {
    expect(parseConfig({...minimal, extensions: {fares_v2: null}}, [], known).extensions)
      .to.deep.equal([{key: "fares_v2", options: {}}]);
  });

  // Both forms have to reject the same typo, or one of them is a way to turn on
  // an extension that does not exist and get a feed quietly missing its files.
  it("rejects an extension it does not know, in either form", () => {
    expect(() => parseConfig({...minimal, extensions: ["fares_v3"]}, [], known))
      .to.throw(/fares_v3 is not an extension this build knows about. Available: fares_v2, pathways./);
    expect(() => parseConfig({...minimal, extensions: {fares_v3: null}}, [], known))
      .to.throw(/fares_v3 is not an extension this build knows about/);
  });

  it("says so when nothing is registered", () => {
    expect(() => parseConfig({...minimal, extensions: ["fares_v2"]}))
      .to.throw(/Available: none are registered./);
  });

  it("names a setting that is not an extension setting", () => {
    expect(() => parseConfig({...minimal, extensions: {fares_v2: {priority: 10}}}, [], known))
      .to.throw(/fares_v2.priority is not an extension option. Expected options./);
  });

  // The order two extensions are listed in must not reach the build, for the
  // same reason enricher priority is declared rather than positional.
  it("orders them by key whatever the config says", () => {
    const config = parseConfig(
      {...minimal, extensions: {pathways: null, fares_v2: null}},
      [],
      known
    );

    expect(config.extensions.map(e => e.key)).to.deep.equal(["fares_v2", "pathways"]);
  });

});

describe("parseConfig, enrichers", () => {

  it("fails fast on an enricher it does not know", () => {
    // Left to run, a typo produces a feed quietly missing whatever that source
    // was meant to add - indistinguishable from a source that matched nothing.
    expect(() => parseConfig({...minimal, enrichers: {NAPTAM: null}}, ["NAPTAN"]))
      .to.throw(/NAPTAM is not an enricher this build knows about. Available: NAPTAN./);
  });

  it("says so when nothing at all is registered", () => {
    expect(() => parseConfig({...minimal, enrichers: {NAPTAN: null}}))
      .to.throw(/Available: none are registered./);
  });

  it("reads an enricher with no settings as on with its defaults", () => {
    const [naptan] = parseConfig({...minimal, enrichers: {NAPTAN: null}}, ["NAPTAN"]).enrichers;

    expect(naptan).to.deep.equal({key: "NAPTAN", priority: undefined, apply: undefined, options: {}});
  });

  it("carries the priority override, the allowlist and the options", () => {
    const [naptan] = parseConfig({
      ...minimal,
      enrichers: {NAPTAN: {priority: 80, apply: ["stop_lat", "stop_lon"], options: {path: "./n.xml"}}}
    }, ["NAPTAN"]).enrichers;

    expect(naptan.priority).to.equal(80);
    expect(naptan.apply).to.deep.equal(["stop_lat", "stop_lon"]);
    expect(naptan.options).to.deep.equal({path: "./n.xml"});
  });

  it("names a mistyped enricher option", () => {
    expect(() => parseConfig({...minimal, enrichers: {NAPTAN: {priorty: 80}}}, ["NAPTAN"]))
      .to.throw(/NAPTAN.priorty is not an enricher option/);
  });

  it("insists a priority is a number", () => {
    expect(() => parseConfig({...minimal, enrichers: {NAPTAN: {priority: "high"}}}, ["NAPTAN"]))
      .to.throw(/NAPTAN.priority must be a number. Got "high"./);
  });

  it("orders the enrichers so the config reads the same however it was typed", () => {
    const keys = parseConfig(
      {...minimal, enrichers: {OSM: null, CORPUS: null, NAPTAN: null}},
      ["OSM", "CORPUS", "NAPTAN"]
    ).enrichers.map(e => e.key);

    expect(keys).to.deep.equal(["CORPUS", "NAPTAN", "OSM"]);
  });

});

describe("parseConfig, reading what to exclude", () => {

  it("excludes nothing when the config says nothing", () => {
    expect(parseConfig(minimal).exclude).to.deep.equal(NO_EXCLUSIONS);
  });

  it("reads the modes as words rather than GTFS numbers", () => {
    const {modes} = parseConfig({...minimal, exclude: {modes: ["metro", "bus", "ship"]}}).exclude;

    expect(modes).to.deep.equal([RouteType.Subway, RouteType.Bus, RouteType.Ferry]);
  });

  it("takes the spellings GTFS uses as well as the ones the CIF does", () => {
    const {modes} = parseConfig({...minimal, exclude: {modes: ["subway", "ferry"]}}).exclude;

    expect(modes).to.deep.equal([RouteType.Subway, RouteType.Ferry]);
  });

  it("refuses a mode it cannot read, rather than excluding nothing quietly", () => {
    expect(() => parseConfig({...minimal, exclude: {modes: ["underground"]}}))
      .to.throw(/exclude.modes does not take "underground". Expected one of: metro, subway, rail/);
  });

  it("keeps the two operator lists apart", () => {
    const {operators, replacementBuses} = parseConfig({
      ...minimal,
      exclude: {operators: ["ES", "LT"], replacementBuses: ["LO", "XR"]}
    }).exclude;

    expect(operators).to.deep.equal(["ES", "LT"]);
    expect(replacementBuses).to.deep.equal(["LO", "XR"]);
  });

  it("takes an operator code however it was typed", () => {
    expect(parseConfig({...minimal, exclude: {operators: "lt"}}).exclude.operators)
      .to.deep.equal(["LT"]);
  });

  it("insists an operator is an ATOC code", () => {
    expect(() => parseConfig({...minimal, exclude: {operators: ["London Underground"]}}))
      .to.throw(/exclude.operators takes two-letter ATOC codes. Got "London Underground"./);
  });

  it("reads the fixed link modes however they were typed", () => {
    expect(parseConfig({...minimal, exclude: {links: ["tube", "Metro"]}}).exclude.links)
      .to.deep.equal(["TUBE", "METRO"]);
  });

  it("refuses a fixed link mode the ALF does not have", () => {
    expect(() => parseConfig({...minimal, exclude: {links: ["underground"]}}))
      .to.throw(/exclude.links does not take "underground". Expected one of: BUS, FERRY, METRO/);
  });

  it("names something it was asked to exclude that is not a thing to exclude", () => {
    expect(() => parseConfig({...minimal, exclude: {operatrs: ["LT"]}}))
      .to.throw(/exclude.operatrs is not something to exclude. Expected one of: modes, operators, replacementBuses, links./);
  });

});
