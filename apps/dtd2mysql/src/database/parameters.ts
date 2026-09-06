/**
 * Every value in a statement is bound separately and databases cap how many. Postgres stops at 65535 and
 * SQLite at 32766, so a statement is written in chunks that stay under the smaller of the two.
 */
export const MAX_PARAMETERS = 30000;

/**
 * The rows of a statement binding the given number of values each, split so that no statement binds more
 * than the databases will take
 */
export function* chunks<T>(rows: readonly T[], width: number = 1): Generator<T[]> {
  const size = Math.max(1, Math.floor(MAX_PARAMETERS / Math.max(1, width)));

  for (let i = 0; i < rows.length; i += size) {
    yield rows.slice(i, i + size);
  }
}
