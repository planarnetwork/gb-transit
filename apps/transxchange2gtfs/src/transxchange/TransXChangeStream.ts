import {
  DateRange,
  DaysOfWeek, Holiday,
  JourneyPatterns,
  JourneyPatternSections,
  JPJourneyStop,
  Lines,
  Mode,
  OperatingProfile,
  Operators,
  RouteLinks,
  Services,
  StopActivity,
  StopPoint, JPTimingLink,
  TransXChange,
  VehicleJourney,
  VJTimingLink,
  VJJourneyStop,
  JPTimingLinks,
  TimingStatus,
  Location
} from "./TransXChange";
import {Transform, TransformCallback} from "node:stream";
import {Duration, LocalDate, LocalTime} from "@js-joda/core";

/**
 * Transforms JSON objects into a TransXChange objects
 */
export class TransXChangeStream extends Transform {

  constructor() {
    super({ objectMode: true });
  }

  /**
   * Extract the stops, journeys and operators and emit them as a TransXChange object
   */
  public _transform(data: any, encoding: string, callback: TransformCallback): void {
    const tx = data.TransXChange;

    if (!tx?.VehicleJourneys?.[0].VehicleJourney) {
      console.warn("Skipping invalid journey");
      callback();
      return;
    }

    let result: TransXChange | undefined;

    try {
      const patternIndex = tx.VehicleJourneys[0].VehicleJourney.reduce(this.getJourneyPatternIndex, {});
      const services = tx.Services[0].Service.reduce(this.getServices, {});
      const stops = tx.StopPoints[0].AnnotatedStopPointRef
        ? tx.StopPoints[0].AnnotatedStopPointRef.map(this.getStopFromAnnotatedStopPointRef)
        : tx.StopPoints[0].StopPoint.map(this.getStopFromStopPoint);

      result = {
        StopPoints: stops,
        RouteLinks: tx.RouteSections[0].RouteSection.flatMap((r: any) => r.RouteLink).reduce(this.getRouteLinks, {}),
        JourneySections: tx.JourneyPatternSections[0].JourneyPatternSection.reduce(this.getJourneySections, {}),
        JPTimingLinks: tx.JourneyPatternSections[0].JourneyPatternSection.flatMap((s: any) => s.JourneyPatternTimingLink).reduce(this.getJPTimingLinks, {}),
        Operators: (tx.Operators?.[0].Operator || []).concat(tx.Operators?.[0].LicensedOperator || []).reduce(this.getOperators, {}),
        Services: services,
        VehicleJourneys: tx.VehicleJourneys[0].VehicleJourney.map((v: any) => this.getVehicleJourney(v, patternIndex, services))
      };
    } catch (err) {
      console.warn(err);
    }
    callback(undefined, result);
  }

  private getStopFromAnnotatedStopPointRef = (stop: any): StopPoint => {
    return {
      StopPointRef: stop?.StopPointRef?.[0] ?? "",
      CommonName: stop?.CommonName?.[0] ?? "",
      LocalityName: stop?.LocalityName?.[0] ? stop.LocalityName[0] : "",
      LocalityQualifier: stop?.LocalityQualifier?.[0] ? stop.LocalityQualifier[0] : "",
      Location: this.getLocation(stop?.Location?.[0])
    };
  }

  private getLocation = (location: any): Location => {
    return {
      Latitude: location?.Latitude ? Number(location.Latitude[0]) : 0.0,
      Longitude: location?.Longitude ? Number(location.Longitude[0]) : 0.0
    };
  }

  private getStopFromStopPoint = (stop: any): StopPoint => {
    return {
      StopPointRef: stop?.AtcoCode?.[0] ?? "",
      CommonName: stop?.Descriptor?.[0]?.CommonName?.[0] ?? "",
      LocalityName: "",
      LocalityQualifier: "",
      Location:  {
        Latitude: 0.0,
        Longitude: 0.0
      }
    };
  }

  private getRouteLinks = (index: RouteLinks, link: any): RouteLinks => {
    // A route link's ends are elements holding a StopPointRef, not the ref itself
    index[link.$.id] = {
      From: link?.From?.[0]?.StopPointRef?.[0] ?? "",
      To: link?.To?.[0]?.StopPointRef?.[0] ?? "",
      Distance: link?.Distance ? Number(link.Distance[0]) : 0,
      Locations: link?.Track?.flatMap((t: any) => t.Mapping[0].Location.map(this.getLocation)) ?? []
    };

    return index;
  }

  private getJourneySections = (index: JourneyPatternSections, section: any): JourneyPatternSections => {
    index[section.$.id] = section.JourneyPatternTimingLink ? section.JourneyPatternTimingLink.map(this.getJPLink) : [];

    return index;
  }

  private getJPTimingLinks = (index: JPTimingLinks, link: any): JPTimingLinks => {
    index[link.$.id] = this.getJPLink(link);

    return index;
  }

  private getJPLink = (l: any): JPTimingLink => {
    return {
      From: this.getJPJourneyStop(l?.From?.[0] ?? ""),
      To: this.getJPJourneyStop(l?.To?.[0] ?? ""),
      RunTime: Duration.parse(l?.RunTime?.[0] ?? ""),
      RouteLinkRef: l?.RouteLinkRef?.[0] ?? ""
    };
  }

  private getVJLink = (l: any): VJTimingLink => {
    return {
      JPTimingLinkRef: l?.JourneyPatternTimingLinkRef?.[0] ?? "",
      From: this.getVJJourneyStop(l?.From?.[0] ?? ""),
      To: this.getVJJourneyStop(l?.To?.[0] ?? ""),
      RunTime: l?.RunTime?.[0] && Duration.parse(l.RunTime[0]),
    };
  }

  private normalizeTimingStatus(status: string): TimingStatus {
    if (status === "PTP") return TimingStatus.PrincipalTimingPoint;
    if (status === "TIP") return TimingStatus.TimeInfoPoint;
    if (status === "OTH") return TimingStatus.OtherPoint;

    return status as TimingStatus;
  }

  private getJPJourneyStop(stop: any): JPJourneyStop {
    return {
      Activity: stop?.Activity?.[0] ? stop.Activity[0] : StopActivity.PickUpAndSetDown,
      StopPointRef: stop?.StopPointRef?.[0] ?? "",
      TimingStatus: this.normalizeTimingStatus(stop?.TimingStatus?.[0]) ?? TimingStatus.OtherPoint,
      WaitTime: stop?.WaitTime?.[0] && Duration.parse(stop.WaitTime[0]),
      DynamicDestinationDisplay: stop?.DynamicDestinationDisplay?.[0]
    };
  }

  private getVJJourneyStop(stop: any): VJJourneyStop {
    return {
      Activity: stop?.Activity?.[0],
      WaitTime: stop?.WaitTime?.[0] && Duration.parse(stop.WaitTime[0])
    };
  }

  private getOperators = (index: Operators, operator: any): Operators => {
    index[operator.$.id] = {
      NationalOperatorCode: operator?.NationalOperatorCode?.[0],
      OperatorCode: operator?.OperatorCode?.[0] ? operator.OperatorCode[0] : operator?.NationalOperatorCode?.[0] ?? "",
      OperatorShortName: operator?.OperatorShortName?.[0] ?? "",
      OperatorNameOnLicence: operator?.OperatorNameOnLicence?.[0] && (operator.OperatorNameOnLicence[0]?._ ?? operator.OperatorNameOnLicence[0] ?? ""),
      TradingName: operator?.TradingName?.[0]
    };

    return index;
  }

  private getServices = (index: Services, service: any): Services => {
    index[service.ServiceCode[0]] = {
      ServiceCode: service.ServiceCode[0],
      Lines: service.Lines[0].Line.reduce(this.getLines, {}),
      OperatingPeriod: this.getDateRange(service.OperatingPeriod[0]),
      RegisteredOperatorRef: service.RegisteredOperatorRef[0],
      Description: service.Description ? service.Description[0].replace(/[\r\n\t]/g, "") : "",
      Mode: service.Mode ? service.Mode[0] : Mode.Bus,
      StandardService: service.StandardService[0].JourneyPattern.reduce(this.getJourneyPattern, {}),
      ServiceOrigin: service.StandardService[0].Origin?.[0],
      ServiceDestination: service.StandardService[0].Destination?.[0],
      OperatingProfile: service.OperatingProfile
        ? this.getOperatingProfile(service.OperatingProfile[0])
        : service.StandardService[0].JourneyPattern?.[0].OperatingProfile?.[0]
          ? this.getOperatingProfile(service.StandardService[0].JourneyPattern?.[0].OperatingProfile[0])
          : undefined
    };

    return index;
  }

  private getJourneyPattern = (patterns: JourneyPatterns, pattern: any): JourneyPatterns => {
    patterns[pattern.$.id] = {
      Direction: pattern.Direction[0],
      Sections: pattern.JourneyPatternSectionRefs,
      DestinationDisplay: pattern.DestinationDisplay?.[0]
    };

    return patterns;
  }

  private getLines = (index: Lines, line: any): Lines => {
    index[line.$.id] = {
      LineName: line.LineName[0],
      Description: line.OutboundDescription?.[0].Description?.[0] ?? ""
    };

    return index;
  }

  private getDateRange = (dates: any): DateRange => {
    return {
      StartDate: LocalDate.parse(dates.StartDate[0]),
      EndDate: dates.EndDate?.[0] ? LocalDate.parse(dates.EndDate[0]) : LocalDate.parse("2099-12-31"),
    };
  }

  private getVehicleJourney(vehicle: any, index: JourneyPatternIndex, services: Services): VehicleJourney {
    return {
      LineRef: vehicle.LineRef[0],
      ServiceRef: vehicle.ServiceRef[0],
      VehicleJourneyCode: vehicle.VehicleJourneyCode[0],
      JourneyPatternRef: vehicle.JourneyPatternRef ? vehicle.JourneyPatternRef[0] : index[vehicle.VehicleJourneyRef[0]],
      DepartureTime: LocalTime.parse(vehicle.DepartureTime[0]),
      OperatingProfile: vehicle.OperatingProfile
        ? this.getOperatingProfile(vehicle.OperatingProfile[0])
        : services[vehicle.ServiceRef[0]].OperatingProfile!,
      OperationalBlockNumber: vehicle.Operational?.[0]?.Block?.[0].BlockNumber?.[0],
      TimingLinks: vehicle.VehicleJourneyTimingLink?.map(this.getVJLink)
    };
  }

  private getOperatingProfile(profile: any): OperatingProfile {
    const result: OperatingProfile = {
      BankHolidayOperation: {
        DaysOfOperation: [],
        DaysOfNonOperation: []
      },
      SpecialDaysOperation: {
        DaysOfOperation: [],
        DaysOfNonOperation: []
      },
      RegularDayType: profile.RegularDayType[0].DaysOfWeek
        ? this.getDaysOfWeek(profile.RegularDayType[0].DaysOfWeek[0])
        : "HolidaysOnly" as "HolidaysOnly"
    };

    if (profile.BankHolidayOperation?.[0].DaysOfOperation?.[0]) {
      result.BankHolidayOperation.DaysOfOperation = this.getHolidays(profile.BankHolidayOperation[0].DaysOfOperation[0]);

      if (profile.BankHolidayOperation[0].DaysOfOperation[0].OtherPublicHoliday) {
        const operationDates = profile.BankHolidayOperation[0].DaysOfOperation[0].OtherPublicHoliday
          .map((d: any) => this.getHolidayDate(d.Date[0]));
        result.SpecialDaysOperation.DaysOfOperation.push(...operationDates);
      }
    }
    if (profile.BankHolidayOperation?.[0].DaysOfNonOperation?.[0]) {
      result.BankHolidayOperation.DaysOfNonOperation = this.getHolidays(profile.BankHolidayOperation[0].DaysOfNonOperation[0]);

      if (profile.BankHolidayOperation[0].DaysOfNonOperation[0].OtherPublicHoliday) {
        const nonOperationDates = profile.BankHolidayOperation[0].DaysOfNonOperation[0].OtherPublicHoliday
          .filter((d: any) => d.Date?.[0])
          .map((d: any) => this.getHolidayDate(d.Date[0]));
        result.SpecialDaysOperation.DaysOfNonOperation.push(...nonOperationDates);
      }
    }
    if (profile.SpecialDaysOperation?.[0].DaysOfOperation?.[0]) {
      result.SpecialDaysOperation.DaysOfOperation = profile.SpecialDaysOperation[0].DaysOfOperation[0].DateRange.map(this.getDateRange);
    }
    if (profile.SpecialDaysOperation?.[0].DaysOfNonOperation?.[0]) {
      result.SpecialDaysOperation.DaysOfNonOperation = profile.SpecialDaysOperation[0].DaysOfNonOperation[0].DateRange.map(this.getDateRange);
    }

    return result;
  }

  private getHolidays(days: any): Holiday[] {
    return Object
      .keys(days)
      .filter(k => k !== "OtherPublicHoliday") as Holiday[];
  }

  private getHolidayDate(date: any): DateRange {
    const StartDate = LocalDate.parse(date);
    const EndDate = StartDate;

    return { StartDate, EndDate };
  }

  private getDaysOfWeek(days: any): DaysOfWeek[] {
    return Object.keys(days).length === 0
      ? [[0, 0, 0, 0, 0, 0, 0]]
      : Object.keys(days).map(d => daysOfWeekIndex[d] || [0, 0, 0, 0, 0, 0, 0]);
  }

  private getJourneyPatternIndex = (index: JourneyPatternIndex, vehicle: any): JourneyPatternIndex => {
    if (vehicle.JourneyPatternRef) {
      index[vehicle.VehicleJourneyCode[0]] = vehicle.JourneyPatternRef[0];
    }

    return index;
  }
}

/**
 * TransXChange's comical idea of how to represent days of operation
 */
export const daysOfWeekIndex: Record<string, DaysOfWeek> = {
  "MondayToFriday": [1, 1, 1, 1, 1, 0, 0],
  "MondayToSaturday": [1, 1, 1, 1, 1, 1, 0],
  "MondayToSunday": [1, 1, 1, 1, 1, 1, 1],
  "NotSaturday": [1, 1, 1, 1, 1, 0, 1],
  "Weekend": [0, 0, 0, 0, 0, 1, 1],
  "Monday": [1, 0, 0, 0, 0, 0, 0],
  "Tuesday": [0, 1, 0, 0, 0, 0, 0],
  "Wednesday": [0, 0, 1, 0, 0, 0, 0],
  "Thursday": [0, 0, 0, 1, 0, 0, 0],
  "Friday": [0, 0, 0, 0, 1, 0, 0],
  "Saturday": [0, 0, 0, 0, 0, 1, 0],
  "Sunday": [0, 0, 0, 0, 0, 0, 1],
};

/**
 * VehicleJourneyCode to JourneyPatternRef
 */
export type JourneyPatternIndex = Record<string, string>;
