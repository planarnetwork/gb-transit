import {TransferRow, TransferType} from "@gb-transit/gtfs-schema";
import {RowStream} from "./RowStream";
import {TRANSFERS} from "./TxcFeed";
import {TransXChange} from "../transxchange/TransXChange";
import {ATCOCode, NaPTANIndex, StopLocationIndex} from "../reference/NaPTAN";
import {StopAreaIndex} from "../reference/StopAreas";

/**
 * Calculate transfers between stops
 *
 * **Between places, not between stops.** Where a stop stands under a station -
 * the two sides of a street, grouped by `StopAreas` - the station is what a
 * passenger walks to and from, so it is the station the transfer names. Left as
 * stops, a pair twenty metres apart gets a footpath between them saying you can
 * walk from a place to itself, and every stop of one place gets its own footpath
 * to every stop of the next.
 */
export class TransfersStream extends RowStream<TransXChange, TransferRow> {
  public readonly file = TRANSFERS;

  private readonly stopsSeen: Record<ATCOCode, boolean> = {};
  private readonly placesSeen: Record<string, boolean> = {};
  private readonly pairsSeen: Set<string> = new Set();

  constructor(
    private readonly naptan: NaPTANIndex,
    private readonly naptanByLocation: StopLocationIndex,
    private readonly areas: StopAreaIndex = {}
  ) {
    super();
  }

  /**
   * Add a transfer from each place to itself (as interchange time) then find any nearby places and calculate the time
   * required to walk to them.
   */
  protected transform(data: TransXChange): void {
    for (const stop of data.StopPoints) {
      if (!this.stopsSeen[stop.StopPointRef]) {
        const place = this.placeOf(stop.StopPointRef);

        if (!this.placesSeen[place]) {
          this.pushTransfer(place, place, 180);
          this.placesSeen[place] = true;
        }

        if (this.naptan[stop.StopPointRef]) {
          this.addNearbyStops(stop.StopPointRef);
        }

        this.stopsSeen[stop.StopPointRef] = true;
      }
    }
  }

  /**
   * The station a stop stands in, or the stop itself where it stands alone.
   */
  private placeOf(stop: ATCOCode): string {
    return this.areas[stop]?.id ?? stop;
  }

  /**
   * Search any stops we've seen to see if we can walk there
   */
  private addNearbyStops(stop: ATCOCode): void {
    const here = this.naptan[stop];
    const from = this.placeOf(stop);
    const fromAt = this.positionOf(stop);
    const aLon = Number(here.longitude);
    const aLat = Number(here.latitude);
    const key = here.parentLocality || here.locality;

    for (const j of this.naptanByLocation[key] ?? []) {
      const other = this.naptan[j];
      const to = this.placeOf(j);

      if (other && this.stopsSeen[j] && to !== from) {
        const distance = this.getDistance(aLon, aLat, Number(other.longitude), Number(other.latitude));

        if (distance < 0.01) {
          const toAt = this.positionOf(j);
          const between = this.getDistance(fromAt[0], fromAt[1], toAt[0], toAt[1]);
          const time = Math.max(60, Math.round((between / 0.0005) * 120));

          this.pushWalk(from, to, time);
          this.pushWalk(to, from, time);
        }
      }
    }
  }

  /**
   * Where a place stands: the station's own position, or the stop's where it
   * stands alone.
   *
   * **The walk is measured between the places, not between whichever two of
   * their stops happened to be compared first.** Two stops of one place and two
   * of another offer four measurements and the feed carries one row; taken from
   * the first pair reached, that row was whatever the order of the documents and
   * of the NaPTAN file made it. On the national feed 34% of the walks were
   * longer than the nearest pair of their stops, by 127 seconds on average and
   * by seventeen minutes at worst - which is a planner told that two sides of a
   * junction are a quarter of an hour apart. Measuring the places instead gives
   * one answer per pair by construction, whatever order they arrive in.
   */
  private positionOf(stop: ATCOCode): [number, number] {
    const place = this.areas[stop] ?? this.naptan[stop];

    return [Number(place.longitude), Number(place.latitude)];
  }

  /**
   * Two stops of one place and two of another are one walk, not four.
   */
  private pushWalk(from: string, to: string, seconds: number): void {
    const pair = from + ">" + to;

    if (!this.pairsSeen.has(pair)) {
      this.pairsSeen.add(pair);
      this.pushTransfer(from, to, seconds);
    }
  }

  private pushTransfer(from: string, to: string, seconds: number): void {
    this.pushRow({
      from_stop_id: from,
      to_stop_id: to,
      transfer_type: TransferType.MinTime,
      min_transfer_time: seconds
    });
  }

  /**
   * Note this method of calculating distances between stations is flawed and only used as a rough guide.
   */
  private getDistance(aLon: number, aLat: number, bLon: number, bLat: number) {
    return Math.abs(bLat - aLat) + Math.abs(bLon - aLon);
  }
}
