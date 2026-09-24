
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
