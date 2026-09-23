
import {Field, FieldValue} from "../field/Field";

export interface Record {

  name: string;
  key: string[];
  fields: FieldMap;
  indexes: string[];
  orderedInserts: boolean;

  /**
   * Turn the given line into a list of values
   */
  extractValues(line: string): ParsedRecord;

}

export interface FieldMap {
  [field: string]: Field;
}

export enum RecordAction {
  Insert = "I",
  Update = "A",
  Delete = "D",
  DelayedInsert = "DI"
}

export interface ParsedRecord {
  action: RecordAction;
  values: {
    [field: string]: FieldValue;
  };
  keysValues: {
    [keyField: string]: FieldValue;
  }
}

/**
 * The text of a field in a fixed width line.
 *
 * A line that stops part way through a field is padded out to the field's width, as the null values are
 * that width: two spaces in a three character field are as blank as three. A line that stops before the
 * field starts gives nothing at all.
 */
export function fixedWidthText(line: string, field: Field): string {
  const text = line.substr(field.position, field.length);

  return text === "" ? text : text.padEnd(field.length, " ");
}
