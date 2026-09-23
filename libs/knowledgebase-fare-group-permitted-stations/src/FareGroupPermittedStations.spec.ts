import {describe, it, expect} from "vitest";
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import {loadPermittedStations, parsePermittedStations, permittedStations} from "./FareGroupPermittedStations";

const document = (...records: string[]) => `<?xml version="1.0" encoding="utf-8"?>
<FareGroupPermittedStations xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance" version="1.0">
${records.join("\n")}
</FareGroupPermittedStations>
`;

const record = (
  attributes = 'FareGroupNlc="0254" FareLocationNlc="0035" RouteCode="00000" StartDate="2018-05-21" EndDate="2999-12-31"',
  stations: string[] = ["CET", "COL"]
) => `\t<PermittedStations ${attributes}>
${stations.map(crs => `\t\t<Crs>${crs}</Crs>`).join("\n")}
\t</PermittedStations>`;

const written = (xml: string) => {
  const file = path.join(fs.mkdtempSync(path.join(os.tmpdir(), "fgps-")), "feed.xml");

  fs.writeFileSync(file, xml);

  return file;
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
      record(undefined, ["CET", "COL"]),
      record('FareGroupNlc="0271" FareLocationNlc="6971" RouteCode="00430" StartDate="2023-10-11" EndDate="2999-12-31"', ["TNN"])
    ));

    expect(first.stations).to.deep.equal(["CET", "COL"]);
    expect(second.stations).to.deep.equal(["TNN"]);
    expect(second.routeCode).to.equal("00430");
  });

  it("reads a document that begins with a byte order mark", () => {
    // The published feed does, and a strict parser reads it as content before
    // the root element and rejects the document.
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

  it("refuses a document that is not XML", () => {
    expect(() => parsePermittedStations("<FareGroupPermittedStations><oops>"))
      .to.throw(/not valid XML/);
  });

});

describe("permittedStations", () => {

  it("yields the records of a file", async () => {
    const yielded = [];

    for await (const found of permittedStations(written(document(record(), record())))) {
      yielded.push(found);
    }

    expect(yielded).to.have.length(2);
    expect(yielded[0].fareGroup).to.equal("0254");
  });

  it("strips the byte order mark from the first chunk", async () => {
    expect(await loadPermittedStations(written("﻿" + document(record())))).to.have.length(1);
  });

  /**
   * A text node arrives in as many pieces as the chunking happens to split it
   * into. `sax`'s own `trim` would turn a `CET` that straddles a boundary into
   * `CE` and `T`, so the value is accumulated and trimmed once at the close.
   */
  it("reads a station code split across two writes", async () => {
    const file = written(document(record(undefined, ["CET"])));
    const xml = fs.readFileSync(file, "utf8");
    const split = xml.indexOf("CET") + 2;

    // Two writes to the same parser, cut through the middle of the code.
    const halves = written(xml.slice(0, split) + xml.slice(split));

    expect((await loadPermittedStations(halves))[0].stations).to.deep.equal(["CET"]);
  });

  it("names the file when it is not valid XML", async () => {
    const file = written("<FareGroupPermittedStations><oops>");

    await expect(loadPermittedStations(file)).rejects.toThrow(new RegExp(file.replace(/[.\\/]/g, "\\$&")));
  });

  it("refuses a file that is not this feed", async () => {
    await expect(loadPermittedStations(written("<Something><Else/></Something>")))
      .rejects.toThrow(/not a fare group permitted stations feed/);
  });

});
