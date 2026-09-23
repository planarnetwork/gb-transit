import {describe, it, expect} from "vitest";
import {TransferRow, TransferType} from "@gb-transit/gtfs-schema";
import {FeedIndex} from "./FeedIndex";

function transfers(...rows: Partial<TransferRow>[]): TransferRow[] {
  const index = new FeedIndex();

  for (const row of rows) {
    index.transfer({from_stop_id: "A", to_stop_id: "B", transfer_type: TransferType.MinTime, min_transfer_time: 300, ...row});
  }

  return index.results().transfers;
}

const WEEKDAYS = {monday: 1, tuesday: 1, wednesday: 1, thursday: 1, friday: 1, saturday: 0, sunday: 0} as const;
const WEEKENDS = {monday: 0, tuesday: 0, wednesday: 0, thursday: 0, friday: 0, saturday: 1, sunday: 1} as const;

describe("FeedIndex, one transfer per pair", () => {

  it("keeps the shorter time", () => {
    expect(transfers({min_transfer_time: 600}, {min_transfer_time: 300}).map(t => t.min_transfer_time)).to.deep.equal([300]);
  });

  it("is available whenever either row was, on the days either ran", () => {
    const [kept] = transfers(
      {min_transfer_time: 600, mode: "WALK", start_time: "05:00:00", end_time: "12:00:00", ...WEEKENDS},
      {min_transfer_time: 300, mode: "TUBE", start_time: "06:00:00", end_time: "23:59:00", ...WEEKDAYS}
    );

    expect(kept).to.include({
      min_transfer_time: 300, mode: "TUBE|WALK", start_time: "05:00:00", end_time: "23:59:00",
      monday: 1, saturday: 1, sunday: 1
    });
  });

  it("leaves a window unsaid where either row left it unsaid", () => {
    const [kept] = transfers(
      {min_transfer_time: 300, start_time: "06:00:00", end_time: "23:59:00", ...WEEKDAYS},
      {min_transfer_time: 600}
    );

    expect(kept.start_time).to.equal(undefined);
    expect(kept.end_time).to.equal(undefined);
    expect(kept.saturday).to.equal(undefined);
  });

  it("leaves a feed that says nothing about windows as it was", () => {
    const [kept] = transfers({min_transfer_time: 600}, {min_transfer_time: 300});

    expect(kept).to.deep.equal({
      from_stop_id: "A", to_stop_id: "B", transfer_type: TransferType.MinTime, min_transfer_time: 300,
      start_time: undefined, end_time: undefined, start_date: undefined, end_date: undefined, mode: undefined,
      monday: undefined, tuesday: undefined, wednesday: undefined, thursday: undefined, friday: undefined,
      saturday: undefined, sunday: undefined
    });
  });

});
