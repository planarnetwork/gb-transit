import {describe, it, expect} from 'vitest';
import {TextField} from "../field/TextField";

describe("Field", () => {

  /**
   * The null values are the field's full width, so a line that stops short of it pads with something
   * the null check does not recognise. What the padding parses to is nothing either way.
   */
  it("return null if the field is nullable", () => {
    const nullable = new TextField(0, 3, true);

    expect(nullable.extract("  ")).to.equal(null);
    expect(nullable.extract("   ")).to.equal(null);
    expect(nullable.extract("")).to.equal(null);
  });

  it("throw an exception if it is not", () => {
    const notNullable = new TextField(0, 3, false);

    expect(() => notNullable.extract("  ")).to.throw('Non-nullable field received null value: "  "');
    expect(() => notNullable.extract("   ")).to.throw('Non-nullable field received null value: "   "');
    expect(() => notNullable.extract("")).to.throw('Non-nullable field received null value: ""');
  });

  it("keeps a value that is not only padding", () => {
    const field = new TextField(0, 3, false);

    expect(field.extract("ab ")).to.equal("ab");
    expect(field.extract("abc")).to.equal("abc");
  });

});
