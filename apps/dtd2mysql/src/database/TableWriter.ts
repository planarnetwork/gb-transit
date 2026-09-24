import {Expression, ExpressionBuilder, Kysely, sql} from "kysely";
import {DialectName, isLockError} from "./SchemaDialect";
import {chunks, MAX_OR_TERMS} from "./parameters";
import {FieldValue, ParsedRecord, RecordAction} from "@gb-transit/feed-parser";
import {Columns} from "./Schema";

/**
 * Buffers the rows of one table and writes them out.
 *
 * The table and its columns come from the feed definitions at runtime, so this is the one place that
 * cannot be checked against the Database type. Everything it emits goes through Kysely, so the same
 * buffer works against all three databases.
 */
export class TableWriter {

  private readonly buffer = {
    [RecordAction.Insert]: [] as ParsedRecord[],
    [RecordAction.Update]: [] as ParsedRecord[],
    [RecordAction.Delete]: [] as ParsedRecord[],
    [RecordAction.DelayedInsert]: [] as ParsedRecord[],
  };

  // a record with ordered inserts has its flushes chained rather than left to interleave in the pool
  private pending: Promise<void> = Promise.resolve();

  // the declared text columns, as [name, width, fixed] - the only columns a value is changed or refused in
  private readonly text: [string, number, boolean][];

  constructor(
    private readonly db: Kysely<any>,
    private readonly dialect: DialectName,
    private readonly table: string,
    private readonly ordered: boolean = false,
    private readonly flushLimit: number = 5000,
    columns: Columns = {}
  ) {
    this.text = Object.entries(columns).flatMap(([name, { type }]) =>
      type.type === "text" ? [[name, type.length, !type.variableLength] as [string, number, boolean]] : []
    );
  }

  /**
   * Add the given row to the table
   */
  public async apply(parsed: ParsedRecord): Promise<void> {
    const row = this.fitted(parsed);

    this.buffer[row.action].push(row);

    // if it's a delayed insert, also add a delete entry
    if (row.action === RecordAction.DelayedInsert) {
      this.buffer[RecordAction.Delete].push({ ...row, action: RecordAction.Delete });
    }
    // only flush the buffer if it's not a delayed insert (as they are flushed at the end)
    else if (this.buffer[row.action].length >= this.flushLimit) {
      return this.flush(row.action);
    }
  }

  /**
   * The row as its declared columns hold it.
   *
   * A fixed width field is padded out with blanks that are how the line reaches the next field rather
   * than part of the value, and the databases disagree about them: MySQL strips them from a char column
   * when it is read, Postgres pads the value back out to the column's width and SQLite returns whatever
   * it was given. They are stripped here, which is what MySQL has always returned.
   *
   * A value wider than its column is refused rather than left to the database, which would truncate it
   * on one and refuse it on another. Truncated, it is a different value - in a key, a different row.
   */
  private fitted(row: ParsedRecord): ParsedRecord {
    if (this.text.length === 0) {
      return row;
    }

    return { ...row, values: this.fit(row.values), keysValues: this.fit(row.keysValues) };
  }

  private fit(values: { [column: string]: FieldValue }): { [column: string]: FieldValue } {
    const fitted = { ...values };

    for (const [column, width, fixed] of this.text) {
      const raw = fitted[column];

      if (typeof raw !== "string") {
        continue;
      }

      const value = fixed ? raw.trimEnd() : raw;

      if (value.length > width) {
        throw new Error(`${this.table}.${column} holds ${width} characters, and "${value}" is ${value.length}`);
      }

      fitted[column] = value;
    }

    return fitted;
  }

  /**
   * Flush everything that is left
   */
  public async close(): Promise<void> {
    await Promise.all([
      this.flush(RecordAction.Delete),
      this.flush(RecordAction.Update),
      this.flush(RecordAction.Insert)
    ]);

    await this.flush(RecordAction.DelayedInsert);
  }

  private async flush(type: RecordAction): Promise<void> {
    const rows = this.buffer[type];

    if (rows.length === 0) {
      return;
    }

    this.buffer[type] = [];

    return this.ordered
      ? this.inOrder(() => this.writeWithRetry(type, rows))
      : this.writeWithRetry(type, rows);
  }

  /**
   * Queue the write behind whatever this table is already writing, without a failure stopping the queue
   */
  private inOrder(write: () => Promise<void>): Promise<void> {
    const next = this.pending.then(write, write);

    this.pending = next.catch(() => {});

    return next;
  }

  /**
   * Locking errors happen when two tables are written at once, and are worth another go.
   *
   * The retry sends the rows again from the start, which is only safe because the whole flush is one
   * transaction: a failure leaves the database holding none of it.
   */
  private async writeWithRetry(type: RecordAction, rows: ParsedRecord[], retries: number = 3): Promise<void> {
    try {
      await this.write(type, rows);
    }
    catch (err) {
      if (isLockError(err) && retries > 0) {
        return this.writeWithRetry(type, rows, retries - 1);
      }

      throw err;
    }
  }

  /**
   * A flush is more than one statement whenever the rows bind more values than a statement may, so it
   * is written inside a transaction and either all of it lands or none of it does
   */
  private write(type: RecordAction, rows: ParsedRecord[]): Promise<void> {
    return this.db.transaction().execute(transaction => this.writeTo(transaction, type, rows));
  }

  private writeTo(db: Kysely<any>, type: RecordAction, rows: ParsedRecord[]): Promise<void> {
    switch (type) {
      case RecordAction.Insert:
      case RecordAction.DelayedInsert:
        return this.insert(db, rows);
      case RecordAction.Update:
        return this.replace(db, rows);
      case RecordAction.Delete:
        return this.remove(db, rows);
      default:
        throw new Error("Unknown record action: " + type);
    }
  }

  /**
   * Insert, leaving any row that is already there alone. Each database spells that differently, and
   * the obvious spelling of it absorbs a great deal more than that on two of them.
   *
   * MySQL's INSERT IGNORE downgrades a value that does not fit - too long, out of range, null in a
   * not null column - to a warning and stores a coerced row. SQLite's OR IGNORE skips the row and
   * says nothing. Both would hide the thing worth knowing, so each database is asked for what was
   * meant instead: this row is already here, leave it, and anything else is an error.
   */
  private async insert(db: Kysely<any>, rows: ParsedRecord[]): Promise<void> {
    for (const chunk of chunks(rows, width(rows[0]?.values))) {
      const values = chunk.map(insertable);
      const query = db.insertInto(this.table).values(values);

      switch (this.dialect) {
        case "mysql": await query.onDuplicateKeyUpdate(unchanged(values[0])).execute(); break;
        case "sqlite":
        case "postgres": await query.onConflict(conflict => conflict.doNothing()).execute(); break;
      }
    }
  }

  /**
   * Replace the rows that clash with these ones.
   *
   * MySQL's REPLACE and SQLite's INSERT OR REPLACE delete whatever clashes and insert a new row, which
   * gives it a new id. Postgres has no equivalent, ON CONFLICT DO UPDATE keeps the existing row and its
   * id, so the delete and the insert are spelled out here and every database ends up with the same rows.
   */
  private async replace(db: Kysely<any>, rows: ParsedRecord[]): Promise<void> {
    const latest = lastPerKey(rows);

    await this.remove(db, latest);
    await this.insert(db, latest);
  }

  private async remove(db: Kysely<any>, rows: ParsedRecord[]): Promise<void> {
    const maxRows = this.dialect === "sqlite" ? MAX_OR_TERMS : Infinity;

    for (const chunk of chunks(rows, width(rows[0]?.keysValues), maxRows)) {
      await db
        .deleteFrom(this.table)
        .where(eb => eb.or(chunk.map(row => this.matches(eb, row))))
        .execute();
    }
  }

  /**
   * Match a row on the key the feed identifies it by.
   *
   * A null is matched with IS NULL, as `column = null` is unknown rather than true on all three
   * databases: the row would not be found, and the revision meant to replace it would land beside it
   * rather than over it. 17 of the declared key columns are nullable.
   */
  private matches(eb: ExpressionBuilder<any, any>, row: ParsedRecord) {
    const conditions = Object.entries(row.keysValues).map(([column, value]) =>
      value === null || value === undefined ? eb(column, "is", null) : eb(column, "=", value)
    );

    if (conditions.length === 0) {
      throw new Error(`${this.table} has no key, so there is nothing to match a delete on`);
    }

    return eb.and(conditions);
  }

}

/**
 * Setting a column to itself, which is how MySQL is told that a duplicate is not an error. It has no
 * DO NOTHING, and the alternative spelling absorbs far more than it is being asked to.
 */
function unchanged(row: { [column: string]: unknown }): { [column: string]: Expression<unknown> } {
  const [column] = Object.keys(row);

  return { [column]: sql.ref(column) };
}

/**
 * How many values a row of the given kind binds. An insert binds the values, a delete only the key.
 */
function width(values: object | undefined): number {
  return Object.keys(values ?? {}).length;
}

/**
 * The last row of each key.
 *
 * Where one flush holds two revisions of a key the second is the one that survives, as it would under
 * REPLACE. A delete and an insert of both would keep the first: the delete takes out whatever was
 * stored and the insert then leaves the row it just wrote alone.
 */
function lastPerKey(rows: ParsedRecord[]): ParsedRecord[] {
  const latest = new Map<string, ParsedRecord>();

  for (const row of rows) {
    latest.set(JSON.stringify(row.keysValues), row);
  }

  return [...latest.values()];
}

/**
 * The values to write. The id is dropped when the database generates it, as MySQL takes a null there but
 * Postgres rejects one.
 */
function insertable(row: ParsedRecord): { [column: string]: unknown } {
  if (row.values.id !== null && row.values.id !== undefined) {
    return row.values;
  }

  const { id, ...rest } = row.values;

  return rest;
}
