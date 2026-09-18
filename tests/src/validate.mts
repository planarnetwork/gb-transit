import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import {execFileSync} from "node:child_process";
import {zipSync, strToU8} from "fflate";
import {build as buildRail} from "cif2gtfs";
import {convert as buildBus} from "transxchange2gtfs";
import {merge} from "gtfsmerge";

/**
 * Build every feed this repository produces and hold each to the MobilityData
 * validator.
 *
 * Any ERROR fails. Warnings and info do not, because the feeds have known ones
 * that are either out of our hands or waiting on a ticket - but the set of them
 * is committed, so a new one fails and a fixed one has to be taken off the list.
 * A baseline nobody prunes stops meaning anything.
 *
 * The merged feed is the one worth having here. The other two are checked by
 * their own golden tests; the merge renumbers every service, route and trip id
 * across two feeds, and a dangling reference from that is exactly what a
 * hand-written fixture cannot produce and a validator can see.
 *
 *   node dist/validate.js path/to/gtfs-validator.jar
 *   UPDATE_BASELINE=1 node dist/validate.js path/to/gtfs-validator.jar
 */
const jar = process.argv[2];
const railFixtures = path.join(import.meta.dirname, "..", "..", "apps", "cif2gtfs", "fixtures", "mini");
const busFixtures = path.join(import.meta.dirname, "..", "..", "apps", "transxchange2gtfs", "fixtures", "mini");
const mergeFixtures = path.join(import.meta.dirname, "..", "..", "apps", "gtfsmerge", "fixtures");

/**
 * The date the feeds are built for, and the date the validator judges them
 * against. Both, or the check drifts: several rules - feed expiry, expired
 * calendars - compare the feed to the real clock, so a fixture pinned to a fixed
 * day starts raising new notices simply because time passed, and one day the
 * whole feed reads as historic. -d pins the validator's today to the feed's.
 */
const TODAY = "2026-08-10";

if (!jar || !fs.existsSync(jar)) {
  throw new Error(`Pass the path to gtfs-validator-<version>-cli.jar. Got ${jar ?? "nothing"}.`);
}

const work = fs.mkdtempSync(path.join(os.tmpdir(), "validate"));
const rail = path.join(work, "rail");
const bus = path.join(work, "bus");
const merged = path.join(work, "merged");

fs.mkdirSync(rail);

await buildRail([
  "node", "cif2gtfs", "build",
  "--source", path.join(railFixtures, "RJTTF001.ZIP"),
  "--out", rail,
  "--today", TODAY
]);

await buildBus({
  inputs: [path.join(busFixtures, "mini.xml")],
  output: bus,
  naptanFile: path.join(busFixtures, "naptan.csv"),
  // The same day the feeds are judged against, so the window the bus feed
  // describes does not move with the clock.
  from: TODAY,
  tmp: path.join(work, "buswork")
});

await merge({
  inputs: [zipOf(rail, path.join(work, "rail.zip")), zipOf(bus, path.join(work, "bus.zip"))],
  output: merged,
  filterDatesBefore: TODAY.replace(/-/g, ""),
  tmp: path.join(work, "mergework")
});

const feeds = [
  ["rail", rail, path.join(railFixtures, "validator-baseline.json")],
  ["bus", bus, path.join(busFixtures, "validator-baseline.json")],
  ["merged", merged, path.join(mergeFixtures, "validator-baseline.json")]
] as const;

let failed = false;

for (const [name, feed, baselineFile] of feeds) {
  console.log(`\n=== ${name} ===`);
  failed = check(name, feed, baselineFile) || failed;
}

if (failed) {
  process.exit(1);
}

interface Notice {
  code: string;
  severity: string;
  totalNotices: number;
}

function zipOf(directory: string, into: string): string {
  const entries: Record<string, Uint8Array> = {};

  for (const file of fs.readdirSync(directory).filter(f => f.endsWith(".txt"))) {
    entries[file] = strToU8(fs.readFileSync(path.join(directory, file), "utf8"));
  }

  fs.writeFileSync(into, zipSync(entries));

  return into;
}

function check(name: string, feed: string, baselineFile: string): boolean {
  const out = fs.mkdtempSync(path.join(os.tmpdir(), "validate-report"));

  // -svu because a validator release should not change the result of a pinned run
  execFileSync("java", ["-jar", jar, "-i", feed, "-o", out, "-d", TODAY, "-svu"], {stdio: "inherit"});

  const notices: Notice[] = JSON.parse(fs.readFileSync(path.join(out, "report.json"), "utf8")).notices;
  const seen = notices.map(notice => notice.code).sort();

  if (process.env.UPDATE_BASELINE) {
    // Keep everything else the file says. Each accepted notice carries a reason,
    // and regenerating the list is not licence to throw those away - the reasons
    // are the only thing that makes an accepted notice different from an ignored
    // one.
    const existing = fs.existsSync(baselineFile)
      ? JSON.parse(fs.readFileSync(baselineFile, "utf8"))
      : {};

    fs.writeFileSync(baselineFile, JSON.stringify({...existing, accepted: seen}, null, 2) + "\n");
    console.log(`Wrote ${seen.length} accepted notice type(s) to ${path.basename(baselineFile)}`);

    const missing = seen.filter(code => existing.reasons?.[code] === undefined);

    if (missing.length > 0) {
      console.log(`  no reason recorded for: ${missing.join(", ")}`);
    }

    return false;
  }

  const baseline: string[] = JSON.parse(fs.readFileSync(baselineFile, "utf8")).accepted;
  const errors = notices.filter(notice => notice.severity === "ERROR");
  const added = seen.filter(code => !baseline.includes(code));
  const gone = baseline.filter(code => !seen.includes(code));

  for (const notice of notices.sort((a, b) => a.code < b.code ? -1 : 1)) {
    console.log(`${notice.severity.padEnd(8)} ${notice.code.padEnd(45)} ${notice.totalNotices}`);
  }

  const complaints: string[] = [];

  if (errors.length > 0) {
    complaints.push(`${errors.length} validator error(s): ${errors.map(e => e.code).join(", ")}`);
  }

  if (added.length > 0) {
    complaints.push(
      `${added.length} notice(s) the baseline does not accept: ${added.join(", ")}. ` +
      `Fix them, or add them to ${path.basename(baselineFile)} with a reason.`
    );
  }

  if (gone.length > 0) {
    complaints.push(
      `${gone.length} accepted notice(s) no longer occur: ${gone.join(", ")}. ` +
      `Take them out of ${path.basename(baselineFile)} so the list keeps meaning something.`
    );
  }

  if (complaints.length > 0) {
    console.error(`\n${name}: ` + complaints.join(`\n${name}: `));

    return true;
  }

  console.log(`\n${name}: no errors. ${seen.length} accepted notice type(s).`);

  return false;
}
