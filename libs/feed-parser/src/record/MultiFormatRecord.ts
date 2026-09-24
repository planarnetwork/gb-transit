
import {FieldMap, ParsedRecord, Record, RecordAction} from "./Record";
import {FieldValue} from "../field/Field";

/**
 * Record that has multiple row types, used for LI, LO stop records
 */
export class MultiFormatRecord implements Record {
  public lastId = 0;

  constructor(
    public readonly name: string,
    public readonly key: string[],
    public readonly fields: FieldMap,
    private readonly records: MultiRecordFieldMap,
    private readonly recordIdentifierStart: number,
    private readonly recordIdentifierLength: number,
    public readonly indexes: string[] = [],
    public readonly orderedInserts: boolean = false
  ) {}

  /**
   * Extract the relevant part of the line for each field and then get the value from the field
   */
  public extractValues(line: string): ParsedRecord {
    const type = line.substr(this.recordIdentifierStart, this.recordIdentifierLength);
    const record = this.records[type];
    const values: { [field: string]: FieldValue } = { id: ++this.lastId };
    const action = RecordAction.Insert;

    for (const key in record) {
      values[key] = record[key].extract(line.substr(record[key].position, record[key].length));
    }

    return { action, values, keysValues: values };
  }

}

export type MultiRecordFieldMap = {
  [recordIdentifier: string]: FieldMap
};
