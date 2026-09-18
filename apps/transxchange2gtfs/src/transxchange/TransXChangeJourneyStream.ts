import {
  DaysOfWeek,
  Holiday,
  OperatingProfile,
  RouteLinks,
  Service, StopActivity,
  JPTimingLink,
  TransXChange, VehicleJourney,
  VJTimingLink,
  JPJourneyStop,
  VJJourneyStop,
  TimingStatus,
  RouteLink
} from "./TransXChange";
import {Transform, TransformCallback} from "node:stream";
import {LocalDate, LocalTime, Duration, DateTimeFormatter} from "@js-joda/core";
import {ATCOCode} from "../reference/NaPTAN";
import {Skipped} from "../converter/Skipped";

/**
 * The span of days a feed is built for.
 */
export interface DateWindow {
  readonly from: LocalDate;
  readonly to: LocalDate;
}

/** A calendar before it is known to be a new one and given a service id. */
type UnnumberedCalendar = Omit<JourneyCalendar, "id">;

function maxDate(a: LocalDate, b: LocalDate): LocalDate {
  return a.isAfter(b) ? a : b;
}

function minDate(a: LocalDate, b: LocalDate): LocalDate {
  return a.isBefore(b) ? a : b;
}

function sortedDates(of: LocalDate[]): string {
  return of.map(date => date.toString()).sort().join();
}

/**
 * Transforms TransXChange objects into TransXChangeJourneys that are closer to GTFS calendars, calendar dates, trips
 * and stop times.
 */
export class TransXChangeJourneyStream extends Transform implements Skipped {
  private calendars: Record<string, JourneyCalendar | null> = {};
  private serviceId: number = 1;
  private tripId: number = 1;

  /** Journeys dropped for running on no day inside the window. */
  public skipped = 0;

  public readonly skippedDescription = "Journeys that run on no day the feed covers";

  constructor(
    private readonly holidays: BankHolidays,
    private readonly window?: DateWindow
  ) {
    super({ objectMode: true });
  }

  /**
   * Generate a journey
   */
  public _transform(schedule: TransXChange, encoding: string, callback: TransformCallback): void {

    for (const vehicle of schedule.VehicleJourneys) {
      try {
        this.processVehicle(schedule, vehicle);
      } catch (err) {
        console.log(err);
      }
    }

    callback();
  }

  private mergeJourneyStop(jp: JPJourneyStop, vj?: VJJourneyStop): JPJourneyStop {
    // Inheritance
    if (!vj) {
      return jp;
    }

    return {
      Activity: vj.Activity ?? jp.Activity,
      StopPointRef: jp.StopPointRef,
      TimingStatus: jp.TimingStatus,
      WaitTime: vj.WaitTime ?? jp.WaitTime,
      DynamicDestinationDisplay: jp.DynamicDestinationDisplay
    };
  }

  private mergeTimingLinks(jp: JPTimingLink, vj: VJTimingLink): JPTimingLink {
    // Inheritance
    return {
      From: this.mergeJourneyStop(jp.From, vj.From),
      To: this.mergeJourneyStop(jp.To, vj.To),
      RunTime: vj.RunTime ?? jp.RunTime,
      RouteLinkRef: jp.RouteLinkRef
    };
  }


  private processVehicle(schedule: TransXChange, vehicle: VehicleJourney) {
    const service = schedule.Services[vehicle.ServiceRef];
    const journeyPattern = service.StandardService[vehicle.JourneyPatternRef];

    if (!journeyPattern) {
      console.log(`Warning: missing ${vehicle.JourneyPatternRef} on ${vehicle.ServiceRef}`);
      return;
    }

    const headsign = journeyPattern.DestinationDisplay || service.ServiceDestination;

    // Preserve the original order of the timing links from the journey pattern
    const sections = journeyPattern.Sections.flatMap(s => schedule.JourneySections[s] || []);

    if (vehicle.TimingLinks) {
      // TODO: Time complexity?
      for (const tl of vehicle.TimingLinks) {
        const jp = schedule.JPTimingLinks[tl.JPTimingLinkRef];

        // Find and merge
        const sectionIndex = sections.findIndex(s => s.RouteLinkRef === jp.RouteLinkRef);
        if (sectionIndex !== -1) {
          sections[sectionIndex] = this.mergeTimingLinks(sections[sectionIndex], tl);
        }
      }
    }

    if (sections.length > 0 && vehicle.OperatingProfile) {
      const calendar = this.getCalendar(vehicle.OperatingProfile, schedule.Services[vehicle.ServiceRef]);

      if (calendar === undefined) {
        this.skipped++;
        return;
      }

      const stops = this.getStopTimes(schedule.RouteLinks, sections, vehicle.DepartureTime, headsign);
      const route = vehicle.ServiceRef + '|' + vehicle.LineRef;
      const blockId = vehicle.OperationalBlockNumber;
      const routeLinkIds = sections.map(tl => tl.RouteLinkRef);
      const routeLinks = routeLinkIds.map(rl => schedule.RouteLinks[rl]);
      const trip = {
        id: this.tripId++,
        shortName: journeyPattern.Direction === "outbound"
          ? service.ServiceDestination || service.Description
          : service.ServiceOrigin || service.Description,
        direction: journeyPattern.Direction,
        headsign
      };

      this.push({calendar, stops, trip, route, blockId, routeLinkIds, routeLinks} as TransXChangeJourney);
    }
  }

  private getCalendar(operatingProfile: OperatingProfile, service: Service): JourneyCalendar | undefined {
    const days: DaysOfWeek = operatingProfile.RegularDayType === "HolidaysOnly"
      ? [0, 0, 0, 0, 0, 0, 0]
      : this.mergeDays(operatingProfile.RegularDayType);

    let startDate = service.OperatingPeriod.StartDate;
    let endDate = service.OperatingPeriod.EndDate;
    const excludes = [];
    const includes = [];

    for (const dates of operatingProfile.SpecialDaysOperation.DaysOfNonOperation) {
      // if the start date of the non-operation is on or before the start of the service date, change the calendar start date
      if (!dates.StartDate.isAfter(startDate)) {
        startDate = dates.EndDate.plusDays(1);
      }
      // if the end date of the non-operation is on or after the end of the service date, change the calendar end date
      else if (!dates.EndDate.isBefore(endDate) || dates.EndDate.year() >= 2037) {
        endDate = dates.StartDate.minusDays(1);
      }
      else if (dates.EndDate.toEpochDay() - dates.StartDate.toEpochDay() < 92) {
        excludes.push(...this.dateRange(dates.StartDate, dates.EndDate, days));
      }
      else {
        console.log("Warning: Ignored extra long break in service", dates, JSON.stringify(service));
      }
    }

    for (const holiday of operatingProfile.BankHolidayOperation.DaysOfNonOperation) {
      excludes.push(...this.getHoliday(holiday, startDate, endDate));
    }

    for (const holiday of operatingProfile.BankHolidayOperation.DaysOfOperation) {
      includes.push(...this.getHoliday(holiday, startDate, endDate));
    }

    // Clamped before it is compared, because clamping is what makes two
    // registrations coincide: one running from 2018 and one from 2020 describe
    // the same calendar inside a window that starts after both.
    const clamped = this.clamp({days, startDate, endDate, includes, excludes});
    const hash = this.getCalendarHash(
      clamped.days, clamped.startDate, clamped.endDate, clamped.includes, clamped.excludes
    );

    if (this.calendars[hash] === undefined) {
      // A journey is dropped for running on no day the feed covers, so with no
      // window there is nothing to fall outside of.
      const keep = this.window === undefined || this.runs(clamped);

      this.calendars[hash] = keep ? {...clamped, id: this.serviceId++} : null;
    }

    return this.calendars[hash] ?? undefined;
  }

  /**
   * The calendar as it applies inside the window.
   *
   * A registration says when it began and when it ends, and neither is a
   * statement about the feed: they run from as far back as 2001 to as far out as
   * 2099.
   */
  private clamp(calendar: UnnumberedCalendar): UnnumberedCalendar {
    if (this.window === undefined) {
      return calendar;
    }

    const startDate = maxDate(calendar.startDate, this.window.from);
    const endDate = minDate(calendar.endDate, this.window.to);
    const inWindow = (date: LocalDate) =>
      !date.isBefore(this.window!.from) && !date.isAfter(this.window!.to);

    return {
      ...calendar,
      startDate,
      endDate,
      includes: calendar.includes.filter(inWindow),
      excludes: calendar.excludes.filter(inWindow)
    };
  }

  /**
   * Whether a calendar has a day at all.
   *
   * Walks the days, so it is asked once per distinct calendar rather than once
   * per journey - a national dataset is a million journeys behind a few thousand
   * calendars.
   */
  private runs(calendar: UnnumberedCalendar): boolean {
    if (calendar.includes.length > 0) {
      return true;
    }

    if (calendar.days.every(day => !day) || calendar.startDate.isAfter(calendar.endDate)) {
      return false;
    }

    const excluded = new Set(calendar.excludes.map(date => date.toString()));

    for (let date = calendar.startDate; !date.isAfter(calendar.endDate); date = date.plusDays(1)) {
      if (calendar.days[date.dayOfWeek().value() - 1] && !excluded.has(date.toString())) {
        return true;
      }
    }

    return false;
  }

  private mergeDays(daysOfOperation: DaysOfWeek[]): DaysOfWeek {
    return daysOfOperation.reduce(
      (result, days) => result.map((day, index) => day || days[index]) as DaysOfWeek,
      [0, 0, 0, 0, 0, 0, 0]
    );
  }

  private dateRange(from: LocalDate, to: LocalDate, days: DaysOfWeek, dates: LocalDate[] = []): LocalDate[] {
    if (from.isAfter(to)) {
      return dates;
    }
    else if (days[from.dayOfWeek().value() - 1]) {
      return this.dateRange(from.plusDays(1), to, days, [...dates, from]);
    }
    else {
      return this.dateRange(from.plusDays(1), to, days, dates);
    }
  }

  private getHoliday(holiday: Holiday, startDate: LocalDate, endDate: LocalDate): LocalDate[] {
    return (this.holidays[holiday] || []).filter(date => !date.isBefore(startDate) && !date.isAfter(endDate));
  }

  private getCalendarHash(days: DaysOfWeek,
                          startDate: LocalDate,
                          endDate: LocalDate,
                          includes: LocalDate[],
                          excludes: LocalDate[]): string {
    // Sorted, because the dates are collected in the order the operating profile
    // happens to list its holidays and special days, and two calendars that run
    // on the same days are the same calendar whatever order they were written
    // down in.
    return [
      days.toString(),
      startDate.toString(),
      endDate.toString(),
      sortedDates(includes),
      sortedDates(excludes)
    ].join("_");
  }

  private getStopTimes(routeLinksById: RouteLinks, links: JPTimingLink[], departureTime: LocalTime, defaultHeadsign: string): StopTime[] {
    // Don't include the headsign in every stop time if it's the same as the default
    const excludeIfDefault = (headsign?: string) => headsign === defaultHeadsign ? undefined : headsign;

    const stops: StopTime[] = [{
      stop: links[0].From.StopPointRef,
      arrivalTime: departureTime.format(DateTimeFormatter.ofPattern("HH:mm:ss")),
      departureTime: departureTime.format(DateTimeFormatter.ofPattern("HH:mm:ss")),
      headsign: excludeIfDefault(links[0].From.DynamicDestinationDisplay),
      pickup: true,
      dropoff: false,
      exactTime: links[0].From.TimingStatus === TimingStatus.PrincipalTimingPoint,
      shapeDistTraveled: 0
    }];

    let lastDepartureTime = Duration.between(LocalTime.parse("00:00"), departureTime);
    let distanceSoFarM = 0;

    for (const link of links) {
      if (link.From.WaitTime) {
        lastDepartureTime = lastDepartureTime.plusDuration(link.From.WaitTime);
        stops[stops.length - 1].departureTime = this.getTime(lastDepartureTime);
      }

      const arrivalTime = lastDepartureTime.plusDuration(link.RunTime);
      lastDepartureTime = link.To.WaitTime ? arrivalTime.plusDuration(link.To.WaitTime) : arrivalTime;

      const routeLink = routeLinksById[link.RouteLinkRef];
      distanceSoFarM += routeLink.Distance;

      stops.push({
        stop: link.To.StopPointRef,
        arrivalTime: this.getTime(arrivalTime),
        departureTime: this.getTime(lastDepartureTime),
        headsign: excludeIfDefault(link.To.DynamicDestinationDisplay),
        pickup: link.To.Activity === StopActivity.PickUp || link.To.Activity === StopActivity.PickUpAndSetDown,
        dropoff: link.To.Activity === StopActivity.SetDown || link.To.Activity === StopActivity.PickUpAndSetDown,
        exactTime: link.To.TimingStatus === TimingStatus.PrincipalTimingPoint,
        shapeDistTraveled: distanceSoFarM / 1000
      });
    }

    return stops;
  }

  private getTime(time: Duration): string {
    const hour = time.toHours().toString().padStart(2, "0");
    const minute = (time.toMinutes() % 60).toString().padStart(2, "0");

    return hour + ":" + minute + ":00";
  }
}

export type BankHolidays = Record<Holiday, LocalDate[]>;

export interface TransXChangeJourney {
  calendar: JourneyCalendar
  trip: {
    id: number,
    shortName: string,
    direction: "inbound" | "outbound",
    headsign: string
  }
  route: string,
  stops: StopTime[],
  blockId?: string,
  routeLinkIds: string[],
  routeLinks: RouteLink[],
}

export interface JourneyCalendar {
  id: number,
  startDate: LocalDate,
  endDate: LocalDate,
  days: DaysOfWeek,
  includes: LocalDate[],
  excludes: LocalDate[]
}

export interface StopTime {
  stop: ATCOCode,
  arrivalTime: string,
  departureTime: string,
  headsign?: string,
  pickup: boolean,
  dropoff: boolean,
  exactTime: boolean,
  shapeDistTraveled: number
}
