import {describe, it, expect} from "vitest";
import {stepFreeCategory, wheelchairBoarding} from "./StepFree";

describe("stepFreeCategory", () => {

  it("takes the letter off the front of the description", () => {
    expect(stepFreeCategory("A, Compliant step-free access to all platform(s)")).to.equal("A");
    expect(stepFreeCategory("B3, step-free access only to some platforms")).to.equal("B3");
    expect(stepFreeCategory("C, no step-free access to any platform")).to.equal("C");
  });

  it("reads the two the feed declines to describe", () => {
    expect(stepFreeCategory("B1, (refer to quick reference guide)")).to.equal("B1");
    expect(stepFreeCategory("B2, (refer to quick reference guide)")).to.equal("B2");
  });

  it("has nothing to say about a station that is not classified", () => {
    // 37 of the 2,613 stations, Bond Street and Brent Cross West among them.
    expect(stepFreeCategory(null)).to.equal(undefined);
    expect(stepFreeCategory(undefined)).to.equal(undefined);
    expect(stepFreeCategory("")).to.equal(undefined);
  });

  it("refuses a category it does not know rather than inventing one", () => {
    expect(stepFreeCategory("D, something new")).to.equal(undefined);
    expect(stepFreeCategory("B4")).to.equal(undefined);
  });

  it("does not mind the letter arriving on its own, or in lower case", () => {
    expect(stepFreeCategory("A")).to.equal("A");
    expect(stepFreeCategory(" b1 ")).to.equal("B1");
  });

});

describe("wheelchairBoarding", () => {

  // GTFS asks whether an accessible path exists to at least one platform, which
  // is a coarser question than the category answers. B3 reaches only some
  // platforms and B1 and B2 only under a constraint, but in all three a path
  // exists - and 2 is what tells a wheelchair user not to travel.
  it("is 1 wherever a step-free path to a platform exists", () => {
    expect(wheelchairBoarding("A")).to.equal(1);
    expect(wheelchairBoarding("B1")).to.equal(1);
    expect(wheelchairBoarding("B2")).to.equal(1);
    expect(wheelchairBoarding("B3")).to.equal(1);
  });

  it("is 2 only where no platform has one", () => {
    expect(wheelchairBoarding("C")).to.equal(2);
  });

  it("is 0 where the station is not classified", () => {
    expect(wheelchairBoarding(undefined)).to.equal(0);
  });

});
