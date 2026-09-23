import {AgencyID, RouteType} from "@gb-transit/gtfs-schema";
import {Schedule} from "../model/Schedule";
import {ScheduleIndex} from "./ApplyAssociations";

/**
 * The services a build leaves out.
 *
 * The CIF carries services National Rail does not hold authority over - the
 * tube, the Metro, the ferries and the buses - and a feed combined with other
 * sources has better answers for those elsewhere.
 */
export interface ServiceExclusions {
  /**
   * Modes to leave out whoever runs them. A replacement bus is a mode of its
   * own, so `Bus` leaves the replacements alone.
   *
   * The mode is not intrinsic: it is the CIF train category read through the
   * eight-entry table in ScheduleBuilder, and a category outside it is taken
   * for rail. The table does cover every non-rail category the format has - SS
   * is the only ship, OL the only metro, BR and BS the only buses - so nothing
   * escapes by falling through, but a mode added there has to be added here to
   * be excludable.
   */
  readonly modes: readonly RouteType[];
  /**
   * Operators to leave out whatever they are running, replacement buses
   * included. A blacklist, so an operator this build has never heard of is
   * published rather than silently dropped.
   */
  readonly operators: readonly AgencyID[];
  /** Operators whose replacement buses to leave out, keeping their trains. */
  readonly replacementBuses: readonly AgencyID[];
  /**
   * Fixed link modes to leave out of transfers.txt - `TUBE` for a feed that is
   * combined with the Underground's own timetable, where a link saying the tube
   * takes 25 minutes from Euston to Waterloo competes with the trains that
   * actually run.
   *
   * Optional so a rule written before it existed still compiles; absent means
   * none. Only the links named go: a pair that is also a `WALK` keeps the walk,
   * at the walk's time.
   */
  readonly links?: readonly string[];
}

/** Everything published, which is what a build saying nothing about this gets. */
export const NO_EXCLUSIONS: ServiceExclusions = {modes: [], operators: [], replacementBuses: [], links: []};

/**
 * The modes the ALF and FLF describe a fixed link by, as the DTD specification
 * lists them. `TRAM` is not in the specification and is in the data.
 */
export const LINK_MODES: readonly string[] = ["BUS", "FERRY", "METRO", "TAXI", "TRAM", "TRANSFER", "TUBE", "WALK"];

/**
 * Drop the fixed links whose mode the rules name, before they are merged into
 * transfers.txt - after merging, a pair described as both `TRANSFER` and `TUBE`
 * carries the shorter of the two times and there is no taking the tube back
 * out of it.
 */
export function excludeLinks<T extends {readonly mode: string}>(links: readonly T[], rules: ServiceExclusions): T[] {
  const modes = new Set(rules.links ?? []);

  if (modes.size === 0) {
    return [...links];
  }

  const kept = links.filter(link => !modes.has(link.mode));
  const dropped = links.length - kept.length;

  console.log(`Excluded ${dropped} fixed link(s) by mode ${[...modes].sort().join(", ")}`);

  return kept;
}

/**
 * The modes by the name a config writes them under. Words rather than the GTFS
 * numbers, because `modes: [1, 3, 4]` is a config nobody can review. The first
 * name for each is the one messages use.
 *
 * Only the modes a CIF schedule can actually have - the five in
 * ScheduleBuilder's category table. Tram is a GTFS mode and not one of them, so
 * it is not offered: a rule that could only ever match nothing is the thing
 * refusing `underground` at parse time exists to prevent.
 */
export const MODES: ReadonlyMap<string, RouteType> = new Map([
  ["metro", RouteType.Subway],
  ["subway", RouteType.Subway],
  ["rail", RouteType.Rail],
  ["bus", RouteType.Bus],
  ["ship", RouteType.Ferry],
  ["ferry", RouteType.Ferry],
  ["replacement-bus", RouteType.ReplacementBus]
]);

/**
 * Drop the schedules the rules name.
 *
 * Applied to the index the overlays produced, so a train that some days is
 * replaced by a service the rules drop has already had those days taken off its
 * calendar. A TUID left with nothing goes with them.
 */
export function excludeServices(schedules: ScheduleIndex, rules: ServiceExclusions): ScheduleIndex {
  if (nothingToDo(rules)) {
    return schedules;
  }

  const modes = new Set(rules.modes);
  const operators = new Set(rules.operators);
  const replacementBuses = new Set(rules.replacementBuses);

  const byOperator = (schedule: Schedule) => operators.has(schedule.operator);
  const byMode = (schedule: Schedule) => modes.has(schedule.mode);
  const byReplacementBus = (schedule: Schedule) =>
    schedule.mode === RouteType.ReplacementBus && replacementBuses.has(schedule.operator);

  const excluded = (schedule: Schedule) =>
    byOperator(schedule) || byMode(schedule) || byReplacementBus(schedule);

  /**
   * Every rule that catches it, not the first: the rules overlap - a tube train
   * is both `mode metro` and `operator LT` - and a rule reported as catching
   * nothing because another got there first would be a false alarm.
   *
   * Only asked of a schedule already known to be excluded, so the common answer
   * - kept, no rules, no list - costs nothing.
   */
  const why = (schedule: Schedule) => [
    byOperator(schedule) ? `operator ${schedule.operator}` : undefined,
    byMode(schedule) ? `mode ${modeName(schedule.mode)}` : undefined,
    byReplacementBus(schedule) ? `replacement buses of ${schedule.operator}` : undefined
  ].filter(rule => rule !== undefined);

  const kept: ScheduleIndex = {};
  const dropped = new Map<string, number>();
  let total = 0;

  for (const [tuid, records] of Object.entries(schedules)) {
    const survivors = records.filter(schedule => {
      if (!excluded(schedule)) {
        return true;
      }

      for (const rule of why(schedule)) {
        dropped.set(rule, (dropped.get(rule) ?? 0) + 1);
      }

      total++;

      return false;
    });

    if (survivors.length > 0) {
      kept[tuid] = survivors;
    }
  }

  report(rules, dropped, total);

  return kept;
}

/**
 * What each rule matched, including the rules that matched nothing. The codes
 * are not checked against the operators this build knows, so a rule matching
 * nothing is the only sign of a mistyped one - and a rule that is meant to catch
 * nothing most nights, like an operator that only leaks into the feed
 * occasionally, looks the same and is worth saying either way.
 *
 * The counts can add up to more than the total, because the rules overlap.
 */
function report(rules: ServiceExclusions, dropped: Map<string, number>, total: number): void {
  const counted = [...dropped.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([rule, count]) => `${rule} (${count})`);

  console.log(`Excluded ${total} schedule(s)${counted.length > 0 ? `, matching ${counted.join(", ")}` : ""}`);

  const idle = every(rules).filter(rule => !dropped.has(rule));

  if (idle.length > 0) {
    console.log(`Nothing matched ${idle.join(", ")} - not in this feed, or not the code it uses.`);
  }
}

/**
 * Every rule as the report names it, so one that caught nothing can be found.
 *
 * Deduplicated, because `operators: [LT, LT]` is a config somebody can write
 * and "Nothing matched operator LT, operator LT" is not a message anybody
 * should have to read. `metro` and `subway` name the same mode too.
 */
function every(rules: ServiceExclusions): string[] {
  return [...new Set([
    ...rules.operators.map(operator => `operator ${operator}`),
    ...rules.modes.map(mode => `mode ${modeName(mode)}`),
    ...rules.replacementBuses.map(operator => `replacement buses of ${operator}`)
  ])];
}

function nothingToDo(rules: ServiceExclusions): boolean {
  return rules.modes.length === 0
    && rules.operators.length === 0
    && rules.replacementBuses.length === 0;
}

/** The mode under the name a config writes it, for a message read against the rules. */
function modeName(mode: RouteType): string {
  for (const [name, routeType] of MODES) {
    if (routeType === mode) {
      return name;
    }
  }

  return String(mode);
}
