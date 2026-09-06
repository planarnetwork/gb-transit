
import {Field} from "./Field";

/**
 * Basic text field, with a fixed length
 */
export class TextField extends Field {

  /**
   * Return the string without the padding the record used to fill the field out.
   *
   * The padding is how a fixed width line reaches the next field, not part of the value. Leaving it on
   * would mean the databases disagree: MySQL strips it from a char column on the way out, Postgres pads
   * the value back out to the width of the column, and SQLite returns whatever it was given. Removing it
   * here is what makes all three return the same string.
   */
  protected parse(value: string): string {
    return value.trimEnd();
  }

}

/**
 * Text field with a variable length.
 *
 * Nothing padded it out, so trailing spaces are part of the value and are kept.
 */
export class VariableLengthText extends TextField {

  protected parse(value: string): string {
    return value;
  }

}
