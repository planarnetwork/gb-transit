import {LocalDate} from "@js-joda/core";
import type {DateWindow} from "./TransXChangeJourneyStream";
import {daysOfWeekIndex} from "./TransXChangeStream";
import type {DaysOfWeek} from "./TransXChange";
import {documents} from "../xml/Documents";

/**
 * A service as the scan for overlapping timetables sees it.
 */
export interface ServiceHeader {
  readonly serviceCode: string;
  /** The operator's National Operator Code where the document gives one. */
  readonly operator: string;
  /** Every line name the service runs under, sorted and joined. */
  readonly lines: string;
  readonly start: LocalDate;
  readonly end: LocalDate;
  /**
   * The days of the week any of its journeys run on, Monday first. A weekday
   * timetable does not replace a Saturday one by starting later, and a works
   * weekend running Friday to Monday does not take the Friday and the Monday.
   */
  readonly days: DaysOfWeek;
}

/**
 * The dates on which a service is replaced by a newer timetable for the same line, keyed by
 * `supersessionKey`.
 */
export type Supersession = ReadonlyMap<string, readonly LocalDate[]>;

/** How a service is found in the supersession, by what the journey stream knows of it. */
export function supersessionKey(serviceCode: string, start: LocalDate, end: LocalDate): string {
  return `${serviceCode}|${start}|${end}`;
}

const OPEN_ENDED = LocalDate.parse("2099-12-31");

/**
 * The operators and services of one document, read with patterns rather than parsed.
 *
 * The scan runs over every document before the conversion does, and needs a handful of elements
 * out of documents that run to tens of megabytes. Parsing each of them twice to find those would
 * double the cost of a conversion.
 */
export function serviceHeaders(xml: string): ServiceHeader[] {
  const operators = new Map<string, string>();

  for (const [, id, body] of xml.matchAll(/<(?:Licensed)?Operator\b[^>]*\bid="([^"]+)"[^>]*>([\s\S]*?)<\/(?:Licensed)?Operator>/g)) {
    const code = text(body, "NationalOperatorCode") ?? text(body, "OperatorCode");

    if (code !== undefined) {
      operators.set(id, code);
    }
  }

  const journeyDays = new Map<string, DaysOfWeek>();
  const unprofiled = new Set<string>();

  for (const [, body] of xml.matchAll(/<VehicleJourney\b[^>]*>([\s\S]*?)<\/VehicleJourney>/g)) {
    const service = text(body, "ServiceRef");

    if (service === undefined) {
      continue;
    }

    if (/<DaysOfWeek>/.test(body)) {
      journeyDays.set(service, union(journeyDays.get(service), daysIn(body)));
    }
    else {
      unprofiled.add(service);
    }
  }

  const headers: ServiceHeader[] = [];

  for (const [, body] of xml.matchAll(/<Service\b[^>]*>([\s\S]*?)<\/Service>/g)) {
    const serviceCode = text(body, "ServiceCode");
    const period = /<OperatingPeriod>([\s\S]*?)<\/OperatingPeriod>/.exec(body)?.[1];
    const start = date(period === undefined ? undefined : text(period, "StartDate"));

    if (serviceCode === undefined || period === undefined || start === undefined) {
      continue;
    }

    const operatorRef = text(body, "RegisteredOperatorRef") ?? "";
    const lines = [...body.matchAll(/<LineName>([^<]*)<\/LineName>/g)].map(([, name]) => name.trim()).sort();
    // A journey with no profile of its own runs on its service's, or on its first journey
    // pattern's where the service has none - the order the conversion looks in.
    const profile = operatingProfile(body.replace(/<StandardService>[\s\S]*<\/StandardService>/, ""))
      ?? operatingProfile(body);
    const inherited = unprofiled.has(serviceCode) && profile !== undefined ? daysIn(profile) : undefined;

    headers.push({
      serviceCode,
      operator: operators.get(operatorRef) ?? operatorRef,
      lines: lines.join("|"),
      start,
      // Empty, as a date that is not there is to the conversion: the service runs indefinitely.
      end: date(text(period, "EndDate")) ?? OPEN_ENDED,
      days: union(journeyDays.get(serviceCode), inherited)
    });
  }

  return headers;
}

function operatingProfile(xml: string): string | undefined {
  return /<OperatingProfile>([\s\S]*?)<\/OperatingProfile>/.exec(xml)?.[1];
}

/** A date as TransXChange writes it, or undefined where it is empty or not a date. */
function date(value: string | undefined): LocalDate | undefined {
  try {
    return value === undefined || value.trim() === "" ? undefined : LocalDate.parse(value.trim());
  }
  catch {
    return undefined;
  }
}

/** The days of the week the `DaysOfWeek` elements in some XML say, read as the conversion reads them. */
function daysIn(xml: string): DaysOfWeek {
  let days: DaysOfWeek = [0, 0, 0, 0, 0, 0, 0];

  for (const [, list] of xml.matchAll(/<DaysOfWeek>([\s\S]*?)<\/DaysOfWeek>/g)) {
    for (const [, day] of list.matchAll(/<(\w+)\s*\/?>/g)) {
      days = union(days, daysOfWeekIndex[day]);
    }
  }

  return days;
}

function union(a: DaysOfWeek | undefined, b: DaysOfWeek | undefined): DaysOfWeek {
  return [0, 1, 2, 3, 4, 5, 6].map(i => a?.[i] || b?.[i] ? 1 : 0) as DaysOfWeek;
}

/**
 * The services of every document in the inputs. An entry that cannot be read is left to the
 * conversion to report, which reads the same entries and counts what it skips.
 */
export function scanServices(inputs: readonly string[]): ServiceHeader[] {
  const headers: ServiceHeader[] = [];

  for (const input of inputs) {
    for (const document of documents(input)) {
      if ("xml" in document) {
        headers.push(...serviceHeaders(document.xml));
      }
    }
  }

  return headers;
}

function text(xml: string, element: string): string | undefined {
  return new RegExp(`<${element}>([^<]*)</${element}>`).exec(xml)?.[1];
}

/**
 * Which services are replaced on which days by another timetable for the same line.
 *
 * TfL publishes a line's base timetable and its engineering works timetables as separate services
 * whose operating periods overlap: the Central line's base timetable runs to December, and the
 * weekend the line is part closed is a second service from Friday to Monday. Nothing in either
 * says the second replaces the first - they have different service codes, and every document has
 * the same revision number - so a conversion that reads both runs the line twice that weekend.
 *
 * On each day, of the services of one operator and line that cover it and run on its day of the
 * week, the one that starts latest runs and the others do not. The later start is the more specific timetable: a works weekend
 * starts inside the base timetable it interrupts, and a new base timetable starts where the one it
 * replaces was still running. Where two start on the same day the shorter runs, and where they
 * cover the same days exactly both do, since nothing says either is the replacement.
 *
 * Only for a publisher that works this way. In a national BODS dataset an operator can have two
 * unrelated services under one line name in different towns, and this would switch one of them
 * off.
 */
export function supersession(headers: readonly ServiceHeader[], window: DateWindow): Supersession {
  const byLine = new Map<string, ServiceHeader[]>();

  for (const header of headers) {
    const line = `${header.operator}|${header.lines}`;
    const services = byLine.get(line);

    if (services === undefined) {
      byLine.set(line, [header]);
    }
    else {
      services.push(header);
    }
  }

  const replaced = new Map<string, LocalDate[]>();

  for (const services of byLine.values()) {
    if (services.length < 2) {
      continue;
    }

    for (let day = window.from; !day.isAfter(window.to); day = day.plusDays(1)) {
      const weekday = day.dayOfWeek().value() - 1;
      const covering = services.filter(s => !day.isBefore(s.start) && !day.isAfter(s.end) && s.days[weekday]);

      if (covering.length < 2) {
        continue;
      }

      const winner = covering.reduce((best, s) => precedes(s, best) ? s : best);

      for (const service of covering) {
        if (precedes(winner, service)) {
          const key = supersessionKey(service.serviceCode, service.start, service.end);
          const days = replaced.get(key);

          if (days === undefined) {
            replaced.set(key, [day]);
          }
          else {
            days.push(day);
          }
        }
      }
    }
  }

  return replaced;
}

/** Whether `a` runs in preference to `b` on a day both cover. */
function precedes(a: ServiceHeader, b: ServiceHeader): boolean {
  if (!a.start.equals(b.start)) {
    return a.start.isAfter(b.start);
  }

  return a.end.isBefore(b.end);
}
