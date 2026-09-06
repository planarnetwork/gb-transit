import {defineProject} from "vitest/config";

/**
 * Every workspace gets the same vitest project shape, named after the package so
 * a failure is attributed to a package rather than to the repository.
 *
 * Two places, because a spec is one of two things. Beside its source it is a
 * unit test of the file it is named after. In `test/` it is an end to end test
 * of the package as a whole - a golden feed, a public surface - which is named
 * for what it checks rather than for a file, and has no business sitting in
 * `src/` where it would be compiled and published.
 *
 * Anything spanning more than one package goes in the repository's own `tests/`.
 */
export function project(name: string) {
  return defineProject({
    test: {
      name,
      // .mts for a test that needs import.meta, which a package emitting
      // CommonJS cannot use in a .ts file
      include: [
        "src/**/*.spec.ts", "src/**/*.spec.mts",
        "test/**/*.spec.ts", "test/**/*.spec.mts"
      ],
      // the integration suite needs a database, so it is a separate run - see
      // vitest.integration.config.mts
      exclude: ["src/integration/**"]
    }
  });
}
