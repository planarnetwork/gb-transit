import {LINK_MODES, MODES, NO_EXCLUSIONS, ServiceExclusions} from "../transform/ExcludeServices";
import {RouteType} from "@gb-transit/gtfs-schema";

/**
 * A build, described in a file rather than in a command line.
 *
 * Once a build selects sources, a date, a window, a licence tier and a list of
 * enrichers each with their own options, the flags stop being a reasonable way
 * to say it - and, more to the point, stop being reviewable. A nightly that
 * differs from yesterday's should differ by a diff somebody approved.
 *
 * Validated by hand rather than by a schema library: the errors are the whole
 * point of this file existing, and "must match schema #/enrichers" helps
 * nobody at 3am when a feed did not build.
 */
export interface BuildConfig {
  readonly source: readonly string[];
  readonly out: string;
  readonly today?: string;
  readonly range?: string;
  readonly links: boolean;
  /**
   * Whether to drop the locations a service passes through without stopping.
   * On unless the config says otherwise - see BuildContext.
   */
  readonly removePassingPoints: boolean;
  /**
   * Whether an associated schedule that runs the day after its base is also
   * published on the base's service day. Off unless the config says so - see
   * BuildContext.
   */
  readonly duplicateOvernightAssociations: boolean;
  /**
   * The services to leave out of the feed. Nothing unless the config says so -
   * see ExcludeServices.
   */
  readonly exclude: ServiceExclusions;
  readonly licence: Licence;
  readonly enrichers: readonly EnricherConfig[];
  readonly extensions: readonly ExtensionConfig[];
}

/**
 * Which sources a build is allowed to draw on. One artifact is produced per
 * tier, and a build that mixes a share-alike source into the permissive one
 * fails rather than the obligation being discovered after publishing.
 */
export type Licence = "permissive" | "full";

export interface EnricherConfig {
  readonly key: string;
  /** Overrides the enricher's own, when one source should outrank another here. */
  readonly priority?: number;
  /**
   * The only fields this enricher may write. Absent means no restriction.
   *
   * The point is to take a source for the one thing it is good at. NaPTAN has
   * excellent coordinates and station names that are not the ones on the
   * departure boards, and there is no reason to accept both to get one.
   */
  readonly apply?: readonly string[];
  readonly options: {readonly [key: string]: unknown};
}

/**
 * An extension the build should run, and what to tell it.
 *
 * No `priority` and no `apply`: those settle which of two sources wins a field,
 * and an extension writes its own files rather than competing for anything. Two
 * extensions wanting the same file is a collision to fail on, not a contest to
 * resolve.
 */
export interface ExtensionConfig {
  readonly key: string;
  readonly options: {readonly [key: string]: unknown};
}

/**
 * The `apply:` lists, in the form MutableFeed enforces them.
 *
 * An enricher whose config says nothing contributes no entry, because that is
 * what "no restriction" is. An empty set would mean the opposite - every write
 * turned away - and a config that omits `apply:` is asking for the source as it
 * comes, not for none of it.
 */
export function applyLists(enrichers: readonly EnricherConfig[]): Map<string, Set<string>> {
  return new Map(
    enrichers
      .filter(enricher => enricher.apply !== undefined)
      .map(enricher => [enricher.key, new Set(enricher.apply)])
  );
}

const LICENCES: Licence[] = ["permissive", "full"];
const TOP_LEVEL = [
  "source", "out", "today", "range", "links", "removePassingPoints",
  "duplicateOvernightAssociations", "exclude", "licence", "enrichers", "extensions"
];
const EXCLUDE = ["modes", "operators", "replacementBuses", "links"];
const ATOC_CODE = /^[A-Z]{2}$/;

/**
 * Check a parsed config and say precisely what is wrong with it.
 *
 * `known` and `knownExtensions` are the keys the build has registered. An
 * unknown one fails here rather than being ignored: a typo in a name would
 * otherwise produce a feed that is quietly missing whatever it was supposed to
 * add, and nothing downstream could tell that from a source with no matches.
 */
export function parseConfig(
  raw: unknown,
  known: readonly string[] = [],
  knownExtensions: readonly string[] = []
): BuildConfig {
  const config = object(raw, "the config");

  for (const key of Object.keys(config)) {
    if (!TOP_LEVEL.includes(key)) {
      throw new Error(`${key} is not a config option. Expected one of: ${TOP_LEVEL.join(", ")}.`);
    }
  }

  const source = list(config.source, "source");

  if (source.length === 0) {
    throw new Error("source needs at least one feed file or directory.");
  }

  const licence = config.licence === undefined ? "permissive" : String(config.licence);

  if (!LICENCES.includes(licence as Licence)) {
    throw new Error(`licence must be one of: ${LICENCES.join(", ")}. Got ${licence}.`);
  }

  return {
    source,
    out: config.out === undefined ? "gtfs.zip" : String(config.out),
    today: config.today === undefined ? undefined : String(config.today),
    range: config.range === undefined ? undefined : String(config.range),
    links: config.links === true,
    // Not `!== false`, which would read `removePassingPoints: "no"` as true.
    // A config is the reviewable form of a build and a value it silently
    // reverses is worse than one it refuses.
    removePassingPoints: boolean(config.removePassingPoints, true, "removePassingPoints"),
    // Read the same way for the same reason. `Boolean(...)` would take
    // `duplicateOvernightAssociations: "no"` for a yes and publish every
    // overnight portion twice, which is a lot of feed to explain afterwards.
    duplicateOvernightAssociations: boolean(
      config.duplicateOvernightAssociations, false, "duplicateOvernightAssociations"
    ),
    exclude: exclusions(config.exclude),
    licence: licence as Licence,
    enrichers: enrichers(config.enrichers, known),
    extensions: extensions(config.extensions, knownExtensions)
  };
}

/**
 * Two forms, because both are the obvious thing to write.
 *
 * `extensions: [fares_v2]` is a list of what to turn on, which is the common
 * case and the form the plan was written in. `extensions: {fares_v2: {options:
 * ...}}` is the same thing with something to say, and matches how enrichers are
 * declared. Neither is a shorthand for the other; they are the same setting
 * read two ways.
 */
function extensions(raw: unknown, known: readonly string[]): ExtensionConfig[] {
  if (raw === undefined || raw === null) {
    return [];
  }

  if (typeof raw === "string" || Array.isArray(raw)) {
    return list(raw, "extensions").map(key => ({key: check(key, known), options: {}}));
  }

  const configured = object(raw, "extensions");

  return Object.keys(configured).sort().map(key => {
    const settings = configured[key] === null || configured[key] === undefined
      ? {}
      : object(configured[key], key);

    for (const option of Object.keys(settings)) {
      if (option !== "options") {
        throw new Error(`${key}.${option} is not an extension option. Expected options.`);
      }
    }

    return {
      key: check(key, known),
      options: settings.options === undefined ? {} : object(settings.options, `${key}.options`)
    };
  });
}

/**
 * What the build should leave out. Four lists, all optional:
 * `exclude: {modes: [metro]}` is a whole rule.
 */
function exclusions(raw: unknown): ServiceExclusions {
  if (raw === undefined || raw === null) {
    return NO_EXCLUSIONS;
  }

  const configured = object(raw, "exclude");

  for (const key of Object.keys(configured)) {
    if (!EXCLUDE.includes(key)) {
      throw new Error(`exclude.${key} is not something to exclude. Expected one of: ${EXCLUDE.join(", ")}.`);
    }
  }

  return {
    modes: configured.modes === undefined
      ? []
      : list(configured.modes, "exclude.modes").map(m => mode(m, "exclude.modes")),
    operators: configured.operators === undefined
      ? []
      : list(configured.operators, "exclude.operators").map(o => operator(o, "exclude.operators")),
    replacementBuses: configured.replacementBuses === undefined
      ? []
      : list(configured.replacementBuses, "exclude.replacementBuses")
        .map(o => operator(o, "exclude.replacementBuses")),
    links: configured.links === undefined
      ? []
      : list(configured.links, "exclude.links").map(m => linkMode(m, "exclude.links"))
  };
}

/**
 * A mode by the name a config writes it under. `modes: [underground]` fails
 * here rather than becoming a rule that silently excludes nothing.
 */
function mode(name: string, what: string): RouteType {
  const found = MODES.get(name.trim().toLowerCase());

  if (found === undefined) {
    throw new Error(
      `${what} does not take ${JSON.stringify(name)}. Expected one of: ${[...MODES.keys()].join(", ")}.`
    );
  }

  return found;
}

/**
 * A fixed link mode, as the ALF writes it. `links: [underground]` fails here for
 * the same reason `modes: [underground]` does.
 */
function linkMode(name: string, what: string): string {
  const upper = name.trim().toUpperCase();

  if (!LINK_MODES.includes(upper)) {
    throw new Error(`${what} does not take ${JSON.stringify(name)}. Expected one of: ${LINK_MODES.join(", ")}.`);
  }

  return upper;
}

/**
 * An ATOC code, checked for shape and not against data/agency.ts: a code
 * appearing in the CIF without this build knowing it can still be excluded.
 */
function operator(code: string, what: string): string {
  const upper = code.trim().toUpperCase();

  if (!ATOC_CODE.test(upper)) {
    throw new Error(`${what} takes two-letter ATOC codes. Got ${JSON.stringify(code)}.`);
  }

  return upper;
}

function check(key: string, known: readonly string[]): string {
  if (!known.includes(key)) {
    throw new Error(
      `${key} is not an extension this build knows about. ` +
      `Available: ${known.length > 0 ? [...known].sort().join(", ") : "none are registered"}.`
    );
  }

  return key;
}

function enrichers(raw: unknown, known: readonly string[]): EnricherConfig[] {
  if (raw === undefined || raw === null) {
    return [];
  }

  const configured = object(raw, "enrichers");

  return Object.keys(configured).sort().map(key => {
    if (!known.includes(key)) {
      throw new Error(
        `${key} is not an enricher this build knows about. ` +
        `Available: ${known.length > 0 ? [...known].sort().join(", ") : "none are registered"}.`
      );
    }

    // `NAPTAN:` with nothing under it means "on, with its own defaults", which
    // is the common case and should not need an empty object written out.
    const settings = configured[key] === null || configured[key] === undefined
      ? {}
      : object(configured[key], key);

    for (const option of Object.keys(settings)) {
      if (!["priority", "apply", "options"].includes(option)) {
        throw new Error(`${key}.${option} is not an enricher option. Expected priority, apply or options.`);
      }
    }

    if (settings.priority !== undefined && typeof settings.priority !== "number") {
      throw new Error(`${key}.priority must be a number. Got ${JSON.stringify(settings.priority)}.`);
    }

    return {
      key,
      priority: settings.priority as number | undefined,
      apply: settings.apply === undefined ? undefined : list(settings.apply, `${key}.apply`),
      options: settings.options === undefined ? {} : object(settings.options, `${key}.options`)
    };
  });
}

function boolean(value: unknown, otherwise: boolean, what: string): boolean {
  if (value === undefined || value === null) {
    return otherwise;
  }

  if (typeof value !== "boolean") {
    throw new Error(`${what} must be true or false. Got ${JSON.stringify(value)}.`);
  }

  return value;
}

function object(value: unknown, what: string): {[key: string]: unknown} {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    throw new Error(`${what} must be a set of keys and values. Got ${describe(value)}.`);
  }

  return value as {[key: string]: unknown};
}

function list(value: unknown, what: string): string[] {
  // A single string where a list is expected is the obvious thing to write and
  // there is no reason to reject it.
  if (typeof value === "string") {
    return [value];
  }

  if (!Array.isArray(value)) {
    throw new Error(`${what} must be a list. Got ${describe(value)}.`);
  }

  return value.map(String);
}

function describe(value: unknown): string {
  return value === null ? "nothing"
    : Array.isArray(value) ? "a list"
      : typeof value;
}
