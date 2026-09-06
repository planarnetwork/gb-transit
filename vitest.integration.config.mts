import {defineConfig} from "vitest/config";

/**
 * The integration suite: the import run against a real database, with every row it wrote compared
 * against the same recorded expectations whichever database answered.
 *
 * DATABASE_DIALECT chooses which one. MySQL is the default because the recorded rows were taken from
 * it, and a database needing its own expectations is a bug rather than something to record.
 *
 * The feeds drop and recreate their tables in one shared database, so the files cannot run side by side.
 */
export default defineConfig({
  test: {
    include: ["apps/dtd2mysql/src/integration/**/*.spec.ts"],
    fileParallelism: false,
    testTimeout: 60000,
    hookTimeout: 60000
  }
});
