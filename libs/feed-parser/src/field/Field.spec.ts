import {describe, it, expect} from 'vitest';
import {TextField} from "../field/TextField";

describe("Field", () => {

  it("return null if the field is nullable", () => {
    const nullable = new TextField(0, 3, true);

    // not one of the null values, so it is a value, and a fixed width field drops its padding
    expect(nullable.extract("  ")).to.equal("");
    expect(nullable.extract("   ")).to.equal(null);
    expect(nullable.extract("")).to.equal(null);
  });

  it("throw an exception if it is not", () => {
    const notNullable = new TextField(0, 3, false);

    expect(notNullable.extract("  ")).to.equal("");
    expect(() => notNullable.extract("   ")).to.throw('Non-nullable field received null value: "   "');
    expect(() => notNullable.extract("")).to.throw('Non-nullable field received null value: ""');
  });

});
