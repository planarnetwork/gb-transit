import {ExpressionBuilder, Kysely} from "kysely";
import {DialectName, getErrorCode, getErrorNumber} from "./SchemaDialect";
import {chunks} from "./parameters";
import {ParsedRecord, RecordAction} from "@gb-transit/feed-parser";

const MYSQL_DEADLOCK = 1213;
const POSTGRES_DEADLOCK = "40P01";

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

  constructor(
    private readonly db: Kysely<any>,
    private readonly dialect: DialectName,
    private readonly table: string,
    private readonly ordered: boolean = false,
    private readonly flushLimit: number = 5000
  ) {}

  /**
   * Add the given row to the table
   */
  public async apply(row: ParsedRecord): Promise<void> {
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
   * Locking errors happen when two tables are written at once, and are worth another go
   */
  private async writeWithRetry(type: RecordAction, rows: ParsedRecord[], retries: number = 3): Promise<void> {
    try {
      await this.write(type, rows);
    }
    catch (err) {
      if (isDeadlock(err) && retries > 0) {
        return this.writeWithRetry(type, rows, retries - 1);
      }

      throw err;
    }
  }

  private write(type: RecordAction, rows: ParsedRecord[]): Promise<void> {
    switch (type) {
      case RecordAction.Insert:
      case RecordAction.DelayedInsert:
        return this.insert(this.db, rows);
      case RecordAction.Update:
        return this.replace(rows);
      case RecordAction.Delete:
        return this.remove(this.db, rows);
      default:
        throw new Error("Unknown record action: " + type);
    }
  }

  /**
   * Insert, leaving any row that is already there alone. Each database spells that differently.
   */
  private async insert(db: Kysely<any>, rows: ParsedRecord[]): Promise<void> {
    for (const chunk of this.chunks(rows)) {
      const query = db.insertInto(this.table).values(chunk.map(insertable));

      switch (this.dialect) {
        case "mysql": await query.ignore().execute(); break;
        case "sqlite": await query.orIgnore().execute(); break;
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
  private async replace(rows: ParsedRecord[]): Promise<void> {
    await this.db.transaction().execute(async transaction => {
      await this.remove(transaction, rows);
      await this.insert(transaction, rows);
    });
  }

  private async remove(db: Kysely<any>, rows: ParsedRecord[]): Promise<void> {
    for (const chunk of this.chunks(rows)) {
      await db
        .deleteFrom(this.table)
        .where(eb => eb.or(chunk.map(row => this.matches(eb, row))))
        .execute();
    }
  }

  /**
   * Match a row on the key the feed identifies it by
   */
  private matches(eb: ExpressionBuilder<any, any>, row: ParsedRecord) {
    const conditions = Object.entries(row.keysValues).map(([column, value]) => eb(column, "=", value));

    if (conditions.length === 0) {
      throw new Error(`${this.table} has no key, so there is nothing to match a delete on`);
    }

    return eb.and(conditions);
  }

  /**
   * Split the rows so that no statement binds more values than the database will take
   */
  private chunks(rows: ParsedRecord[]): Generator<ParsedRecord[]> {
    return chunks(rows, Object.keys(rows[0]?.values ?? {}).length);
  }

}

/**
 * The values to write. The id is dropped when the database generates it, as MySQL takes a null there but
 * Postgres rejects one.
 */
function insertable(row: ParsedRecord): { [column: string]: unknown } {
  const { id, ...rest } = row.values;

  return id === null || id === undefined ? rest : { id, ...rest };
}

function isDeadlock(err: unknown): boolean {
  return getErrorNumber(err) === MYSQL_DEADLOCK || getErrorCode(err) === POSTGRES_DEADLOCK;
}
