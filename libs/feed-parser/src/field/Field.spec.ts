import {describe, it, expect} from 'vitest';
import {TextField} from "../field/TextField";
import {IntField} from "../field/IntField";

describe("Field", () => {

  it("return null if the field is nullable", () => {
    const nullable = new TextField(0, 3, true);

    expect(nullable.extract("  ")).to.equal("  ");
    expect(nullable.extract("   ")).to.equal(null);
    expect(nullable.extract("")).to.equal(null);
  });

  it("throw an exception if it is not", () => {
    const notNullable = new TextField(0, 3, false);

    expect(notNullable.extract("  ")).to.equal("  ");
    expect(() => notNullable.extract("   ")).to.throw('Non-nullable field received null value: "   "');
    expect(() => notNullable.extract("")).to.throw('Non-nullable field received null value: ""');
  });

  /**
   * A null character is only nothing when it fills the field. A CSV field is as wide as its value, so a
   * 9 minute interchange would otherwise read as no interchange time at all.
   */
  it("reads a null character that does not fill the field as a value", () => {
    expect(new IntField(3, 2).extract("9")).to.equal(9);
    expect(new TextField(0, 3).extract("*")).to.equal("*");
  });

});
