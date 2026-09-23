import {describe, it, expect} from "vitest";
import {inForce} from "./PermittedStations";
import type {PermittedStations} from "./PermittedStations";

const record = (startDate: string, endDate: string): PermittedStations => ({
  fareGroup: "0254",
  fareLocation: "0035",
  routeCode: "00000",
  startDate,
  endDate,
  stations: ["CET"]
});

describe("inForce", () => {

  it("includes the day a record starts and the day it ends", () => {
    const open = record("2018-05-21", "2024-03-01");

    expect(inForce(open, "2018-05-21")).to.equal(true);
    expect(inForce(open, "2024-03-01")).to.equal(true);
  });

  it("excludes the days either side", () => {
    const open = record("2018-05-21", "2024-03-01");

    expect(inForce(open, "2018-05-20")).to.equal(false);
    expect(inForce(open, "2024-03-02")).to.equal(false);
  });

  it("takes the industry's open-ended end date, which every record carries", () => {
    expect(inForce(record("2018-05-21", "2999-12-31"), "2026-09-23")).to.equal(true);
  });

  /**
   * The comparison is a string comparison, so a date in the other convention
   * answers wrongly rather than failing: `-` is 0x2D and `0` is 0x30, which
   * puts a record starting in October in force in September.
   */
  it("refuses a date that is not YYYY-MM-DD, rather than answering wrongly", () => {
    const october = record("2026-10-01", "2999-12-31");

    expect(() => inForce(october, "20260902")).to.throw(/must be YYYY-MM-DD/);
    expect("2026-10-01" <= "20260902").to.equal(true);
  });

});
