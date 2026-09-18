/**
 * Every value in a statement is bound separately and databases cap how many. Postgres stops at 65535 and
 * SQLite at 32766, so a statement is written in chunks that stay under the smaller of the two.
 */
export const MAX_PARAMETERS = 30000;

/**
 * A statement that matches each row separately ORs a bracketed group per row, and SQLite parses that as
 * a tree it refuses beyond a depth of 1000 - which a two column key reaches at 999 rows, well inside the
 * parameter limit. Capping the rows of such a statement is the only thing that keeps it under.
 */
export const MAX_OR_TERMS = 500;

/**
 * The rows of a statement binding the given number of values each, split so that no statement binds more
 * than the databases will take, and holds no more rows than the caller allows
 */
export function* chunks<T>(rows: readonly T[], width: number = 1, maxRows: number = Infinity): Generator<T[]> {
  const size = Math.max(1, Math.min(maxRows, Math.floor(MAX_PARAMETERS / Math.max(1, width))));

  for (let i = 0; i < rows.length; i += size) {
    yield rows.slice(i, i + size);
  }
}
