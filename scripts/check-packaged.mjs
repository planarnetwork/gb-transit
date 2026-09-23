import {execFileSync} from "node:child_process";
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";

/**
 * Install what would be published, and use it.
 *
 * The tests run against source, so `main`, `types`, `bin`, `exports` and `files`
 * breakage is invisible to them: a package can pass every spec and still ship a
 * tarball that cannot be required. This packs every workspace, installs each
 * published thing into a directory of its own, and then does something real with
 * it - builds a fixture, reads a feed, runs a command.
 *
 * The `@gb-transit` dependencies resolve to the tarballs packed here rather than
 * to the registry, so this checks the commit rather than the last release, and
 * works before a package has ever been published.
 *
 * Each install gets its own directory. Two CLIs share every dependency, so
 * resolving one from the other's tree would quietly pass whatever this one's
 * tarball left out.
 *
 *   node scripts/check-packaged.mjs [directory]
 *
 * With no directory it uses a temporary one and removes it afterwards, which is
 * what makes this runnable locally rather than only on a runner.
 */
const ROOT = path.resolve(import.meta.dirname, "..");

/**
 * Every workspace that publishes, so any of them can be an override.
 */
const LIBRARIES = [
  "gtfs-schema", "feed-parser", "dtd-schema", "dtd-source", "gtfs", "gtfs-output", "gtfs-loader",
  "naptan", "enrich-naptan", "enrich-knowledgebase-stations", "extend-station-groups"
];

const APPLICATIONS = ["dtd2mysql", "cif2gtfs", "transxchange2gtfs", "gtfsmerge"];

/**
 * What to install, and what to do with it once it is installed.
 *
 * This was five near-identical blocks of shell in the workflow, each repeating
 * the same overrides map. The point of a table is that adding a package is a
 * row.
 */
const CHECKS = [
  {
    name: "dtd2mysql",
    help: ["Usage: dtd2mysql", "--gtfs-zip"],
    // --help barely touches the package. Running a real command with no database
    // loads the container, resolves every schema module and exercises the error
    // path, which is what catches a files or main mistake that --help sails past.
    run: dir => {
      fs.mkdirSync(path.join(dir, "out"), {recursive: true});

      const run = attempt(dir, "./node_modules/.bin/dtd2mysql", ["--gtfs", "./out"], {
        DATABASE_HOSTNAME: "127.0.0.1", DATABASE_PORT: "1", DATABASE_NAME: "nothing"
      });

      // The CLI checks its configuration and then the output path before it
      // connects, so reaching the connection means every package resolved, the
      // container wired up, and agency.txt is already written.
      expect(run.status === 1, `expected exit 1, got ${run.status}`);
      expect(run.output.includes("ECONNREFUSED"), "never reached the database");
      expect(run.output.includes("Writing agency.txt"), "never wrote a file");
      noStackTrace(run.output);
    }
  },
  {
    name: "cif2gtfs",
    help: ["cif2gtfs"],
    run: dir => {
      const run = attempt(dir, "./node_modules/.bin/cif2gtfs", [
        "build",
        "--source", path.join(ROOT, "apps/cif2gtfs/fixtures/mini/RJTTF001.ZIP"),
        "--out", "./feed",
        "--today", "2026-08-10"
      ]);

      expect(run.status === 0, `the build failed:\n${run.output}`);
      noStackTrace(run.output);
      diff(path.join(dir, "feed"), path.join(ROOT, "apps/cif2gtfs/fixtures/mini/golden"));
    }
  },
  {
    name: "transxchange2gtfs",
    help: ["transxchange2gtfs"],
    run: dir => {
      const fixtures = path.join(ROOT, "apps/transxchange2gtfs/fixtures/mini");
      // --naptan, so the check is not held up by a 100MB download. The window
      // and the version are pinned to the ones the golden was built for, which
      // otherwise default to today and would differ from it every day.
      const run = attempt(dir, "./node_modules/.bin/transxchange2gtfs", [
        "--naptan", path.join(fixtures, "naptan.csv"),
        "--from", "2026-01-05",
        "--to", "2026-12-31",
        "--feed-version", "mini",
        path.join(fixtures, "mini.xml"),
        "./feed"
      ]);

      expect(run.status === 0, `the conversion failed:\n${run.output}`);
      noStackTrace(run.output);
      diff(path.join(dir, "feed"), path.join(fixtures, "golden"));
    }
  },
  {
    name: "gtfsmerge",
    help: ["gtfsmerge"],
    run: dir => {
      const tiny = path.join(ROOT, "apps/gtfsmerge/fixtures/tiny");
      const a = zip(path.join(tiny, "a"), path.join(dir, "a.zip"));
      const b = zip(path.join(tiny, "b"), path.join(dir, "b.zip"));
      // Pinned, so the golden does not rot as the fixture's dates pass.
      const run = attempt(dir, "./node_modules/.bin/gtfsmerge", [
        "--date-filter", "20260601", a, b, "./feed"
      ]);

      expect(run.status === 0, `the merge failed:\n${run.output}`);
      noStackTrace(run.output);
      diff(path.join(dir, "feed"), path.join(tiny, "golden"));
    }
  },
  {
    name: "@gb-transit/gtfs-loader",
    // A library rather than a CLI, and the only package that publishes both
    // CommonJS and ESM. Nothing else exercises that: the tests run against
    // source and both formats come out of the same source, so a broken exports
    // map, a missing dist/esm marker or a specifier node cannot resolve is
    // invisible until somebody installs it.
    run: dir => {
      // The browser is why it is dual built, so none of the feed build's
      // node-only dependencies may have followed it in.
      for (const unwanted of ["proj4", "memoized-class-decorator"]) {
        expect(
          !fs.existsSync(path.join(dir, "node_modules", unwanted)),
          `${unwanted} reached the loader`
        );
      }

      const names = ["loadGTFS", "normalise", "isCall", "coupledTripIds", "readZip", "CSVParser"];

      node(dir, `
        const m = require("@gb-transit/gtfs-loader");
        for (const name of ${JSON.stringify(names)}) {
          if (typeof m[name] !== "function") throw new Error(name + " is missing from the CommonJS build");
        }
      `);

      node(dir, `
        import {${names.join(", ")}} from "@gb-transit/gtfs-loader";
        for (const f of [${names.join(", ")}]) {
          if (typeof f !== "function") throw new Error("a name is missing from the ESM build");
        }
      `, true);

      // And that it reads a real feed once installed, not just that it loads.
      // The golden carries the transfer_type 4 rows cif2gtfs writes, so this is
      // where the two halves of the round trip meet as published packages.
      const feed = zip(path.join(ROOT, "apps/cif2gtfs/fixtures/mini/golden"), path.join(dir, "mini.zip"));

      node(dir, `
        import {loadGTFS, normalise} from "@gb-transit/gtfs-loader";
        import * as fs from "node:fs";
        const feed = await loadGTFS(fs.createReadStream(${JSON.stringify(feed)}));
        console.log("trips", feed.trips.length, "links", feed.links.length);
        if (feed.trips.length === 0 || feed.links.length === 0) throw new Error("the golden feed read as empty");
        normalise(feed);
      `, true);

      // And the same feed the other way, since raw mode has its own column
      // tables and its own coercion.
      node(dir, `
        import {loadGTFS} from "@gb-transit/gtfs-loader";
        import * as fs from "node:fs";
        const rows = await loadGTFS(fs.createReadStream(${JSON.stringify(feed)}), {raw: true});
        console.log("raw trips", rows["trips.txt"].length, "stops", rows["stops.txt"].length);
        if (rows["trips.txt"].length === 0 || rows["stops.txt"].length === 0) {
          throw new Error("the golden feed read as empty in raw mode");
        }
        if (rows["stops.txt"][0].stop_code === undefined) {
          throw new Error("raw mode dropped a column the planner feed does not read");
        }
      `, true);
    }
  },
];

function expect(condition, message) {
  if (!condition) {
    throw new Error(message);
  }
}

function noStackTrace(output) {
  // A stack trace here means the entry point lost its error handling.
  expect(!output.includes("at Object.<anonymous>"), `the entry point lost its error handling:\n${output}`);
}

function run(command, args, options = {}) {
  return execFileSync(command, args, {encoding: "utf8", stdio: "pipe", ...options});
}

/**
 * Run something that is allowed to fail, and keep what it said.
 */
function attempt(cwd, command, args, env = {}) {
  try {
    return {status: 0, output: run(command, args, {cwd, env: {...process.env, ...env}})};
  }
  catch (err) {
    return {status: err.status ?? 1, output: `${err.stdout ?? ""}${err.stderr ?? ""}`};
  }
}

function node(cwd, source, esm = false) {
  const output = run(
    process.execPath,
    esm ? ["--input-type=module", "-e", source] : ["-e", source],
    {cwd}
  );

  if (output.trim() !== "") {
    console.log(`    ${output.trim()}`);
  }
}

function zip(directory, into) {
  run("zip", ["-qr", into, "."], {cwd: directory});

  return into;
}

function diff(built, golden) {
  run("diff", ["-r", built, golden]);
}

/**
 * Pack every workspace, and return where each tarball landed.
 */
function packAll(into) {
  fs.mkdirSync(into, {recursive: true});

  const tarballs = {};

  for (const library of LIBRARIES) {
    const out = path.join(into, `${library}.tgz`);

    run("yarn", ["workspace", `@gb-transit/${library}`, "pack", "--out", out], {cwd: ROOT});
    tarballs[`@gb-transit/${library}`] = out;
  }

  for (const application of APPLICATIONS) {
    const out = path.join(into, `${application}.tgz`);

    run("yarn", ["workspace", application, "pack", "--out", out], {cwd: ROOT});
    tarballs[application] = out;
  }

  return tarballs;
}

/**
 * A clean directory with the named package installed from its tarball.
 */
function install(name, tarballs, into) {
  fs.mkdirSync(into, {recursive: true});

  // Everything except the package being installed: npm rejects an override for
  // the thing it was asked to install directly.
  const overrides = Object.fromEntries(
    Object.entries(tarballs)
      .filter(([pkg]) => pkg.startsWith("@gb-transit/") && pkg !== name)
      .map(([pkg, tarball]) => [pkg, `file:${tarball}`])
  );

  fs.writeFileSync(path.join(into, "package.json"), JSON.stringify({
    name: "pack-smoke-test",
    private: true,
    version: "1.0.0",
    overrides
  }, null, 2) + "\n");

  run("npm", ["install", "--no-audit", "--no-fund", tarballs[name]], {cwd: into});
}

function checkHelp(dir, name, expected) {
  const binary = `./node_modules/.bin/${name}`;
  const output = run(binary, ["--help"], {cwd: dir});

  for (const text of expected) {
    expect(output.includes(text), `${name} --help did not mention ${text}`);
  }
}

if (import.meta.filename === process.argv[1]) {
  const given = process.argv[2];
  const work = given ?? fs.mkdtempSync(path.join(os.tmpdir(), "packaged"));

  let failed = false;

  try {
    console.log(`Packing every workspace into ${work}/tarballs`);

    const tarballs = packAll(path.join(work, "tarballs"));

    for (const check of CHECKS) {
      const dir = path.join(work, "install", check.name.replace("@gb-transit/", ""));

      console.log(`\n=== ${check.name} ===`);

      try {
        install(check.name, tarballs, dir);

        if (check.help !== undefined) {
          checkHelp(dir, check.name, check.help);
        }

        check.run(dir);
        console.log(`    ok`);
      }
      catch (err) {
        console.error(`    FAILED: ${err.message}`);
        failed = true;
      }
    }
  }
  finally {
    if (given === undefined) {
      fs.rmSync(work, {recursive: true, force: true});
    }
  }

  process.exit(failed ? 1 : 0);
}
