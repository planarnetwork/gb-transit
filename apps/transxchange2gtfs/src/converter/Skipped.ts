/**
 * A stage of the pipeline that can leave something out.
 *
 * Reading a dataset is deliberately forgiving, so each stage that swallows
 * something counts it and `Converter` reports the total when the feed is built.
 */
export interface Skipped {
  readonly skipped: number;
  /** Names what was left out, as the subject of a count: "Documents that ...". */
  readonly skippedDescription: string;
}
