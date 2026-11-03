import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import {afterEach, beforeEach, describe, expect, it} from "vitest";
import {readPatternFile, writePatternFile} from "../src/merge/patternFile.js";

let workDir: string;

beforeEach(async () => {
  workDir = await fs.promises.mkdtemp(path.join(os.tmpdir(), "pattern-file-"));
});

afterEach(async () => {
  await fs.promises.rm(workDir, {recursive: true, force: true});
});

async function* from(patterns: string[][]): AsyncGenerator<string[]> {
  for (const pattern of patterns) {
    yield pattern;
  }
}

/**
 * A three character code, so a line can be cut back up into stations.
 */
function code(n: number): string {
  const letters = "ABCDEFGHIJKLMNOPQRSTUVWXYZ";
  const at = Math.abs(n) % (26 * 26 * 26);

  return letters[Math.floor(at / 676) % 26] + letters[Math.floor(at / 26) % 26] + letters[at % 26];
}

/**
 * Sorted and duplicate free, because that is what both the writer and the planner's own merge are given.
 *
 * Lengths run from two stations to fourteen, which is the longest a national feed produced and the
 * reason the shared count is a character counting up rather than a digit.
 */
function patterns(count: number): string[][] {
  const made: string[][] = [];

  for (let i = 0; i < count; i++) {
    const pattern = [code(i * 31)];

    for (let station = 1; station < 2 + (i % 13); station++) {
      pattern.push(code(i * 31 + station * 977));
    }

    made.push(pattern);
  }

  return [...new Set(made.map(pattern => pattern.join("")))]
    .sort()
    .map(line => line.match(/.{3}/g) as string[]);
}

describe("writePatternFile", () => {
  it("round trips through readPatternFile", async () => {
    const written = patterns(500);
    const file = path.join(workDir, "patterns.br");
    const result = await writePatternFile(from(written), file);

    expect(result.patterns).to.equal(written.length);

    const read: string[][] = [];

    for await (const pattern of readPatternFile(file)) {
      read.push(pattern);
    }

    expect(read).to.deep.equal(written);
  });

  it("writes an empty file for no patterns", async () => {
    const file = path.join(workDir, "patterns.br");
    const result = await writePatternFile(from([]), file);

    expect(result.patterns).to.equal(0);

    const read: string[][] = [];

    for await (const pattern of readPatternFile(file)) {
      read.push(pattern);
    }

    expect(read).to.deep.equal([]);
  });
});
