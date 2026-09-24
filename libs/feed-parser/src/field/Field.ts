
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
    const isNull = (value === null || value === undefined) || value === "" || this.nullValues.indexOf(value) > -1;

    if (isNull) {
      if (this.nullable) return null;
      else throw new ParseError(`Non-nullable field received null value: "${value}" at position ${this.position}`);
    }

    return this.parse(value);
  }

  protected abstract parse(value: string): FieldValue;

}

export class ParseError extends Error {}

export type FieldValue = null | string | number;