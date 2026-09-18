import {StopRow} from "@gb-transit/gtfs-schema";
import {RowStream} from "./RowStream";
import {STOPS} from "./TxcFeed";
import {TransXChange, StopPoint} from "../transxchange/TransXChange";
import {ATCOCode, NaPTANIndex, NaptanStopPoint} from "../reference/NaPTAN";
import {NaptanStopArea, StopAreaIndex} from "../reference/StopAreas";

/**
 * A stand, where the indicator names one.
 *
 * NaPTAN's indicator is whatever distinguishes a stop from the others of its
 * name, which is a stand at a bus station - "Stand C", "Bay 4" - but far more
 * often a relative position: `adj`, `opp`, `o/s`, or a compass bearing. Only the
 * first of those is a platform, and the DfT's own feed reads it the same way,
 * giving 2,975 of its 311,949 stops a platform_code and every one of them a
 * letter or a number.
 *
 * A bare `N` is the awkward one: it is a stand at a bus station and a bearing on
 * a street, and nothing in the indicator itself separates them. The stop's own
 * bearing does - a stop whose indicator is its bearing is being told apart from
 * its pair by which way it faces, not by a stand. 10 of the 4,082 single-letter
 * indicators in NaPTAN are that.
 */
function platformCode(stop: NaptanStopPoint): string | null {
  const named = stop.indicator.match(/^(?:stop|stand|bay|gate|platform)\s+([A-Za-z0-9]{1,3})$/i);

  if (named) {
    return named[1].toUpperCase();
  }

  if (stop.indicator.toUpperCase() === stop.bearing.toUpperCase()) {
    return null;
  }

  return /^(?:\d{1,3}|[A-Za-z])$/.test(stop.indicator) ? stop.indicator.toUpperCase() : null;
}

export class StopsStream extends RowStream<TransXChange, StopRow> {
  public readonly file = STOPS;

  private static readonly STREET_BLACKLIST = ["Road", "Street", "Lane", "Avenue"];
  private readonly seenStops: Record<ATCOCode, boolean> = {};
  private readonly seenAreas: Record<string, boolean> = {};

  constructor(
    private readonly naptan: NaPTANIndex,
    private readonly areas: StopAreaIndex = {}
  ) {
    super();
  }

  protected transform(data: TransXChange): void {
    for (const stop of data.StopPoints) {
      if (!this.seenStops[stop.StopPointRef]) {
        const area = this.areas[stop.StopPointRef];

        // Before its stops, so that a reader taking the file in order has the
        // station in hand by the time something points at it.
        if (area !== undefined && !this.seenAreas[area.id]) {
          this.pushRow(this.getAreaStop(area));
          this.seenAreas[area.id] = true;
        }

        this.pushRow(this.getStop(stop, area));
        this.seenStops[stop.StopPointRef] = true;
      }
    }
  }

  private getStop(stop: StopPoint, area: NaptanStopArea | undefined): StopRow {
    const known = this.naptan[stop.StopPointRef];

    return known ? this.getNaPTANStop(known, area) : this.getFeedStop(stop);
  }

  private getNaPTANStop(stop: NaptanStopPoint, area: NaptanStopArea | undefined): StopRow {
    const specificStreet = this.shouldAddStreet(stop.name, stop.street) ? ", " + stop.street : "";
    const specificLocation = stop.indicator !== "" ? " (" + stop.indicator.replace("->", "") + ")" : "";
    const city = stop.parentLocality || stop.locality;

    return {
      stop_id: stop.atcoCode,
      stop_code: stop.naptanCode,
      stop_name: stop.name + specificLocation + specificStreet + ", " + city,
      stop_desc: stop.name,
      stop_lat: stop.latitude,
      stop_lon: stop.longitude,
      zone_id: "",
      stop_url: "",
      location_type: null,
      parent_station: area?.id ?? "",
      platform_code: platformCode(stop),
      stop_timezone: "",
      wheelchair_boarding: 0
    };
  }

  /**
   * The place a group of stops stand in, as a station of its own.
   */
  private getAreaStop(area: NaptanStopArea): StopRow {
    return {
      stop_id: area.id,
      stop_code: "",
      stop_name: area.name,
      stop_desc: "",
      stop_lat: area.latitude,
      stop_lon: area.longitude,
      zone_id: "",
      stop_url: "",
      location_type: 1,
      parent_station: "",
      platform_code: null,
      stop_timezone: "",
      wheelchair_boarding: 0
    };
  }

  /**
   * A stop the document describes and NaPTAN does not.
   *
   * A TransXChange `AnnotatedStopPointRef` need not carry a location, and the
   * parser reads an absent one as 0.0. Written out that puts the stop in the
   * Atlantic, several hundred miles from anything, which a planner will happily
   * route around; an empty coordinate says what is actually true, which is that
   * the feed does not know where this stop is. The national conversion has 400
   * of them.
   */
  private getFeedStop(stop: StopPoint): StopRow {
    const located = stop.Location.Latitude !== 0 || stop.Location.Longitude !== 0;

    return {
      stop_id: stop.StopPointRef,
      stop_code: "",
      stop_name: stop.CommonName + ", " + stop.LocalityQualifier,
      stop_desc: "",
      stop_lat: located ? stop.Location.Latitude : "",
      stop_lon: located ? stop.Location.Longitude : "",
      zone_id: "",
      stop_url: "",
      location_type: null,
      parent_station: "",
      platform_code: null,
      stop_timezone: "",
      wheelchair_boarding: 0
    };
  }

  /**
   * If the name is not the same as the street name and does not contain any words like Road or Street we can safely
   * add the street name to the name.
   */
  private shouldAddStreet(name: string, street: string): boolean {
    return street.length > 1
      && name !== street
      && street !== "---"
      && StopsStream.STREET_BLACKLIST.every(i => !name.includes(i));
  }
}
