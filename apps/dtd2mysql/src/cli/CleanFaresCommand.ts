
import {Temporal} from "temporal-polyfill";
import {Kysely} from "kysely";
import {CLICommand} from "./CLICommand";
import {asFaresDatabase, Database} from "../database/Database";
import {SchemaBuilder} from "../database/SchemaBuilder";
import {SchemaDialect} from "../database/SchemaDialect";
import {network_flow_restriction} from "../database/schema/derived";

const NETWORK_FLOW_RESTRICTION = "network_flow_restriction";

/**
 * The tickets a network area restriction is worked out from
 */
const NETWORK_TICKET_CODES = ["CDR", "CDS", "ODT", "SVR", "SVS"];

/**
 * The fares the feed uses to mean "no fare", which are removed rather than quoted
 */
const NO_FARE = 99999;
const NO_FARE_MINIMUM = 999999;

/**
 * Every table holding rows that expire. They all carry the end date the feed gave them.
 */
export const EXPIRING_TABLES = [
  "ticket_type",
  "location",
  "location_group_member",
  "status_discount",
  "status",
  "route_location",
  "route",
  "non_standard_discount",
  "railcard",
  "location_railcard",
  "railcard_minimum_fare",
  "non_derivable_fare_override"
] as const;

/**
 * The restriction tables whose short form MMDD dates are turned into real ones
 */
const RESTRICTION_DATE_TABLES = [
  "restriction_time_date",
  "restriction_ticket_calendar",
  "restriction_train_date",
  "restriction_header_date"
] as const;

/**
 * The London Underground zone each of these locations is in, which the feed does not say
 */
const LUL_ZONES = [
  { nlc: "0027", zone: { lul_zone_1: 1 } },
  { nlc: "0028", zone: { lul_zone_2: 1 } },
  { nlc: "0029", zone: { lul_zone_3: 1 } },
  { nlc: "0030", zone: { lul_zone_4: 1 } },
  { nlc: "0031", zone: { lul_zone_5: 1 } },
  { nlc: "0071", zone: { lul_zone_6: 1 } }
];

/**
 * How many people each railcard covers, which the feed also does not say
 */
const RAILCARD_PASSENGERS = [
  { railcard_code: "YNG", min_adults: 1, max_adults: 1, min_children: 0, max_children: 0, max_passengers: 1 },
  { railcard_code: "TST", min_adults: 1, max_adults: 1, min_children: 0, max_children: 0, max_passengers: 1 },
  { railcard_code: "DIS", min_adults: 1, max_adults: 2, min_children: 0, max_children: 0, max_passengers: 2 },
  { railcard_code: "DIC", min_adults: 1, max_adults: 1, min_children: 1, max_children: 1, max_passengers: 2 },
  { railcard_code: "FAM", min_adults: 1, max_adults: 4, min_children: 1, max_children: 4, max_passengers: 8 },
  { railcard_code: "HMF", min_adults: 1, max_adults: 1, min_children: 0, max_children: 4, max_passengers: 5 },
  { railcard_code: "NGC", min_adults: 1, max_adults: 4, min_children: 0, max_children: 4, max_passengers: 8 },
  { railcard_code: "NEW", min_adults: 1, max_adults: 4, min_children: 0, max_children: 4, max_passengers: 8 },
  { railcard_code: "SRN", min_adults: 1, max_adults: 1, min_children: 0, max_children: 0, max_passengers: 1 },
  { railcard_code: "2TR", min_adults: 2, max_adults: 2, min_children: 0, max_children: 0, max_passengers: 2 },
  { railcard_code: "GS3", min_adults: 3, max_adults: 9, min_children: 0, max_children: 0, max_passengers: 9 },
  { railcard_code: "JCP", min_adults: 1, max_adults: 1, min_children: 0, max_children: 0, max_passengers: 1 },
  { railcard_code: "", min_adults: 0, max_adults: 9, min_children: 0, max_children: 9, max_passengers: 9 }
];

export class CleanFaresCommand implements CLICommand {

  constructor(
    private readonly db: Kysely<Database>,
    private readonly schemaDialect: SchemaDialect,
    // the cut off is worked out here rather than by the database, as CURDATE() made the result depend on
    // which machine ran the clean up and could not be pinned in a test
    private readonly today: Temporal.PlainDate = Temporal.Now.plainDateISO()
  ) {}

  public async run(argv: string[]): Promise<void> {
    try {
      await this.doClean();
    }
    catch (err) {
      console.error(err);
    }

    await this.end();
  }

  /**
   * Clean out expired data, work out the network area restrictions and turn the short form restriction
   * dates into real ones.
   *
   * These used to run at the same time as each other, which left it open whether a fare had been removed
   * before or after the restrictions were worked out from it. They are run in order instead, which also
   * takes away the deadlocks they used to retry through.
   */
  public async doClean(): Promise<void> {
    await this.setNetworkAreaRestrictionCodes();
    await this.clean();
    await this.applyRestrictionDates();
  }

  /**
   * Remove everything that has expired and apply what the feed leaves out
   */
  private async clean(): Promise<void> {
    const today = this.today.toString();

    for (const table of EXPIRING_TABLES) {
      await this.db.deleteFrom(table).where("end_date", "<", today).execute();
    }

    await this.db
      .updateTable("non_derivable_fare_override")
      .set({ adult_fare: null })
      .where(eb => eb.or([eb("adult_fare", "=", NO_FARE), eb("adult_fare", ">=", NO_FARE_MINIMUM)]))
      .execute();

    await this.db
      .updateTable("non_derivable_fare_override")
      .set({ child_fare: null })
      .where(eb => eb.or([eb("child_fare", "=", NO_FARE), eb("child_fare", ">=", NO_FARE_MINIMUM)]))
      .execute();

    // location is declared by the routeing feed as well, so the fares columns are only in view once the
    // connection is read as a fares one
    for (const { nlc, zone } of LUL_ZONES) {
      await asFaresDatabase(this.db).updateTable("location").set(zone).where("nlc", "=", nlc).execute();
    }

    for (const { railcard_code, ...passengers } of RAILCARD_PASSENGERS) {
      await this.db
        .updateTable("railcard")
        .set(passengers)
        .where("railcard_code", "=", railcard_code)
        .execute();
    }

    await this.db
      .updateTable("status_discount")
      .set({ discount_indicator: "X" })
      .where("status_code", "!=", "000")
      .where("status_code", "!=", "001")
      .where("discount_percentage", "=", 0)
      .execute();

    console.log("Removed old and irrelevant fares data");
  }

  /**
   * Record which restriction applies to each origin, destination and route.
   *
   * This used to be a GROUP BY that left direction and restriction_code off it, which MySQL allows and
   * answers by picking a row of its choosing. Postgres rejects it outright, so the fare each group takes
   * its values from is chosen here rather than left to the database.
   */
  private async setNetworkAreaRestrictionCodes(): Promise<void> {
    await this.db
      .deleteFrom("fare")
      .where(eb => eb.or([eb("fare", "<", 5), eb("fare", "=", NO_FARE), eb("fare", ">=", NO_FARE_MINIMUM)]))
      .execute();

    const schema = new SchemaBuilder(
      this.db, this.schemaDialect, NETWORK_FLOW_RESTRICTION, network_flow_restriction
    );

    await schema.dropSchema();
    await schema.createSchema();

    await this.db
      .insertInto(NETWORK_FLOW_RESTRICTION)
      .columns(["origin", "destination", "route_code", "direction", "restriction_code"])
      .expression(
        this.restrictedFares()
          .where("fare.id", "in", this.oneFarePerFlow())
          .select([
            "flow.origin_code as origin",
            "flow.destination_code as destination",
            "flow.route_code as route_code",
            "flow.direction as direction",
            // the fares without one are filtered out, so this is only nullable to the type
            eb => eb.ref("fare.restriction_code").$notNull().as("restriction_code")
          ])
      )
      .execute();

    console.log("Calculated network area restrictions");
  }

  /**
   * The fares carrying a restriction on a ticket a network area restriction is worked out from
   */
  private restrictedFares() {
    return this.db
      .selectFrom("flow")
      .innerJoin("fare", "fare.flow_id", "flow.flow_id")
      .where("fare.ticket_code", "in", NETWORK_TICKET_CODES)
      .where("fare.restriction_code", "is not", null);
  }

  /**
   * One fare per origin, destination and route, so that the row the values come from is the same one
   * whichever database answers the query
   */
  private oneFarePerFlow() {
    return this.restrictedFares()
      .select(eb => eb.fn.min("fare.id").as("id"))
      .groupBy(["flow.origin_code", "flow.destination_code", "flow.route_code"]);
  }

  /**
   * The restriction tables hold a short form MMDD range, which is only a real date once it is read
   * against the year the restriction date record gives
   */
  private async applyRestrictionDates(): Promise<void> {
    const [current, future] = await this.db
      .selectFrom("restriction_date")
      .select(["cf_mkr", "start_date"])
      .orderBy("cf_mkr")
      .execute();

    if (!current || !future) {
      console.log("No restriction dates to apply");

      return;
    }

    for (const table of RESTRICTION_DATE_TABLES) {
      await this.updateRestrictionDatesOnTable(
        table, this.startOfYear(current.start_date), this.startOfYear(future.start_date)
      );
    }

    console.log("Applied restriction dates");
  }

  /**
   * The dates a row works out to are decided by three of its columns, so the rows are updated a
   * distinct combination at a time rather than a row at a time.
   *
   * A feed has many rows and few combinations - four across a hundred thousand rows - so this is
   * four statements per table, and the ids never have to be read, held or sent back.
   */
  private async updateRestrictionDatesOnTable(
    table: typeof RESTRICTION_DATE_TABLES[number],
    current: Temporal.PlainDate,
    future: Temporal.PlainDate
  ): Promise<void> {
    const combinations = await this.db
      .selectFrom(table)
      .select(["cf_mkr", "date_from", "date_to"])
      .distinct()
      .execute();

    for (const { cf_mkr, date_from, date_to } of combinations) {
      const earliestDate = cf_mkr === "C" ? current : future;
      const startDate = this.getFirstDateAfter(earliestDate, date_from);
      const endDate = startDate && this.getFirstDateAfter(startDate, date_to);

      if (!startDate || !endDate || Temporal.PlainDate.compare(startDate, endDate) > 0) {
        console.log(`Invalid dates on ${table}: ${date_from}, ${date_to} after ${earliestDate.toString()}`);
        continue;
      }

      await this.db
        .updateTable(table)
        .set({ start_date: startDate.toString(), end_date: endDate.toString() })
        .where("cf_mkr", "=", cf_mkr)
        .where("date_from", "=", date_from)
        .where("date_to", "=", date_to)
        .execute();
    }
  }

  /**
   * The 1st of January in the year of the given date
   */
  private startOfYear(date: string): Temporal.PlainDate {
    return Temporal.PlainDate.from(date).with({ month: 1, day: 1 });
  }

  /**
   * Given a short form restriction month MMDD this method will return the first instance of that date that occurs
   * after the given date. For example with a restriction date of 2017-06-01 the earliest date of 0301 is 2018-03-01.
   *
   * Returns undefined when the restriction month is not a real date in the resulting year - 0229 outside a leap
   * year, say. moment returned an invalid date for those and the caller tested isValid(); Temporal rejects them.
   */
  private getFirstDateAfter(earliestDate: Temporal.PlainDate, restrictionMonth: string): Temporal.PlainDate | undefined {
    const month = +restrictionMonth.slice(0, 2);
    const day = +restrictionMonth.slice(2);
    const yearOffset = (earliestDate.month > month || (earliestDate.month === month && earliestDate.day > day)) ? 1 : 0;

    try {
      return Temporal.PlainDate.from({ year: earliestDate.year + yearOffset, month, day }, { overflow: "reject" });
    }
    catch {
      return undefined;
    }
  }

  /**
   * Close the underlying database connection
   */
  public async end(): Promise<void> {
    await this.db.destroy();
  }

}
