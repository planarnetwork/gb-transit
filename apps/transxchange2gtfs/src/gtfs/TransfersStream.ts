import {TransferRow, TransferType} from "@gb-transit/gtfs-schema";
import {RowStream} from "./RowStream";
import {TRANSFERS} from "./TxcFeed";
import {TransXChange} from "../transxchange/TransXChange";
import {ATCOCode, NaPTANIndex, StopLocationIndex} from "../reference/NaPTAN";
import {StopAreaIndex} from "../reference/StopAreas";

/** How far apart two places can be and still be worth walking between. */
const WALKABLE_DEGREES = 0.01;

/** Seconds to interchange within one place. */
const INTERCHANGE_SECONDS = 180;

/** Roughly 0.0005 degrees every two minutes, and never less than a minute. */
function walkSeconds(distance: number): number {
  return Math.max(60, Math.round((distance / 0.0005) * 120));
}

/**
 * The walks between the places a feed calls at.
 *
 * **A place, not a stop.** Where `StopAreas` has put a stop under a station -
 * the two sides of a street - the station is what a passenger walks to and from,
 * so it is the station a transfer names and the station's own position that the
 * walk is measured from. Measured stop to stop instead, one place would have a
 * footpath to itself and each of its stops a separate footpath to each stop of
 * the next place, all of different lengths.
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
   * Give each place an interchange time with itself, and a walk to every place
   * near it that the feed has already reached.
   */
  protected transform(data: TransXChange): void {
    for (const stop of data.StopPoints) {
      if (this.stopsSeen[stop.StopPointRef]) {
        continue;
      }

      const place = this.placeOf(stop.StopPointRef);

      if (!this.placesSeen[place]) {
        this.pushTransfer(place, place, INTERCHANGE_SECONDS);
        this.placesSeen[place] = true;
      }

      if (this.naptan[stop.StopPointRef]) {
        this.addNearbyStops(stop.StopPointRef);
      }

      this.stopsSeen[stop.StopPointRef] = true;
    }
  }

  /** The station a stop stands in, or the stop itself where it stands alone. */
  private placeOf(stop: ATCOCode): string {
    return this.areas[stop]?.id ?? stop;
  }

  /** Where that place stands. */
  private positionOf(stop: ATCOCode): [number, number] {
    const place = this.areas[stop] ?? this.naptan[stop];

    return [Number(place.longitude), Number(place.latitude)];
  }

  /**
   * Neighbours are looked for stop by stop, because that is what NaPTAN indexes;
   * the walk itself is between the places they belong to.
   */
  private addNearbyStops(stop: ATCOCode): void {
    const here = this.naptan[stop];
    const from = this.placeOf(stop);
    const [fromLon, fromLat] = this.positionOf(stop);
    const locality = here.parentLocality || here.locality;

    for (const neighbour of this.naptanByLocation[locality] ?? []) {
      const other = this.naptan[neighbour];
      const to = this.placeOf(neighbour);

      if (!other || !this.stopsSeen[neighbour] || to === from) {
        continue;
      }

      const apart = this.getDistance(
        Number(here.longitude), Number(here.latitude),
        Number(other.longitude), Number(other.latitude)
      );

      if (apart < WALKABLE_DEGREES) {
        const [toLon, toLat] = this.positionOf(neighbour);
        const seconds = walkSeconds(this.getDistance(fromLon, fromLat, toLon, toLat));

        this.pushWalk(from, to, seconds);
        this.pushWalk(to, from, seconds);
      }
    }
  }

  /** Two stops of one place and two of another are one walk, not four. */
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
