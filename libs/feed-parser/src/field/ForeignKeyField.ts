
import {Field} from "./Field";

/**
 * A record that generates its own identifiers, see RecordWithManualIdentifier and MultiFormatRecord.
 * Only the last identifier is needed, so this is a structural type rather than the record classes, whose
 * field maps would otherwise have to match exactly.
 */
export interface RecordWithLastId {
  lastId: number;
}

export class ForeignKeyField extends Field {

  constructor(private readonly foreignRecord: RecordWithLastId, public readonly offset = 0) {
    super(0, 1, false, []);
  }

  /**
   * Return the last apply ID of the foreign record
   */
  protected parse(value: string): number {
    return this.foreignRecord.lastId + this.offset;
  }

}
