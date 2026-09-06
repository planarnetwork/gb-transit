import {describe, it, expect, beforeEach} from "vitest";
import {Kysely} from "kysely";
import {RouteType} from "@gb-transit/gtfs";
import {KyselyTimetableSource} from "./KyselyTimetableSource";
import {NodeSqliteDialect} from "../database/NodeSqliteDriver";
import {SchemaBuilder, createLogSchema} from "../database/SchemaBuilder";
import {sqliteSchemaDialect} from "../database/dialect";
import timetable from "../database/schema/timetable";
import {Database} from "../database/Database";

/**
 * The source against a real database.
 *
 * SQLite is the one of the three that needs no server, so it is what runs here. Every statement the
 * source builds is dialect neutral, so a query that runs here compiles for the other two as well - the
 * integration suite is what runs the same expectations against MySQL and Postgres.
 *
 * The point of these is the SQL rather than the shaping: the queries that did not translate were a
 * MySQL-only null safe equals, an IF, a bare GROUP BY and a pair of codes compared glued together, and
 * each of them is exercised below.
 */
describe("KyselyTimetableSource", () => {
  let db: Kysely<Database>;

  const range = {
    from: Temporal.PlainDate.from("2024-01-01"),
    to: Temporal.PlainDate.from("2024-04-01")
  };

  const source = () => new KyselyTimetableSource(db, {}, range);

  beforeEach(async () => {
    db = new Kysely<any>({dialect: new NodeSqliteDialect(":memory:")});

    for (const [name, table] of Object.entries(timetable)) {
      await new SchemaBuilder(db as Kysely<any>, sqliteSchemaDialect, name, table).createSchema();
    }

    await createLogSchema(db, sqliteSchemaDialect);
  });

  /**
   * Reading has RDNGSTN rated 2 and RDNGORJ rated 9, the junction that shares its code. Grouping alone
   * keeps whichever row came first, which is what published the junction's TIPLOC for 75 stations - and
   * the TIPLOC is what the ATCO stop_id is built from, so the wrong row is a wrong stop.
   */
  async function twoTiplocsForOneCrs(): Promise<void> {
    await db.insertInto("physical_station").values([
      station({tiploc_code: "RDNGORJ", crs_code: "RDG", cate_interchange_status: 9}),
      station({tiploc_code: "RDNGSTN", crs_code: "RDG", cate_interchange_status: 2})
    ] as any).execute();
  }

  it("prefers the station over the subsidiary location sharing its code", async () => {
    await twoTiplocsForOneCrs();

    const stops = await source().getStops();

    expect(stops.length).to.equal(1);
    expect(stops[0].tiploc).to.equal("RDNGSTN");
  });

  // the null a MySQL <=> 9 treats as "not 9", which a plain = would drop
  it("keeps a station whose interchange status is not set", async () => {
    await db.insertInto("physical_station").values([
      station({tiploc_code: "ABCDEFG", crs_code: "ABC", cate_interchange_status: null})
    ] as any).execute();

    const stops = await source().getStops();

    expect(stops.map(stop => stop.crs)).to.deep.equal(["ABC"]);
  });

  it("returns one transfer per interchange station, chosen the same way as the stop", async () => {
    await twoTiplocsForOneCrs();

    const transfers = await source().getTransfers();

    expect(transfers.length).to.equal(1);
    expect(transfers[0].from_stop_id).to.equal("RDG");
    expect(transfers[0].to_stop_id).to.equal("RDG");
    // minutes in the feed, seconds in the output
    expect(transfers[0].min_transfer_time).to.equal(300);
  });

  it("reports the last imported file as the feed version", async () => {
    expect(await source().getFeedVersion()).to.equal(null);

    await db.insertInto("log").values({filename: "RJTTF923.ZIP", processed: "2024-01-02 03:04:05"}).execute();

    expect(await source().getFeedVersion()).to.equal("RJTTF923.ZIP");
  });

  /**
   * The fallback matched on CONCAT(origin, destination), so a pair of codes that glue together into the
   * same string as another pair suppressed it. Three character codes cannot collide, but a code shorter
   * than three does occur once the fixed width padding is stripped. Matched on the pair, both survive.
   */
  it("does not let one fixed link suppress another whose codes concatenate the same way", async () => {
    await db.insertInto("physical_station").values([
      station({tiploc_code: "AAAAAAA", crs_code: "AB", cate_interchange_status: 1}),
      station({tiploc_code: "BBBBBBB", crs_code: "CDE", cate_interchange_status: 1})
    ] as any).execute();

    await db.insertInto("additional_fixed_link").values([{
      mode: "WALK", duration: 5, origin: "AB", destination: "CDE", priority: 1,
      start_time: "00:00:00", end_time: "23:59:59",
      start_date: "2024-01-01", end_date: "2038-01-19",
      monday: 1, tuesday: 1, wednesday: 1, thursday: 1, friday: 1, saturday: 1, sunday: 1
    }] as any).execute();

    // concatenates to "ABCDE", exactly as the additional link above does
    await db.insertInto("fixed_link").values([
      {mode: "BUS", duration: 9, origin: "ABC", destination: "DE"}
    ] as any).execute();

    const links = await source().getFixedLinks();
    const pairs = links.map(link => `${link.from_stop_id}-${link.to_stop_id}`).sort();

    // both links, each in both directions
    expect(pairs).to.deep.equal(["AB-CDE", "ABC-DE", "CDE-AB", "DE-ABC"]);
  });

  it("says the timetable is empty rather than exporting nothing", async () => {
    await expect(source().getSchedules()).rejects.toThrow(/schedule table is empty/);
  });

  /**
   * train_status "S" is published as train_category "SS", which the builder reads as a ferry rather
   * than the rail the "OO" category would have given. That mapping was an IF, which only MySQL has.
   */
  it("reads a schedule and its stop times, mapping a ship to a ferry", async () => {
    await db.insertInto("physical_station").values([
      station({tiploc_code: "PORTSMH", crs_code: "PMH", cate_interchange_status: 1})
    ] as any).execute();

    await db.insertInto("schedule").values([{
      train_uid: "W12345", runs_from: "2024-01-01", runs_to: "2024-03-01",
      monday: 1, tuesday: 1, wednesday: 1, thursday: 1, friday: 1, saturday: 1, sunday: 1,
      bank_holiday_running: 0, course_indicator: "1",
      stp_indicator: "P", train_category: "OO", train_status: "S", train_class: "S", reservations: null
    }] as any).execute();

    await db.insertInto("stop_time").values([{
      schedule: 1, location: "PORTSMH", suffix: null,
      public_arrival_time: "09:00:00", public_departure_time: "09:01:00",
      scheduled_arrival_time: "09:00:00", scheduled_departure_time: "09:01:00",
      scheduled_pass_time: null, platform: "1", activity: "TB"
    }] as any).execute();

    const results = await source().getSchedules();

    expect(results.schedules.length).to.equal(1);
    expect(results.schedules[0].mode).to.equal(RouteType.Ferry);
    expect(results.schedules[0].stopTimes.length).to.equal(1);
  });

  it("drops the locations a service passes through without stopping", async () => {
    await db.insertInto("physical_station").values([
      station({tiploc_code: "PORTSMH", crs_code: "PMH", cate_interchange_status: 1}),
      station({tiploc_code: "HAVANT0", crs_code: "HAV", cate_interchange_status: 1})
    ] as any).execute();

    await db.insertInto("schedule").values([{
      train_uid: "W12345", runs_from: "2024-01-01", runs_to: "2024-03-01",
      monday: 1, tuesday: 1, wednesday: 1, thursday: 1, friday: 1, saturday: 1, sunday: 1,
      bank_holiday_running: 0, course_indicator: "1",
      stp_indicator: "P", train_category: "OO", train_status: "P", train_class: "S", reservations: null
    }] as any).execute();

    await db.insertInto("stop_time").values([
      {
        schedule: 1, location: "PORTSMH", suffix: null,
        public_arrival_time: "09:00:00", public_departure_time: "09:01:00",
        scheduled_arrival_time: "09:00:00", scheduled_departure_time: "09:01:00",
        scheduled_pass_time: null, platform: "1", activity: "TB"
      },
      {
        schedule: 1, location: "HAVANT0", suffix: null,
        public_arrival_time: null, public_departure_time: null,
        scheduled_arrival_time: null, scheduled_departure_time: null,
        scheduled_pass_time: "09:10:00", platform: "2", activity: ""
      }
    ] as any).execute();

    const kept = await new KyselyTimetableSource(db, {}, range, true).getSchedules();
    expect(kept.schedules[0].stopTimes.length).to.equal(1);

    const all = await new KyselyTimetableSource(db, {}, range, false).getSchedules();
    expect(all.schedules[0].stopTimes.length).to.equal(2);
  });

});

/**
 * A physical station row, with the columns the MSN gives every station and the schema requires
 */
function station(overrides: {[column: string]: unknown}) {
  return {
    station_name: "Somewhere", tiploc_code: "AAAAAAA", crs_reference_code: "AAA", crs_code: "AAA",
    easting: 14000, northing: 61000, cate_interchange_status: 1, minimum_change_time: 5,
    ...overrides
  };
}
