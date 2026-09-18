/**
 * A stage of the pipeline that can leave something out.
 *
 * Reading a dataset is deliberately forgiving - a corrupt document does not take
 * the rest of the registrations with it - so each stage that swallows something
 * counts it, and `Converter` says so at the end.
 */
export interface Skipped {
  readonly skipped: number;
  /** Names what was left out, as the subject of a count: "Documents that ...". */
  readonly skippedDescription: string;
}
