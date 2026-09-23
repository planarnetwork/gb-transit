import {describe, it, expect, vi, afterEach} from "vitest";
import {Temporal} from "temporal-polyfill";
import {AgencyID, RouteType} from "@gb-transit/gtfs-schema";
import {ScheduleCalendar} from "../model/ScheduleCalendar";
import {Schedule} from "../model/Schedule";
import {STP} from "../model/OverlayRecord";
import {ScheduleIndex} from "./ApplyAssociations";
import {excludeLinks, excludeServices, NO_EXCLUSIONS, ServiceExclusions} from "./ExcludeServices";

describe("excludeServices", () => {

  it("returns the schedules untouched when there is nothing to exclude", () => {
    const schedules = index(train("A", "LO"), tube("B", "LT"));

    expect(excludeServices(schedules, NO_EXCLUSIONS)).to.equal(schedules);
  });

  it("drops a mode whoever runs it", () => {
    const kept = excludeServices(
      index(train("A", "GW"), tube("B", "LT"), ferry("C", "QC")),
      rules({modes: [RouteType.Subway, RouteType.Ferry]})
    );

    expect(Object.keys(kept)).to.deep.equal(["A"]);
  });

  it("keeps a replacement bus when the scheduled buses go", () => {
    const kept = excludeServices(
      index(bus("A", "EM"), replacement("B", "AW")),
      rules({modes: [RouteType.Bus]})
    );

    expect(Object.keys(kept)).to.deep.equal(["B"]);
  });

  it("drops everything an excluded operator runs, replacement buses included", () => {
    const kept = excludeServices(
      index(tube("A", "LT"), replacement("B", "LT"), train("C", "LO")),
      rules({operators: ["LT"]})
    );

    expect(Object.keys(kept)).to.deep.equal(["C"]);
  });

  it("drops only the replacement buses of the operators named for it", () => {
    const kept = excludeServices(
      index(train("A", "LO"), replacement("B", "LO"), replacement("C", "AW")),
      rules({replacementBuses: ["LO"]})
    );

    expect(Object.keys(kept)).to.deep.equal(["A", "C"]);
  });

  it("keeps the schedules of an excluded TUID that survive", () => {
    // A TUID holds every record for one service, and an overlay can run as
    // something the rules drop while the permanent record does not.
    const kept = excludeServices(
      {A: [train("A", "GW"), bus("A", "GW")]},
      rules({modes: [RouteType.Bus]})
    );

    expect(kept.A.map(schedule => schedule.mode)).to.deep.equal([RouteType.Rail]);
  });

  it("leaves no empty TUID behind", () => {
    const kept = excludeServices(index(tube("A", "LT")), rules({operators: ["LT"]}));

    expect(Object.hasOwn(kept, "A")).to.equal(false);
  });

  it("says what each rule matched", () => {
    const log = vi.spyOn(console, "log").mockImplementation(() => {});

    excludeServices(index(tube("A", "LT"), tube("B", "LT"), ferry("C", "QC")), rules({
      modes: [RouteType.Subway, RouteType.Ferry]
    }));

    expect(log).toHaveBeenCalledWith("Excluded 3 schedule(s), matching mode metro (2), mode ship (1)");
  });

  it("counts a schedule under every rule that catches it, not the first", () => {
    // Otherwise `mode metro` reads as catching nothing when `operator LT` got
    // there first, and a rule that is working looks like a mistyped one.
    const log = vi.spyOn(console, "log").mockImplementation(() => {});

    excludeServices(index(tube("A", "LT")), rules({operators: ["LT"], modes: [RouteType.Subway]}));

    expect(log).toHaveBeenCalledWith("Excluded 1 schedule(s), matching mode metro (1), operator LT (1)");
  });

  it("names a rule that matched nothing, because that is how a mistyped code shows", () => {
    // Even though another rule matched: a replacement bus rule for an operator
    // that has none looks exactly like a working one otherwise.
    const log = vi.spyOn(console, "log").mockImplementation(() => {});

    excludeServices(
      index(tube("A", "LT"), train("B", "LO")),
      rules({operators: ["LT"], replacementBuses: ["LO", "XR"]})
    );

    expect(log).toHaveBeenCalledWith(
      "Nothing matched replacement buses of LO, replacement buses of XR - " +
      "not in this feed, or not the code it uses."
    );
  });

});

describe("excludeLinks", () => {

  it("keeps every link when there is nothing to exclude", () => {
    const links = [link("EUS", "WAT", "TUBE"), link("EUS", "STP", "WALK")];

    expect(excludeLinks(links, NO_EXCLUSIONS)).to.deep.equal(links);
  });

  it("drops the links of the modes named, and only those", () => {
    vi.spyOn(console, "log").mockImplementation(() => {});

    const kept = excludeLinks(
      [link("EUS", "WAT", "TUBE"), link("EUS", "STP", "WALK"), link("PAD", "LST", "TRANSFER")],
      rules({links: ["TUBE"]})
    );

    expect(kept.map(l => l.mode)).to.deep.equal(["WALK", "TRANSFER"]);
  });

  it("does not exclude links for a schedule rule", () => {
    // `modes: [metro]` is about the trains the CIF calls metro, not the METRO
    // links to the Tyne and Wear and Manchester stations that are still in the feed.
    const links = [link("MAN", "DGT", "METRO")];

    expect(excludeLinks(links, rules({modes: [RouteType.Subway]}))).to.deep.equal(links);
  });

  it("says how many it dropped", () => {
    const log = vi.spyOn(console, "log").mockImplementation(() => {});

    excludeLinks([link("EUS", "WAT", "TUBE"), link("KGX", "WAT", "TUBE")], rules({links: ["TUBE"]}));

    expect(log).toHaveBeenCalledWith("Excluded 2 fixed link(s) by mode TUBE");
  });

});

afterEach(() => {
  vi.restoreAllMocks();
});

function rules(some: Partial<ServiceExclusions>): ServiceExclusions {
  return {...NO_EXCLUSIONS, ...some};
}

function link(from: string, to: string, mode: string): {from_stop_id: string, to_stop_id: string, mode: string} {
  return {from_stop_id: from, to_stop_id: to, mode};
}

function index(...schedules: Schedule[]): ScheduleIndex {
  return schedules.reduce(
    (all, schedule) => ({...all, [schedule.tuid]: [...all[schedule.tuid] ?? [], schedule]}),
    {} as ScheduleIndex
  );
}

const train = (tuid: string, operator: AgencyID) => schedule(tuid, operator, RouteType.Rail);
const tube = (tuid: string, operator: AgencyID) => schedule(tuid, operator, RouteType.Subway);
const bus = (tuid: string, operator: AgencyID) => schedule(tuid, operator, RouteType.Bus);
const ferry = (tuid: string, operator: AgencyID) => schedule(tuid, operator, RouteType.Ferry);
const replacement = (tuid: string, operator: AgencyID) =>
  schedule(tuid, operator, RouteType.ReplacementBus);

function schedule(tuid: string, operator: AgencyID, mode: RouteType): Schedule {
  return new Schedule(
    1,
    [],
    tuid,
    "",
    new ScheduleCalendar(
      Temporal.PlainDate.from("2026-01-01"),
      Temporal.PlainDate.from("2026-03-01"),
      {0: 1, 1: 1, 2: 1, 3: 1, 4: 1, 5: 1, 6: 1}
    ),
    mode,
    operator,
    STP.Permanent,
    true,
    true
  );
}
