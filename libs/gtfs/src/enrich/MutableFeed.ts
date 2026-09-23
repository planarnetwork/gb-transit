import {CRS, Route, Stop, StopID, Trip} from "@gb-transit/gtfs-schema";
import {Enricher} from "./Enricher";
import {Provenance} from "./Provenance";
import {FeedView} from "../extend/FeedView";

/**
 * The built feed, indexed, and writable only through a recorded write.
 *
 * An enricher gets this rather than the arrays, for two reasons. It can find a
 * stop by its code without walking 3,783 of them, which matters when a source
 * has 400,000 rows to match against. And it cannot assign to a field: `set` is
 * the only way in, so every change has an author and a priority, and nothing
 * can quietly overwrite something better.
 *
 * Deliberately narrow. An enricher adds detail to entities the DTD already
 * produced; it does not create trips or delete stops. A source that wants to do
 * that is not an enricher and should say so.
 *
 * It is also the `FeedView` an extension reads, which is the same feed seen
 * through a smaller hole: everything here that reads, and nothing that writes.
 */
export class MutableFeed implements FeedView {

  private readonly stopIndex: Map<StopID, Stop>;
  private readonly tripIndex: Map<string, Trip>;
  private readonly routeIndex: Map<string, Route>;
  private stationIndex?: Map<CRS, Stop>;

  constructor(
    public readonly stops: Stop[],
    public readonly trips: Trip[],
    public readonly routes: Route[],
    private readonly provenance: Provenance = new Provenance(),
    /**
     * Per enricher, the only fields it may write, from the config's `apply:`.
     * An enricher with no entry is unrestricted.
     *
     * Enforced here rather than asked of the enricher, because an allowlist an
     * enricher is trusted to honour is not an allowlist. It also means a source
     * can be taken for the one thing it is good at - NaPTAN's coordinates
     * without NaPTAN's station names - without forking it.
     */
    private readonly allowed: ReadonlyMap<string, ReadonlySet<string>> = new Map()
  ) {
    this.stopIndex = new Map(stops.map(stop => [stop.stop_id, stop]));
    this.tripIndex = new Map(trips.map(trip => [trip.trip_id, trip]));
    this.routeIndex = new Map(routes.map(route => [route.route_id, route]));
  }

  public stop(id: StopID): Stop | undefined {
    return this.stopIndex.get(id);
  }

  /**
   * A station by its CRS code, which is what an external source has.
   *
   * Built on first use rather than in the constructor: every build makes a
   * MutableFeed and only the ones running an extension ask for this.
   */
  public station(crs: CRS): Stop | undefined {
    this.stationIndex ??= new Map(this.stations.map(stop => [stop.crs, stop]));

    return this.stationIndex.get(crs);
  }

  public trip(id: string): Trip | undefined {
    return this.tripIndex.get(id);
  }

  public route(id: string): Route | undefined {
    return this.routeIndex.get(id);
  }

  /**
   * Every station, by the code a rider would recognise, so a source keyed on
   * CRS does not have to know that a station may have platforms beneath it.
   */
  public get stations(): Stop[] {
    return this.stops.filter(stop => stop.parent_station === null);
  }

  /**
   * Write a field, if the enricher outranks whoever wrote it last.
   *
   * Returns whether it took effect, which an enricher needs to count its own
   * conflicts honestly - a source that reports 3,000 matches while losing 2,900
   * of them has not done what the number suggests.
   */
  public set<E extends Stop | Trip | Route, K extends keyof E>(
    entity: E,
    field: K,
    value: E[K],
    by: Enricher
  ): boolean {
    const permitted = this.allowed.get(by.key);

    if (permitted !== undefined && !permitted.has(String(field))) {
      this.refusals.set(by.key, (this.refusals.get(by.key) ?? 0) + 1);

      return false;
    }

    const kind = entityKind(entity);
    const id = String(identify(entity));
    const applied = this.provenance.record(kind, id, String(field), {
      enricher: by.key,
      priority: by.priority,
      value
    });

    if (applied) {
      entity[field] = value;
    }

    return applied;
  }

  public get ledger(): Provenance {
    return this.provenance;
  }

  /**
   * Writes turned away by an `apply:` list. Reported, because a list that turns
   * away everything an enricher does is a config that reads as enabling a
   * source and does nothing.
   */
  public get refused(): number {
    return [...this.refusals.values()].reduce((total, count) => total + count, 0);
  }

  /**
   * The same, for one enricher. The total says a config is wrong somewhere;
   * this says which one, which is the difference between a number to
   * investigate and a line to fix.
   */
  public refusedBy(key: string): number {
    return this.refusals.get(key) ?? 0;
  }

  private readonly refusals = new Map<string, number>();

}

function entityKind(entity: Stop | Trip | Route): string {
  return "stop_id" in entity ? "stop" : "trip_id" in entity ? "trip" : "route";
}

function identify(entity: Stop | Trip | Route): string | number {
  return "stop_id" in entity ? entity.stop_id
    : "trip_id" in entity ? entity.trip_id
      : entity.route_id;
}
