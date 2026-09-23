import {describe, it, expect} from 'vitest';
import {IntField} from "../field/IntField";
import {TextField} from "../field/TextField";
import {DateField} from "../field/DateField";
import {FixedWidthRecord, RecordWithManualIdentifier} from "../record/FixedWidthRecord";
import {RecordAction} from "../record/Record";

describe("FixedWidthRecord", () => {

  it("looks up the correct field", () => {
    const field = new IntField(0, 4);
    const field2 = new TextField(4, 3);
    const field3 = new DateField(7);

    const record = new FixedWidthRecord(
      "test",
      [], {
        "field": field,
        "field2": field2,
        "field3": field3
      });

    expect(record.extractValues("1012Hi 31122999")).to.deep.equal({
      action: RecordAction.Insert,
      keysValues: {},
      values: {
        id: null,
        field: 1012,
        field2: "Hi",
        field3: "2999-12-31"
      }
    });
  });

  it("ignores missing fields", () => {
    const field = new IntField(0, 4);
    const field2 = new TextField(4, 3);

    const record = new FixedWidthRecord(
      "test",
      [], {
        "field": field,
        "field2": field2,
      });

    expect(record.extractValues("1012Hi 31122999")).to.deep.equal({
      action: RecordAction.Insert,
      keysValues: {},
      values: {
        id: null,
        field: 1012,
        field2: "Hi"
      }
    });
  });

  /**
   * The null values are the field's full width, so the part of a field a short line does reach is padded
   * out to it before it is read
   */
  it("reads a field a short line stops part way through as blank", () => {
    const record = new FixedWidthRecord("test", [], {
      "code": new TextField(0, 2),
      "suffix": new TextField(2, 3, true)
    });

    expect(record.extractValues("AB  ").values).to.deep.equal({ id: null, code: "AB", suffix: null });
    expect(record.extractValues("AB").values).to.deep.equal({ id: null, code: "AB", suffix: null });
    expect(record.extractValues("ABx").values).to.deep.equal({ id: null, code: "AB", suffix: "x" });
  });

  it("refuses a field a short line leaves blank when it cannot be null", () => {
    const record = new FixedWidthRecord("test", [], {
      "code": new TextField(0, 2),
      "name": new TextField(2, 3)
    });

    expect(() => record.extractValues("AB  ")).to.throw("Non-nullable field received null value");
  });

  it("picks the correct action", () => {
    const field = new IntField(1, 4);
    const field2 = new TextField(5, 3);
    const field3 = new DateField(8);

    const record = new FixedWidthRecord(
      "test",
      ["field", "field2"],
      {
        "field": field,
        "field2": field2,
        "field3": field3
      },
      [],
      {
        "I": RecordAction.Insert,
        "A": RecordAction.Update,
        "D": RecordAction.Delete,
        "R": RecordAction.Insert
      }
    );

    expect(record.extractValues("D1012Hi 31122999")).to.deep.equal({
      action: RecordAction.Delete,
      keysValues: {
        field: 1012,
        field2: "Hi"
      },
      values: {
        id: null,
        field: 1012,
        field2: "Hi",
        field3: "2999-12-31"
      }
    });

    expect(record.extractValues("A1012Hi 31122999")).to.deep.equal({
      action: RecordAction.Update,
      keysValues: {
        field: 1012,
        field2: "Hi"
      },
      values: {
        id: null,
        field: 1012,
        field2: "Hi",
        field3: "2999-12-31"
      }
    });
  });
});

describe("RecordWithManualIdentifier", () => {

  it("populates the id field", () => {
    const field = new IntField(0, 4);
    const field2 = new TextField(4, 3);
    const field3 = new DateField(7);

    const record = new RecordWithManualIdentifier(
      "test",
      [], {
        "field": field,
        "field2": field2,
        "field3": field3
      });

    expect(record.extractValues("1012Hi 31122999")).to.deep.equal({
      action: RecordAction.Insert,
      keysValues: {},
      values: {
        id: 1,
        field: 1012,
        field2: "Hi",
        field3: "2999-12-31"
      }
    });
  });

  it("increments the id field", () => {
    const field = new IntField(0, 4);
    const field2 = new TextField(4, 3);

    const record = new RecordWithManualIdentifier(
      "test",
      [], {
        "field": field,
        "field2": field2,
      });

    expect(record.extractValues("1012Hi 31122999")).to.deep.equal({
      action: RecordAction.Insert,
      keysValues: {},
      values: {
        id: 1,
        field: 1012,
        field2: "Hi"
      }
    });

    expect(record.extractValues("1012Hi 31122999")).to.deep.equal({
      action: RecordAction.Insert,
      keysValues: {},
      values: {
        id: 2,
        field: 1012,
        field2: "Hi"
      }
    });

    expect(record.extractValues("1012Hi 31122999")).to.deep.equal({
      action: RecordAction.Insert,
      keysValues: {},
      values: {
        id: 3,
        field: 1012,
        field2: "Hi"
      }
    });
  });

});

