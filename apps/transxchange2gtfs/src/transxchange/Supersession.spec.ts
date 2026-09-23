import {describe, it, expect} from "vitest";
import {LocalDate} from "@js-joda/core";
import {ServiceHeader, serviceHeaders, supersession, supersessionKey} from "./Supersession";
import {DaysOfWeek} from "./TransXChange";

const window = {from: LocalDate.parse("2026-09-22"), to: LocalDate.parse("2026-12-22")};

const EVERY_DAY: DaysOfWeek = [1, 1, 1, 1, 1, 1, 1];
const WEEKDAYS: DaysOfWeek = [1, 1, 1, 1, 1, 0, 0];
const WEEKENDS: DaysOfWeek = [0, 0, 0, 0, 0, 1, 1];

function service(
  serviceCode: string, start: string, end: string, lines = "Central", operator = "LUL", days = EVERY_DAY
): ServiceHeader {
  return {serviceCode, operator, lines, start: LocalDate.parse(start), end: LocalDate.parse(end), days};
}

function days(of: ReadonlyMap<string, readonly LocalDate[]>, header: ServiceHeader): string[] {
  return (of.get(supersessionKey(header.serviceCode, header.start, header.end)) ?? []).map(d => d.toString());
}

describe("supersession", () => {

  it("runs a works weekend instead of the base timetable it sits inside", () => {
    const base = service("CEN-base", "2026-09-19", "2026-12-23");
    const works = service("CEN-works", "2026-10-02", "2026-10-04");
    const replaced = supersession([base, works], window);

    expect(days(replaced, base)).to.deep.equal(["2026-10-02", "2026-10-03", "2026-10-04"]);
    expect(days(replaced, works)).to.deep.equal([]);
  });

  it("runs a new base timetable from the day it starts, where the old one overlaps it", () => {
    const old = service("MET-old", "2026-09-19", "2026-09-27");
    const next = service("MET-next", "2026-09-27", "2026-12-23");

    expect(days(supersession([old, next], window), old)).to.deep.equal(["2026-09-27"]);
  });

  it("runs the shorter of two starting the same day", () => {
    const long = service("TR-long", "2026-10-02", "2026-12-23", "Tram", "TCL");
    const short = service("TR-short", "2026-10-02", "2026-10-03", "Tram", "TCL");

    expect(days(supersession([long, short], window), long)).to.deep.equal(["2026-10-02", "2026-10-03"]);
  });

  it("runs both of two covering exactly the same days, since neither says it replaces the other", () => {
    const a = service("A", "2026-10-01", "2026-10-31");
    const b = service("B", "2026-10-01", "2026-10-31");
    const replaced = supersession([a, b], window);

    expect(replaced.size).to.equal(0);
  });

  it("does not let a weekday timetable that starts later take a Saturday", () => {
    // 2026-10-03 is a Saturday
    const saturdays = service("SAT", "2026-09-19", "2026-12-23", "Central", "LUL", WEEKENDS);
    const weekdays = service("WKD", "2026-09-28", "2026-12-23", "Central", "LUL", WEEKDAYS);
    const replaced = supersession([saturdays, weekdays], window);

    expect(days(replaced, saturdays)).to.deep.equal([]);
  });

  it("does not let a works weekend take the Friday and Monday its period spans but it does not run on", () => {
    const base = service("CEN-base", "2026-09-19", "2026-12-23");
    const works = service("CEN-works", "2026-10-02", "2026-10-05", "Central", "LUL", WEEKENDS);

    expect(days(supersession([base, works], window), base)).to.deep.equal(["2026-10-03", "2026-10-04"]);
  });

  it("leaves other lines and other operators alone", () => {
    const central = service("CEN", "2026-09-19", "2026-12-23");
    const jubilee = service("JUB", "2026-10-02", "2026-10-04", "Jubilee");
    const elsewhere = service("OTHER", "2026-10-02", "2026-10-04", "Central", "XYZ");

    expect(supersession([central, jubilee, elsewhere], window).size).to.equal(0);
  });

  it("only counts the days the feed covers", () => {
    const base = service("CEN-base", "2026-09-01", "2026-12-23");
    const works = service("CEN-works", "2026-09-20", "2026-09-23");

    expect(days(supersession([base, works], window), base)).to.deep.equal(["2026-09-22", "2026-09-23"]);
  });

});

describe("serviceHeaders", () => {

  it("reads the service, its lines, its period and its operator's national code", () => {
    const xml = `<TransXChange>
      <Operators><Operator id="OId_TCL"><NationalOperatorCode>TCL</NationalOperatorCode><OperatorCode>TCL</OperatorCode></Operator></Operators>
      <Services><Service>
        <ServiceCode>63-TR-_-y05-151</ServiceCode>
        <Lines><Line id="63-TR-_-y05-151"><LineName>Tram</LineName></Line></Lines>
        <OperatingPeriod><StartDate>2026-10-02</StartDate><EndDate>2026-10-08</EndDate></OperatingPeriod>
        <RegisteredOperatorRef>OId_TCL</RegisteredOperatorRef>
      </Service></Services>
      <VehicleJourneys>
        <VehicleJourney><OperatingProfile><RegularDayType><DaysOfWeek><MondayToFriday /></DaysOfWeek></RegularDayType></OperatingProfile>
          <ServiceRef>63-TR-_-y05-151</ServiceRef></VehicleJourney>
        <VehicleJourney><OperatingProfile><RegularDayType><DaysOfWeek><Saturday/></DaysOfWeek></RegularDayType></OperatingProfile>
          <ServiceRef>63-TR-_-y05-151</ServiceRef></VehicleJourney>
      </VehicleJourneys>
    </TransXChange>`;

    expect(serviceHeaders(xml)).to.deep.equal([
      service("63-TR-_-y05-151", "2026-10-02", "2026-10-08", "Tram", "TCL", [1, 1, 1, 1, 1, 1, 0])
    ]);
  });

  it("gives a journey with no profile of its own its service's days", () => {
    const xml = `<Service><ServiceCode>S</ServiceCode><Lines><Line id="1"><LineName>1</LineName></Line></Lines>
      <OperatingPeriod><StartDate>2026-01-01</StartDate></OperatingPeriod>
      <OperatingProfile><RegularDayType><DaysOfWeek><Weekend /></DaysOfWeek></RegularDayType></OperatingProfile>
      <RegisteredOperatorRef>O</RegisteredOperatorRef></Service>
      <VehicleJourney><ServiceRef>S</ServiceRef></VehicleJourney>`;

    expect(serviceHeaders(xml)[0].days).to.deep.equal(WEEKENDS);
  });

  it("takes a service with no end date to run indefinitely, as the conversion does", () => {
    const xml = `<Service><ServiceCode>S</ServiceCode><Lines><Line id="1"><LineName>1</LineName></Line></Lines>
      <OperatingPeriod><StartDate>2026-01-01</StartDate></OperatingPeriod><RegisteredOperatorRef>O</RegisteredOperatorRef></Service>`;

    expect(serviceHeaders(xml)[0].end.toString()).to.equal("2099-12-31");
  });

  it("takes an empty end date the same way, rather than failing the scan", () => {
    const xml = `<Service><ServiceCode>S</ServiceCode><Lines><Line id="1"><LineName>1</LineName></Line></Lines>
      <OperatingPeriod><StartDate>2026-01-01</StartDate><EndDate></EndDate></OperatingPeriod>
      <RegisteredOperatorRef>O</RegisteredOperatorRef></Service>`;

    expect(serviceHeaders(xml)[0].end.toString()).to.equal("2099-12-31");
  });

  it("leaves out a service whose start is not a date, for the conversion to report", () => {
    const xml = `<Service><ServiceCode>S</ServiceCode><Lines><Line id="1"><LineName>1</LineName></Line></Lines>
      <OperatingPeriod><StartDate>soon</StartDate></OperatingPeriod><RegisteredOperatorRef>O</RegisteredOperatorRef></Service>`;

    expect(serviceHeaders(xml)).to.deep.equal([]);
  });

});
