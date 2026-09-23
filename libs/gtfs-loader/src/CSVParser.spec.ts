import { describe, it, expect } from "vitest";
import { CSVParser, type Row } from "./CSVParser.js";

/**
 * Parse a document in one go, copying each row out as it arrives.
 */
function parse(text: string, columns: string[]): Row[] {
  const rows: Row[] = [];
  const parser = new CSVParser(columns, row => rows.push({ ...row }));

  parser.write(text);
  parser.end();

  return rows;
}

/**
 * Parse the same document one character at a time, which puts a chunk boundary between every pair
 * of characters in it.
 */
function parseByCharacter(text: string, columns: string[]): Row[] {
  const rows: Row[] = [];
  const parser = new CSVParser(columns, row => rows.push({ ...row }));

  for (const character of text) {
    parser.write(character);
  }

  parser.end();

  return rows;
}

describe("CSVParser", () => {

  it("reads rows keyed by the header", () => {
    const rows = parse("a,b\n1,2\n3,4\n", ["a", "b"]);

    expect(rows.length).to.equal(2);
    expect(rows[0].a).to.equal("1");
    expect(rows[0].b).to.equal("2");
    expect(rows[1].a).to.equal("3");
    expect(rows[1].b).to.equal("4");
  });

  it("says every column the header names, wanted or not, once it has read it", () => {
    const parser = new CSVParser(["stop_id"], () => {});

    parser.write("\n﻿stop_id,\"odd, name\",stop");
    expect(parser.header).to.equal(undefined);

    parser.write("_name\ns1,x,One\n");
    expect(parser.header).to.deep.equal(["stop_id", "odd, name", "stop_name"]);
  });

  it("only takes the columns it was asked for", () => {
    const rows = parse("a,b,c\n1,2,3\n", ["b"]);

    expect(rows.length).to.equal(1);
    expect(rows[0].b).to.equal("2");
    expect(Object.hasOwn(rows[0], "a")).to.equal(false);
    expect(Object.hasOwn(rows[0], "c")).to.equal(false);
  });

  it("leaves a column the file does not have undefined", () => {
    const rows = parse("a\n1\n", ["a", "missing"]);

    expect(rows[0].missing).to.equal(undefined);
  });

  it("reports an empty field as undefined rather than an empty string", () => {
    const rows = parse("a,b,c\n1,,3\n", ["a", "b", "c"]);

    expect(rows[0].b).to.equal(undefined);
    expect(rows[0].a).to.equal("1");
    expect(rows[0].c).to.equal("3");
  });

  it("leaves the columns a short row does not reach undefined", () => {
    const rows = parse("a,b,c\n1,2\n", ["a", "b", "c"]);

    expect(rows[0].a).to.equal("1");
    expect(rows[0].b).to.equal("2");
    expect(rows[0].c).to.equal(undefined);
  });

  it("does not carry a value over from the previous row", () => {
    const rows = parse("a,b\n1,2\n3\n", ["a", "b"]);

    expect(rows[0].b).to.equal("2");
    expect(rows[1].b).to.equal(undefined);
  });

  it("refuses a short row when strict", () => {
    const parser = new CSVParser(["a", "b", "c"], () => {}, { strict: true });

    expect(() => parser.write("a,b,c\n1,2,3\n4,5\n")).to.throw("Row 2 has 2 fields where the header has 3");
  });

  it("refuses a long row when strict", () => {
    const parser = new CSVParser(["a", "b"], () => {}, { strict: true });

    expect(() => parser.write("a,b\n1,2,3\n")).to.throw("Row 1 has 3 fields where the header has 2");
  });

  it("counts a trailing empty field when strict", () => {
    const rows: Row[] = [];
    const parser = new CSVParser(["a", "b"], row => rows.push({ ...row }), { strict: true });

    parser.write("a,b\n1,\n");
    parser.end();

    expect(rows).to.deep.equal([{ a: "1", b: undefined }]);
  });

  it("drops the extra fields of a row longer than the header", () => {
    const rows = parse("a,b\n1,2,3,4\n", ["a", "b"]);

    expect(rows.length).to.equal(1);
    expect(rows[0].a).to.equal("1");
    expect(rows[0].b).to.equal("2");
  });

  it("reads a trailing empty field", () => {
    const rows = parse("a,b\n1,\n", ["a", "b"]);

    expect(rows[0].a).to.equal("1");
    expect(rows[0].b).to.equal(undefined);
  });

  it("reads a final row the file did not terminate", () => {
    const rows = parse("a,b\n1,2", ["a", "b"]);

    expect(rows.length).to.equal(1);
    expect(rows[0].b).to.equal("2");
  });

  it("does not report a row for the newline at the end of the file", () => {
    expect(parse("a\n1\n", ["a"]).length).to.equal(1);
  });

  it("skips blank lines", () => {
    const rows = parse("a\n1\n\n2\n", ["a"]);

    expect(rows.length).to.equal(2);
    expect(rows[0].a).to.equal("1");
    expect(rows[1].a).to.equal("2");
  });

  it("handles CRLF line endings", () => {
    const rows = parse("a,b\r\n1,2\r\n", ["a", "b"]);

    expect(rows[0].a).to.equal("1");
    expect(rows[0].b).to.equal("2");
  });

  it("rejects bare carriage return line endings rather than misreading them", () => {
    expect(() => parse("a,b\r1,2\r", ["a", "b"])).to.throw(/carriage return/);
  });

  it("strips a byte order mark from the first column name", () => {
    const rows = parse("﻿a,b\n1,2\n", ["a", "b"]);

    expect(rows[0].a).to.equal("1");
  });

  it("reads a quoted field containing a comma", () => {
    const rows = parse("a,b\n\"one,two\",3\n", ["a", "b"]);

    expect(rows[0].a).to.equal("one,two");
    expect(rows[0].b).to.equal("3");
  });

  it("reads a doubled quote inside a quoted field as one quote", () => {
    const rows = parse("a,b\n\"say \"\"hi\"\"\",3\n", ["a", "b"]);

    expect(rows[0].a).to.equal("say \"hi\"");
    expect(rows[0].b).to.equal("3");
  });

  it("reads a quoted field containing a newline", () => {
    const rows = parse("a,b\n\"one\ntwo\",3\n", ["a", "b"]);

    expect(rows.length).to.equal(1);
    expect(rows[0].a).to.equal("one\ntwo");
    expect(rows[0].b).to.equal("3");
  });

  it("reads a quoted field in the last column", () => {
    const rows = parse("a,b\n1,\"two,three\"\n", ["a", "b"]);

    expect(rows[0].a).to.equal("1");
    expect(rows[0].b).to.equal("two,three");
  });

  it("reads a quoted empty field as undefined", () => {
    const rows = parse("a,b\n\"\",2\n", ["a", "b"]);

    expect(rows[0].a).to.equal(undefined);
    expect(rows[0].b).to.equal("2");
  });

  it("reads a quoted header column name", () => {
    const rows = parse("\"a\",b\n1,2\n", ["a", "b"]);

    expect(rows[0].a).to.equal("1");
  });

  it("reuses the row object between rows", () => {
    const seen: Row[] = [];
    const parser = new CSVParser(["a"], row => seen.push(row));

    parser.write("a\n1\n2\n");

    expect(seen.length).to.equal(2);
    expect(seen[0] === seen[1]).to.equal(true);
  });

  /**
   * The chunk boundary is where a streaming parser goes wrong, so rather than guessing which
   * boundaries matter this puts one between every pair of characters and expects the same rows.
   */
  it("gives the same rows however the document is split across chunks", () => {
    const documents = [
      "a,b\n1,2\n3,4\n",
      "a,b\n\"one,two\",3\n4,5\n",
      "a,b\n\"one\ntwo\",3\n",
      "a,b\n\"say \"\"hi\"\"\",3\n",
      "a,b,c\r\n1,,3\r\n4,5\r\n",
      "a,b\n1,2",
      "a\n1\n\n2\n"
    ];

    for (const document of documents) {
      expect(parse(document, ["a", "b", "c"])).to.deep.equal(parseByCharacter(document, ["a", "b", "c"]));
    }
  });

});
