import {describe, it, expect} from 'vitest';
import {TextField, VariableLengthText} from "../field/TextField";

describe("TextField", () => {

  it("returns a string value", () => {
    const text = new TextField(0, 3);

    expect(text.extract("Hi")).to.equal("Hi");
  });

  // MySQL strips this from a char column, Postgres pads it back on, so it never reaches the database
  it("drops the padding a fixed width record fills the field out with", () => {
    const text = new TextField(0, 8);

    expect(text.extract("39000   ")).to.equal("39000");
  });

  it("keeps leading spaces, which are part of the value", () => {
    const text = new TextField(0, 5);

    expect(text.extract("  12 ")).to.equal("  12");
  });

  it("keeps the trailing spaces of a variable length field", () => {
    const text = new VariableLengthText(0, 12, false, []);

    expect(text.extract("TB          ")).to.equal("TB          ");
  });

});
