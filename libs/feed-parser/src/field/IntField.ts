
import {Field, ParseError} from "./Field";
import {TextField} from "./TextField";

export class IntField extends Field {

  constructor(position: number,
              length: number,
              nullable: boolean = false,
              nullChars: string[] = [" ", "*", "9"]) {
    super(position, length, nullable, nullChars);
  }

  /**
   * Try to process this string as an integer
   */
  protected parse(value: string): number {
    const intValue = parseInt(value);

    if (isNaN(intValue)) {
      throw new ParseError(`Error parsing int: "${value}" isNaN`);
    }

    return intValue;
  }

}

/**
 * A zero filled int is stored as padded text, so it is a text field that pads rather than an int.
 *
 * Extending Field instead left it as the one text value in the feed that keeps the blanks a short
 * line pads it with, where every sibling column has them removed.
 */
export class ZeroFillIntField extends TextField {

  protected parse(value: string): string {
    return super.parse(value).padStart(this.length, "0");
  }

}