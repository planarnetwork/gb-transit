/**
 * The four digit National Location Code the rail industry identifies a place
 * by. Both a fare group and a fare location are one, and the same code space
 * holds both, so `0254` being a group and `0035` a location is a fact about
 * these records rather than about the number.
 */
export type NLC = string;

/**
 * A five digit routeing guide route code. `00000` is "any permitted route",
 * which is most of them; the rest name a route with its own rules.
 */
export type RouteCode = string;

/** A three letter station code, as the departure boards use it. */
export type CRS = string;

const DATE = /^\d{4}-\d{2}-\d{2}$/;

/**
 * One `<PermittedStations>` record: which stations of a fare group a journey
 * from one location may use, on one route, over one date range.
 *
 * Read `stations` as the whole of the answer for that combination rather than
 * an addition to another record's - the feed states each combination once, and
 * two records for the same three codes are two date ranges rather than two
 * halves of a list.
 */
export interface PermittedStations {
  readonly fareGroup: NLC;
  readonly fareLocation: NLC;
  readonly routeCode: RouteCode;
  /** `YYYY-MM-DD`, as the feed writes it. */
  readonly startDate: string;
  /** `YYYY-MM-DD`. `2999-12-31` is the industry's open-ended sentinel. */
  readonly endDate: string;
  /** At least one: the reader refuses a record that permits nothing. */
  readonly stations: readonly CRS[];
}

/**
 * Whether a record is in force on a day, `YYYY-MM-DD`.
 *
 * String comparison, which is what `YYYY-MM-DD` is for and what the rest of
 * this repository does with a feed's own dates. That only holds while both
 * sides are in that format, and the failure is silent rather than loud: `-` is
 * 0x2D and `0` is 0x30, so a record starting `2026-10-01` compares as already
 * in force against a GTFS-style `20260902`. The format is checked rather than
 * assumed, because a caller holding dates in the other convention is the likely
 * caller.
 */
export function inForce(record: PermittedStations, on: string): boolean {
  if (!DATE.test(on)) {
    throw new Error(`A date to compare against must be YYYY-MM-DD. Got ${JSON.stringify(on)}.`);
  }

  return record.startDate <= on && record.endDate >= on;
}
