import {describe, expect, it} from 'vitest';
import {isLockError} from "./SchemaDialect";

const error = (properties: object): Error => Object.assign(new Error("failed"), properties);

describe("isLockError", () => {

  // mysql2 and pg report in errno and code, node:sqlite in errcode, so each has to be read separately
  it.each([
    ["a MySQL deadlock", { errno: 1213, code: "ER_LOCK_DEADLOCK" }],
    ["a MySQL lock wait timeout", { errno: 1205, code: "ER_LOCK_WAIT_TIMEOUT" }],
    ["a Postgres deadlock", { code: "40P01" }],
    ["a locked SQLite file", { code: "ERR_SQLITE_ERROR", errcode: 5 }],
    ["a locked SQLite table", { code: "ERR_SQLITE_ERROR", errcode: 6 }]
  ])("waits out %s", (_, properties) => {
    expect(isLockError(error(properties))).to.equal(true);
  });

  it.each([
    ["a duplicate key", { errno: 1062, code: "ER_DUP_ENTRY" }],
    ["a value that does not fit", { code: "ERR_SQLITE_ERROR", errcode: 19 }],
    ["a Postgres constraint violation", { code: "23505" }],
    ["something that is not an error at all", {}]
  ])("does not retry %s", (_, properties) => {
    expect(isLockError(error(properties))).to.equal(false);
  });

  it("does not retry something that is not an error", () => {
    expect(isLockError("database is locked")).to.equal(false);
  });

});
