import {option} from "@gb-transit/gtfs";
import {convert} from "./api";
import {showHelp} from "./help";

/**
 * The CLI. `main` points at api.js rather than at this, so importing the package
 * does not run a conversion.
 */
async function main(argv: string[]): Promise<void> {
  if (argv.includes("--help") || argv.length < 4) {
    return showHelp();
  }

  const positional = positionalArgs(argv);

  await convert({
    inputs: positional.slice(0, -1),
    output: positional[positional.length - 1],
    naptanFile: option(argv, "naptan"),
    refreshStops: argv.includes("--update-stops"),
    skipStops: argv.includes("--skip-stops"),
    skipStopAreas: argv.includes("--skip-stop-areas"),
    from: option(argv, "from"),
    to: option(argv, "to"),
    version: option(argv, "feed-version"),
    tmp: option(argv, "tmp")
  });

  // Said here rather than in the conversion: convert() is a library function,
  // and a caller embedding it does not want our progress on their stdout.
  console.log("Complete.");
  console.log(
    `Memory usage: ${Math.round((process.memoryUsage().heapUsed / 1024 / 1024) * 100) / 100} MB`
  );
}

/**
 * The arguments that are not flags, and not a flag's value.
 */
function positionalArgs(argv: string[]): string[] {
  const takesValue = new Set(["--naptan", "--tmp", "--from", "--to", "--feed-version"]);
  const found: string[] = [];

  for (let i = 2; i < argv.length; i++) {
    if (argv[i].startsWith("--")) {
      // `--name value` consumes the next argument; `--name=value` does not.
      if (takesValue.has(argv[i])) {
        i++;
      }
    }
    else {
      found.push(argv[i]);
    }
  }

  return found;
}

main(process.argv).catch(err => {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});
