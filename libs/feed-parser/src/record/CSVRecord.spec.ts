import {describe, it, expect} from 'vitest';
import {DoubleField} from "../field/DoubleField";
import {TextField} from "../field/TextField";
import {CSVRecord} from "../record/CSVRecord";
import {DateField} from "../field/DateField";
import {RecordAction} from "../record/Record";

describe("CSVRecord", () => {

  it("looks up the correct field", () => {
    const field = new DoubleField(0, 4, 2);
    const field2 = new TextField(1, 3);
    const field3 = new DateField(2);

    const record = new CSVRecord(
      "test",
      [], {
        "field": field,
        "field2": field2,
        "field3": field3
    });

    expect(record.extractValues("10.12,Hi ,31122999")).to.deep.equal({
      action: RecordAction.Insert,
      keysValues: {},
      values: {
        id: null,
        field: 10.12,
        field2: "Hi ",
        field3: "2999-12-31"
      }
    });
  });

  it("ignores missing fields", () => {
    const field = new DoubleField(0, 4, 2);
    const field2 = new TextField(1, 3);

    const record = new CSVRecord(
      "test",
      [], {
        "field": field,
        "field2": field2,
      });

    expect(record.extractValues("10.12,Hi ,31122999")).to.deep.equal({
      action: RecordAction.Insert,
      keysValues: {},
      values: {
        id: null,
        field: 10.12,
        field2: "Hi "
      }
    });
  });


});
