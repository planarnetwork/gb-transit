import {execFileSync} from "node:child_process";
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";

/**
 * The importer, against a real database.
 *
 * Nothing in the unit tests can run without one, so every claim about the
 * importer was checked by hand until this existed. It needs a MariaDB, which is
 * why it is its own CI job and why it is a script rather than a spec.
 *
 *   DATABASE_HOSTNAME=127.0.0.1 DATABASE_USERNAME=root DATABASE_NAME=dtd2mysql_test \
 *     node scripts/check-database.mjs [directory]
 *
 * Three things, in order:
 *
 *   The mini fixture is a real DTD zip, so importing it exercises the whole
 *   parse-and-insert path - the fixed width records, the generated ids, the DDL.
 *
 *   The same feed comes out whichever way the timetable was read. That is the
 *   whole point of having two sources, and no unit test can check it: one side
 *   needs a database and the other exists so it does not.
 *
 *   Importing twice lands the same rows. Records that generate their own id are
 *   the risk, and a collision only shows on the second import.
 *
 *   The feed it just wrote loads back in. --gtfs-import creates its own tables
 *   from their own declarations, so nothing above it touches them, and until
 *   this ran them a column type only one database refuses was invisible.
 */
const ROOT = path.resolve(import.meta.dirname, "..");
const FIXTURE = path.join(ROOT, "apps/cif2gtfs/fixtures/mini/RJTTF001.ZIP");
const TODAY = "2026-08-10";

function yarn(args, env = {}) {
  execFileSync("yarn", args, {cwd: ROOT, stdio: "inherit", env: {...process.env, ...env}});
}

function importFixture() {
  yarn(["tsx", "apps/dtd2mysql/src/index.ts", "--timetable", FIXTURE]);
}

function fromDatabase(into) {
  fs.mkdirSync(into, {recursive: true});
  yarn(["tsx", "apps/dtd2mysql/src/index.ts", "--gtfs", into], {GTFS_TODAY: TODAY});
}

function fromFiles(into) {
  fs.mkdirSync(into, {recursive: true});
  yarn([
    "tsx", "apps/cif2gtfs/src/index.ts", "build",
    "--source", FIXTURE, "--out", into, "--today", TODAY
  ]);
}

function intoDatabase(from) {
  yarn(["tsx", "apps/dtd2mysql/src/index.ts", "--gtfs-import", from]);
}

function same(a, b, what) {
  console.log(`\n=== ${what} ===`);
  execFileSync("diff", ["-r", a, b], {stdio: "inherit"});
  console.log("identical");
}

if (import.meta.filename === process.argv[1]) {
  const given = process.argv[2];
  const work = given ?? fs.mkdtempSync(path.join(os.tmpdir(), "database"));

  try {
    console.log("=== importing the mini fixture ===");
    importFixture();

    const database = path.join(work, "from-db");
    const files = path.join(work, "from-files");
    const twice = path.join(work, "twice");

    fromDatabase(database);
    fromFiles(files);
    same(database, files, "the file source produces the same feed");

    console.log("\n=== importing the same feed again ===");
    importFixture();
    fromDatabase(twice);
    same(database, twice, "importing twice changes nothing");

    console.log("\n=== loading the feed back in ===");
    intoDatabase(database);
  }
  finally {
    if (given === undefined) {
      fs.rmSync(work, {recursive: true, force: true});
    }
  }
}
