
import memoize from "memoized-class-decorator";

/**
 * Parent class for all fields
 */
export abstract class Field {

  constructor(
    public readonly position: number,
    public readonly length: number,
    public readonly nullable: boolean = false,
    public readonly nullChars: string[] = [" ", "*"]
  ) {}

  /**
   * Return the possible null values for this field. For example, if the nullChars are " " and "*" and the length
   * is 3 this method will return ["   ", "***"]
   */
  @memoize
  public get nullValues(): string[] {
    return this.nullChars.map(c => Array(this.length + 1).join(c));
  }

  /**
   * Do some null checking then offload to the sub classes parse method
   */
  public extract(value: string): FieldValue {
    if (this.isNothing(value)) {
      if (this.nullable) return null;
      else throw new ParseError(`Non-nullable field received null value: "${value}" at position ${this.position}`);
    }

    return this.parse(value);
  }

  /**
   * True if the value says the field was not written.
   *
   * A run of one of the null characters, of any length, rather than only one the width of the field:
   * a line that stops short pads with the same character and reaches neither the field's width nor
   * its null values, and two spaces in a three character field are as much nothing as three.
   *
   * A field with no null characters has no such value - a blank suffix is a suffix - so it keeps
   * whatever it was given.
   */
  private isNothing(value: string): boolean {
    return value === null || value === undefined || value === ""
      || this.nullChars.some(character => value === character.repeat(value.length));
  }

  protected abstract parse(value: string): FieldValue;

}

export class ParseError extends Error {}

export type FieldValue = null | string | number;