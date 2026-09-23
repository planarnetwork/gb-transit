import {describe, it, expect} from "vitest";
import {missingFromPack, registryVerdict} from "./publish-workspace.mjs";

const npmSaid = (stderr) => ({status: 1, stdout: "", stderr});

describe("registryVerdict", () => {
  it("reads a version back as published", () => {
    expect(registryVerdict({status: 0, stdout: "0.2.0\n", stderr: ""})).toBe("published");
  });

  it("reads a missing version as room to publish", () => {
    expect(registryVerdict(npmSaid("npm error code E404\nnpm error 404 No match found for version 9.9.9\n")))
      .toBe("absent");
  });

  it("reads a package that has never been published as room to publish", () => {
    expect(registryVerdict(npmSaid("npm error code E404\nnpm error 404 Not Found - GET https://registry.npmjs.org/@gb-transit%2fnew\n")))
      .toBe("absent");
  });

  // The failure that matters. An outage answers non-zero just like a missing
  // version does, and treating it as absent would publish over nothing at best
  // and release half the monorepo at worst.
  it("refuses to guess when the registry cannot be reached", () => {
    expect(() => registryVerdict(npmSaid("npm error code ENOTFOUND\nnpm error network request to https://registry.npmjs.org failed\n")))
      .toThrow(/Cannot tell whether this version is published/);
  });

  it("refuses to guess when npm rejects our credentials", () => {
    expect(() => registryVerdict(npmSaid("npm error code E401\nnpm error 401 Unauthorized\n")))
      .toThrow(/Cannot tell whether this version is published/);
  });

  // A 404 body that merely mentions the string somewhere should not be read out
  // of a longer message by accident, but a real one always names the code.
  it("does not mistake a version number containing 404 for a missing version", () => {
    expect(registryVerdict({status: 0, stdout: "1.404.0\n", stderr: ""})).toBe("published");
  });
});

describe("missingFromPack", () => {
  const library = {main: "./dist/index.js", types: "./dist/index.d.ts"};

  it("finds nothing missing from a built package", () => {
    expect(missingFromPack(["package/package.json", "package/dist/index.js", "package/dist/index.d.ts"], library))
      .toEqual([]);
  });

  // What @gb-transit/knowledgebase-fare-group-permitted-stations@1.0.0 was.
  it("finds the entry points missing from a package packed before it was built", () => {
    expect(missingFromPack(["package/package.json", "package/README.md", "package/CHANGELOG.md"], library))
      .toEqual(["dist/index.js", "dist/index.d.ts"]);
  });

  it("checks what a command line package runs", () => {
    expect(missingFromPack(["package/package.json"], {bin: {dtd2mysql: "bin/dtd2mysql.sh"}}))
      .toEqual(["bin/dtd2mysql.sh"]);
  });
});
