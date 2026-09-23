import {describe, it, expect, afterAll} from "vitest";
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import {loadPermittedStations, parsePermittedStations, permittedStations} from "./FareGroupPermittedStations";

const CODES = 'FareGroupNlc="0254" FareLocationNlc="0035" RouteCode="00000" StartDate="2018-05-21" EndDate="2999-12-31"';

const document = (...records: string[]) => `<?xml version="1.0" encoding="utf-8"?>
<FareGroupPermittedStations xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance" version="1.0">
${records.join("\n")}
</FareGroupPermittedStations>
`;

const record = (attributes = CODES, stations: string[] = ["CET", "COL"]) =>
  `\t<PermittedStations ${attributes}>
${stations.map(crs => `\t\t<Crs>${crs}</Crs>`).join("\n")}
\t</PermittedStations>`;

// One directory for the file, removed at the end, rather than one per call left
// behind - six of these a run piles up on a runner that never reboots.
const scratch = fs.mkdtempSync(path.join(os.tmpdir(), "fgps-"));
let written = 0;

afterAll(() => fs.rmSync(scratch, {recursive: true, force: true}));

const file = (xml: string) => {
  const at = path.join(scratch, `feed-${written++}.xml`);

  fs.writeFileSync(at, xml);

  return at;
};

describe("parsePermittedStations", () => {

  it("reads a record down to its codes and its stations", () => {
    expect(parsePermittedStations(document(record()))).to.deep.equal([{
      fareGroup: "0254",
      fareLocation: "0035",
      routeCode: "00000",
      startDate: "2018-05-21",
      endDate: "2999-12-31",
      stations: ["CET", "COL"]
    }]);
  });

  it("keeps each record's stations to itself", () => {
    const [first, second] = parsePermittedStations(document(
      record(CODES, ["CET", "COL"]),
      record('FareGroupNlc="0271" FareLocationNlc="6971" RouteCode="00430" StartDate="2023-10-11" EndDate="2999-12-31"', ["TNN"])
    ));

    expect(first.stations).to.deep.equal(["CET", "COL"]);
    expect(second.stations).to.deep.equal(["TNN"]);
    expect(second.routeCode).to.equal("00430");
  });

  it("reads the published feed's byte order mark", () => {
    // The feed opens with one. Guarded here because the feed has it, whoever
    // ends up doing the skipping.
    expect(parsePermittedStations("﻿" + document(record()))).to.have.length(1);
  });

  it("takes an empty feed at its word", () => {
    expect(parsePermittedStations(document())).to.deep.equal([]);
  });

  /**
   * No records and the wrong document entirely look the same to a caller, and a
   * consumer that indexes nothing is indistinguishable from one whose source
   * changed shape upstream.
   */
  it("refuses a document that is not this feed", () => {
    expect(() => parsePermittedStations("<Something><Else/></Something>"))
      .to.throw(/not a fare group permitted stations feed/);
  });

  it("refuses a document that only contains the element somewhere", () => {
    expect(() => parsePermittedStations("<Wrapper><FareGroupPermittedStations/></Wrapper>"))
      .to.throw(/no <FareGroupPermittedStations> root element/);
  });

  it("refuses a document that is not XML", () => {
    expect(() => parsePermittedStations("<FareGroupPermittedStations><oops>"))
      .to.throw(/not valid XML/);
  });

});

/**
 * The shape the feed has always had, held to rather than papered over. A
 * renamed attribute filled in with an empty string would give a consumer
 * 308,907 records that match nothing, and the only sign would be a join that
 * produced no rows.
 */
describe("parsePermittedStations on a record that changed shape", () => {

  it("names the attribute a record is missing", () => {
    expect(() => parsePermittedStations(document(record(
      'FareLocationNlc="0035" RouteCode="00000" StartDate="2018-05-21" EndDate="2999-12-31"'
    )))).to.throw(/with no FareGroupNlc/);
  });

  it("refuses an attribute that has been renamed", () => {
    expect(() => parsePermittedStations(document(record(
      'FareGroupNLC="0254" FareLocationNlc="0035" RouteCode="00000" StartDate="2018-05-21" EndDate="2999-12-31"'
    )))).to.throw(/with no FareGroupNlc/);
  });

  it("refuses an empty station code", () => {
    expect(() => parsePermittedStations(document(
      `\t<PermittedStations ${CODES}>\n\t\t<Crs>CET</Crs>\n\t\t<Crs/>\n\t</PermittedStations>`
    ))).to.throw(/empty <Crs> in 0254\/0035 route 00000/);
  });

  it("refuses a station code that is only whitespace", () => {
    expect(() => parsePermittedStations(document(
      `\t<PermittedStations ${CODES}>\n\t\t<Crs> </Crs>\n\t</PermittedStations>`
    ))).to.throw(/empty <Crs> in 0254\/0035 route 00000/);
  });

  it("refuses a record that permits no stations", () => {
    expect(() => parsePermittedStations(document(record(CODES, []))))
      .to.throw(/permitting no stations: 0254\/0035 route 00000/);
  });

});

describe("permittedStations", () => {

  it("yields the records of a file", async () => {
    const yielded = [];

    for await (const found of permittedStations(file(document(record(), record())))) {
      yielded.push(found);
    }

    expect(yielded).to.have.length(2);
    expect(yielded[0].fareGroup).to.equal("0254");
  });

  it("reads a file that opens with a byte order mark", async () => {
    expect(await loadPermittedStations(file("﻿" + document(record())))).to.have.length(1);
  });

  /**
   * The document arrives in whatever pieces the stream hands over, and a value
   * or a tag can straddle two of them. Read one byte at a time, so every
   * boundary a larger read could land on is exercised at once.
   */
  it("reassembles values split across reads", async () => {
    const at = file(document(record(CODES, ["CET", "COL"])));
    const yielded = [];

    for await (const found of permittedStations(at)) {
      yielded.push(found);
    }

    expect(yielded[0].stations).to.deep.equal(["CET", "COL"]);

    const oneByteAtATime = [];

    for await (const found of permittedStations(at, {highWaterMark: 1})) {
      oneByteAtATime.push(found);
    }

    expect(oneByteAtATime).to.deep.equal(yielded);
  });

  it("names the file when it is not valid XML", async () => {
    const at = file("<FareGroupPermittedStations><oops>");

    await expect(loadPermittedStations(at)).rejects.toThrow(new RegExp(at.replace(/[.\\/]/g, "\\$&")));
  });

  it("refuses a file that is not this feed", async () => {
    await expect(loadPermittedStations(file("<Something><Else/></Something>")))
      .rejects.toThrow(/not a fare group permitted stations feed/);
  });

});
