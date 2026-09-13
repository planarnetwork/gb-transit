import type { AgencyIndex, Area, AreaIndex, CalendarIndex, DateIndex, DayOfWeek, Interchange, RouteIndex, ShapeIndex, ShapePoint, StopIndex, TransfersByOrigin, Trip, TripLink } from "./GTFS.js";
import type { EntityType } from "./EntityType.js";
import type { Row } from "./CSVParser.js";
import type { FeedInfo, GTFSFeed } from "./GTFSLoader.js";
import { TimeParser } from "./TimeParser.js";
import { Service } from "./Service.js";
import { linkShapes } from "./LinkedTrips.js";

/** Runs on no day of the week, for a service whose only dates are its exceptions */
const NO_DAYS: Record<DayOfWeek, boolean> = {
  0: false, 1: false, 2: false, 3: false, 4: false, 5: false, 6: false
};

/**
 * Assembles a feed from the rows of its files, whatever delivered them.
 *
 * Rows are taken one at a time and in the order the file gives them, because the order of a trip's
 * stop times is the order of its calls. Nothing is resolved to stations here; the feed is kept in
 * its own terms and normalised when the timetable is built.
 */
export class FeedBuilder {

  private readonly timeParser = new TimeParser();
  private readonly trips: Trip[] = [];
  private readonly transfers: TransfersByOrigin = {};
  private readonly links: TripLink[] = [];
  private readonly interchange: Interchange = {};
  private readonly calendars: CalendarIndex = {};
  private readonly dates: Record<string, DateIndex> = {};
  private readonly stops: StopIndex = {};
  private readonly routes: RouteIndex = {};
  private readonly agencies: AgencyIndex = {};
  private readonly areas: AreaIndex = {};
  // Points as they arrive, with the sequence kept alongside so build() can order them. GTFS does
  // not require shapes.txt to be sorted, and a rail feed's is only sorted because the producer
  // chose to.
  private readonly shapePoints = new Map<string, {sequence: number, point: ShapePoint}[]>();
  /**
   * Keyed by trip rather than stored on the trip, because stop_times.txt may arrive before
   * trips.txt. A Map rather than an object: a feed has hundreds of thousands of trips, and an
   * object that large goes into dictionary mode and internalises every id used as a key.
   */
  private readonly stopTimes = new Map<string, Trip["stopTimes"]>();
  /** One string per distinct id, see intern */
  private readonly pool = new Map<string, string>();
  private feedInfo: FeedInfo | undefined;

  /**
   * Take a row of one of the feed's files.
   */
  public add(type: EntityType, row: Row): void {
    switch (type) {
      case "transfer": this.addTransfer(row); break;
      case "calendar": this.addCalendar(row); break;
      case "calendar_date": this.addCalendarDate(row); break;
      case "trip": this.addTrip(row); break;
      case "stop_time": this.addStopTime(row); break;
      case "feed_info": this.addFeedInfo(row); break;
      case "stop": this.addStop(row); break;
      case "route": this.addRoute(row); break;
      case "agency": this.addAgency(row); break;
      case "area": this.addArea(row); break;
      case "shape": this.addShapePoint(row); break;
      case "stop_area": this.addStopArea(row); break;
    }
  }

  /**
   * Give every trip its calendar and its stop times, and return the feed.
   */
  public build(): GTFSFeed {
    const services: Record<string, Service> = {};

    for (const c of Object.values(this.calendars)) {
      services[c.serviceId] = new Service(c.startDate, c.endDate, c.days, this.dates[c.serviceId] || {});
    }

    // A feed may leave calendar.txt out altogether and say when everything runs in calendar_dates,
    // which is both legal and common. Those services have no row to build from, so they are built
    // from their dates: no days of the week, and a range nothing falls inside, which leaves the
    // dates themselves as the only thing that can make runsOn true.
    for (const serviceId of Object.keys(this.dates)) {
      services[serviceId] ??= new Service(0, 0, NO_DAYS, this.dates[serviceId]);
    }

    for (const t of this.trips) {
      t.stopTimes = this.stopTimes.get(t.tripId) || [];
      t.service = services[t.serviceId];
    }

    const shapes = this.shapes();

    // the trips a coupling makes are only made when the timetable is, but their shapes are made
    // here, so that every shape a trip names is in the feed however it is read
    Object.assign(shapes, linkShapes(this.trips, this.links, shapes, this.stops));

    return {
      trips: this.trips,
      transfers: this.transfers,
      links: this.links,
      interchange: this.interchange,
      stops: this.stops,
      routes: this.routes,
      agencies: this.agencies,
      areas: this.areas,
      shapes,
      feedInfo: this.feedInfo
    };
  }

  /**
   * Each line in sequence order, with the sequence numbers dropped once they have done their job.
   */
  private shapes(): ShapeIndex {
    const shapes: ShapeIndex = {};

    for (const [id, points] of this.shapePoints) {
      shapes[id] = points
        .sort((a, b) => a.sequence - b.sequence)
        .map(({point}) => point);
    }

    return shapes;
  }

  /**
   * The one string for an id, so that the millions of rows naming a few thousand stops between
   * them share a few thousand strings.
   *
   * The copy is not idle. A field is a slice of the chunk it was decoded from, and a slice keeps
   * the whole of that chunk alive, so pooling the slice as it comes would pin every chunk that
   * happened to introduce an id: for a 200MB stop_times.txt, all of it. Copying the characters out
   * frees the chunk. Prefixing and re-slicing is the cheapest way to make the engine do that.
   */
  private intern(value: string): string {
    const existing = this.pool.get(value);

    if (existing !== undefined) {
      return existing;
    }

    const copy = ` ${value}`.slice(1);

    this.pool.set(copy, copy);

    return copy;
  }

  private addTransfer(row: Row): void {
    // 3 forbids a change and 5 requires re-boarding, which is what happens with no row at all
    if (row.transfer_type === "3" || row.transfer_type === "5") {
      return;
    }

    if (row.transfer_type === "4") {
      this.addLink(row);
    }
    else {
      // min_transfer_time is optional for transfer types 0 and 1, where it means the change is
      // possible with no minimum. Reading an absent one as NaN would put that NaN into a footpath's
      // duration or a station's interchange time, and it would travel from there into every journey
      // planned through the stop.
      this.footpath(
        row,
        row.min_transfer_time === undefined ? 0 : this.duration(row.min_transfer_time),
        row.start_time ? this.timeParser.getTime(row.start_time) : 0,
        row.end_time ? this.timeParser.getTime(row.end_time) : Number.MAX_SAFE_INTEGER
      );
    }
  }

  private addLink(row: Row): void {
    if (row.from_trip_id && row.to_trip_id) {
      this.links.push({
        fromTripId: this.intern(row.from_trip_id),
        toTripId: this.intern(row.to_trip_id),
        fromStop: row.from_stop_id === undefined ? undefined : this.intern(row.from_stop_id),
        toStop: row.to_stop_id === undefined ? undefined : this.intern(row.to_stop_id)
      });
    }
  }

  /**
   * A footpath from a stop back to itself is not a walk between places, it is how long changing
   * vehicles there takes.
   */
  /**
   * A transfer's minimum time in seconds, refusing one that is not a number.
   *
   * The same call the times make: a feed that says something unreadable is told so, rather than
   * carrying a NaN into journeys planned months later.
   */
  private duration(value: string): number {
    const seconds = +value;

    if (Number.isNaN(seconds)) {
      throw new Error(`Unable to read the transfer time: ${value}`);
    }

    return seconds;
  }

  private footpath(row: Row, duration: number, startTime: number, endTime: number): void {
    const origin = this.intern(row.from_stop_id as string);
    const destination = this.intern(row.to_stop_id as string);

    if (origin === destination) {
      this.interchange[origin] = duration;
    }
    else {
      const transfers = this.transfers[origin] ?? [];
      const mode = row.mode === undefined ? undefined : this.intern(row.mode);

      transfers.push({ origin, destination, duration, startTime, endTime, mode });
      this.transfers[origin] = transfers;
    }
  }

  private addCalendar(row: Row): void {
    this.calendars[row.service_id as string] = {
      serviceId: row.service_id as string,
      startDate: +(row.start_date as string),
      endDate: +(row.end_date as string),
      days: {
        0: row.sunday === "1",
        1: row.monday === "1",
        2: row.tuesday === "1",
        3: row.wednesday === "1",
        4: row.thursday === "1",
        5: row.friday === "1",
        6: row.saturday === "1"
      },
      include: {},
      exclude: {}
    };
  }

  private addCalendarDate(row: Row): void {
    const serviceId = row.service_id as string;
    const dates = this.dates[serviceId] ?? {};

    // Number, not the string the feed gave: a DateIndex is keyed by DateNumber and Service.runsOn
    // looks it up with one. It worked before only because JavaScript coerces the key either way.
    dates[Number(row.date)] = row.exception_type === "1";
    this.dates[serviceId] = dates;
  }

  private addTrip(row: Row): void {
    this.trips.push({
      serviceId: this.intern(row.service_id as string),
      tripId: this.intern(row.trip_id as string),
      stopTimes: [],
      service: {} as Service,
      routeId: row.route_id === undefined ? undefined : this.intern(row.route_id),
      shortName: row.trip_short_name === undefined ? undefined : this.intern(row.trip_short_name),
      headsign: row.trip_headsign === undefined ? undefined : this.intern(row.trip_headsign),
      // Interned like the other ids: a few thousand shapes name themselves across every trip in
      // the feed, and a rail feed has one id for every eighteen trips.
      shapeId: row.shape_id === undefined || row.shape_id === "" ? undefined : this.intern(row.shape_id)
    });
  }

  /**
   * One point of one line.
   *
   * Every field is checked, unlike the rows above, because all four of them are load bearing and
   * none of them is recoverable. A missing sequence is the worst: `+undefined` is NaN, NaN compares
   * false against everything, and a comparator that returns NaN leaves the sort unspecified - so
   * the line comes out as the scribble the sort exists to prevent, with nothing said. Dropping the
   * point loses one corner; keeping it loses the shape.
   */
  private addShapePoint(row: Row): void {
    const sequence = Number(row.shape_pt_sequence);
    const latitude = Number(row.shape_pt_lat);
    const longitude = Number(row.shape_pt_lon);

    if (row.shape_id === undefined || row.shape_id === ""
      || !Number.isFinite(sequence) || !Number.isFinite(latitude) || !Number.isFinite(longitude)) {
      return;
    }

    const id = this.intern(row.shape_id);
    const entry = {sequence, point: {latitude, longitude}};
    const points = this.shapePoints.get(id);

    if (points === undefined) {
      this.shapePoints.set(id, [entry]);
    }
    else {
      points.push(entry);
    }
  }

  private addStopTime(row: Row): void {
    const tripId = this.intern(row.trip_id as string);
    const stopTime = {
      stop: this.intern(row.stop_id as string),
      departureTime: this.timeParser.getTime(row.departure_time as string),
      arrivalTime: this.timeParser.getTime(row.arrival_time as string),
      // a feed leaves these empty for an ordinary call, so anything but an explicit code allows it
      pickUp: row.pickup_type === "0" || row.pickup_type === undefined,
      dropOff: row.drop_off_type === "0" || row.drop_off_type === undefined
    };

    const stopTimes = this.stopTimes.get(tripId);

    if (stopTimes === undefined) {
      this.stopTimes.set(tripId, [stopTime]);
    }
    else {
      stopTimes.push(stopTime);
    }
  }

  private addFeedInfo(row: Row): void {
    this.feedInfo = {
      startDate: row.feed_start_date ? +row.feed_start_date : undefined,
      endDate: row.feed_end_date ? +row.feed_end_date : undefined,
      version: row.feed_version
    };
  }

  private addStop(row: Row): void {
    const id = this.intern(row.stop_id as string);

    this.stops[id] = {
      id,
      code: row.stop_code,
      name: row.stop_name,
      description: row.stop_desc,
      latitude: +(row.stop_lat as string),
      longitude: +(row.stop_lon as string),
      timezone: row.stop_timezone,
      locationType: +(row.location_type ?? 0),
      parentStation: row.parent_station === undefined ? undefined : this.intern(row.parent_station),
      platformCode: row.platform_code
    };
  }

  private addRoute(row: Row): void {
    const id = this.intern(row.route_id as string);

    this.routes[id] = {
      id,
      agencyId: row.agency_id === undefined ? undefined : this.intern(row.agency_id),
      shortName: row.route_short_name,
      longName: row.route_long_name,
      type: +(row.route_type as string),
      color: row.route_color,
      textColor: row.route_text_color,
      url: row.route_url,
      description: row.route_desc
    };
  }

  private addAgency(row: Row): void {
    const id = this.intern(row.agency_id as string);

    this.agencies[id] = {
      id,
      name: row.agency_name,
      url: row.agency_url,
      timezone: row.agency_timezone,
      lang: row.agency_lang,
      phone: row.agency_phone,
      fareUrl: row.agency_fare_url
    };
  }

  /**
   * Either file may arrive first - the GB feed writes stop_areas.txt ahead of areas.txt - so both
   * sides fill in an entry the other may already have made rather than replacing it.
   */
  private addArea(row: Row): void {
    this.area(row.area_id as string).name = row.area_name;
  }

  private addStopArea(row: Row): void {
    this.area(row.area_id as string).stops.push(this.intern(row.stop_id as string));
  }

  private area(areaId: string): Area {
    const id = this.intern(areaId);
    const existing = this.areas[id];

    if (existing !== undefined) {
      return existing;
    }

    return this.areas[id] = { id, stops: [] };
  }

}
