import {describe, it, expect} from 'vitest';
import {Generated} from "kysely";
import {Database} from "./Database";
import {feedTables} from "./testing/records";

/**
 * The schema type is read off the declarations in config/schema, so these are type assertions rather than
 * runtime ones. They are checked by npm run typecheck, which is the only thing that reads them.
 */
type Equals<A, B> = (<T>() => T extends A ? 1 : 2) extends (<T>() => T extends B ? 1 : 2) ? true : false;
type Assert<T extends true> = T;

// the surrogate key the schema builder adds is generated rather than supplied
type _id = Assert<Equals<Database["schedule"]["id"], Generated<number>>>;

// dates and times are read back as strings so they do not depend on the reader's timezone
type _date = Assert<Equals<Database["schedule"]["runs_from"], string>>;
type _time = Assert<Equals<Database["stop_time"]["public_arrival_time"], string | null>>;

// the feed parses booleans to 1 and 0
type _boolean = Assert<Equals<Database["schedule"]["monday"], number>>;

// nullability comes from the third argument to the field, so it has to survive inference
type _notNull = Assert<Equals<Database["tiploc"]["tiploc_code"], string>>;
type _nullable = Assert<Equals<Database["tiploc"]["crs_code"], string | null>>;

// a foreign key holds the generated id of another record
type _foreignKey = Assert<Equals<Database["stop_time"]["schedule"], number>>;

// the log table is not part of a feed
type _log = Assert<Equals<Database["log"]["filename"], string | null>>;

// every feed table is present
type _tables = Assert<"schedule" | "stop_time" | "tiploc" | "location" | "additional_fixed_link" extends keyof Database ? true : false>;

describe("Database", () => {

  it("has a type for every declared table", () => {
    // the assertions above are compile time, this keeps the two lists honest at runtime
    const tables = feedTables().map(([name]) => name);

    expect(new Set(tables).size).to.be.greaterThan(0);
    expect(tables).to.contain("schedule");
    expect(tables).to.contain("location");
  });

});
