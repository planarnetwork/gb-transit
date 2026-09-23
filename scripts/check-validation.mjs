import * as fs from "node:fs";

/**
 * Hold the validator report to .github/validator-baseline.json.
 *
 * "Any ERROR stops the release" cannot be the rule, because two of them are
 * decisions: B10 publishes an unlocated stop at 0,0 so that a validator flags
 * it, and B24/B25 are closed as source data the feed reports rather than
 * corrects. A gate that can never pass is a gate somebody turns off.
 *
 * So the baseline names the errors that are accepted and how many of each. An
 * unlisted code fails, and so does a listed one that grew - an accepted error
 * is a known quantity, not a licence for more of the same. Fewer than the
 * baseline allows is reported rather than accepted silently, because that is
 * the moment to tighten it.
 *
 * Usage: check-validation.mjs [REPORT] [BASELINE] [OUT]
 *
 * The nightly publishes three feeds - whole, without the services National Rail
 * does not hold authority over, and that with TfL's timetables beside it - and
 * each gets its own baseline. One baseline for all of them would mean accepting
 * in each feed whatever only another raises, which is not a gate.
 */
const [reportPath = "report/report.json",
       baselinePath = ".github/validator-baseline.json",
       outPath = "feed/validation.json"] = process.argv.slice(2);

const report = JSON.parse(fs.readFileSync(reportPath, "utf8"));
const baseline = JSON.parse(fs.readFileSync(baselinePath, "utf8"));

console.log(`${reportPath} against ${baselinePath}`);

const errors = report.notices.filter(notice => notice.severity === "ERROR");
const counted = new Map(errors.map(error => [error.code, error.totalNotices]));

const unlisted = [...counted].filter(([code]) => !baseline.hasOwnProperty(code));
const grown = [...counted].filter(([code, count]) => baseline[code] && count > baseline[code].max);
const shrunk = Object.entries(baseline).filter(([code, {max}]) => (counted.get(code) ?? 0) < max);

const shown = 20;

const describe = sample => Object.entries(sample)
  .filter(([, value]) => value !== null && value !== undefined)
  .map(([field, value]) => `${field}=${value}`)
  .join(" ");

const schedules = samples => {
  const counts = new Map();

  for (const {tripId} of samples) {
    const schedule = tripId.split("_")[0];
    counts.set(schedule, (counts.get(schedule) ?? 0) + 1);
  }

  return [...counts]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([schedule, count]) => count > 1 ? `${schedule} (${count})` : schedule);
};

const detail = code => {
  const {sampleNotices: samples, totalNotices: total} = errors.find(error => error.code === code);

  if (samples.length > 0 && samples.every(sample => sample.tripId)) {
    const named = schedules(samples);
    console.log(`  ${named.length} schedule(s): ${named.join(", ")}`);
  }

  for (const sample of samples.slice(0, shown)) {
    console.log(`  ${describe(sample)}`);
  }

  if (total > shown) {
    console.log(`  ...and ${total - shown} more`);
  }

  if (total > samples.length) {
    console.log(`  (the report holds ${samples.length} of the ${total})`);
  }
};

for (const [code, count] of counted) {
  console.log(`${code} ${count}${baseline[code] ? ` (baseline ${baseline[code].max})` : ""}`);
  detail(code);
}

for (const [code, count] of unlisted) {
  console.error(`\n${code}: ${count}, and ${baselinePath} does not accept it.`);
  console.error("Fix it, or add it to the baseline with the reason it is acceptable.");
}

for (const [code, count] of grown) {
  console.error(`\n${code}: ${count}, but ${baselinePath} allows ${baseline[code].max}.`);
  console.error(`Accepted because: ${baseline[code].why}`);
  console.error("More of an accepted error is not accepted. Something changed.");
}

for (const [code, {max}] of shrunk) {
  console.log(`\n${code}: ${counted.get(code) ?? 0}, below the baseline of ${max}.`);
  console.log(`Lower ${baselinePath} to keep it from coming back.`);
}

fs.writeFileSync(outPath, JSON.stringify(report, null, 2));

if (unlisted.length > 0 || grown.length > 0) {
  console.error("\nThe feed will not be released.");
  process.exit(1);
}
