import {AgencyRow} from "@gb-transit/gtfs-schema";
import {RowStream} from "./RowStream";
import {AGENCY} from "./TxcFeed";
import {TransXChange} from "../transxchange/TransXChange";
import {agencyId} from "./AgencyId";

/**
 * The language of the feed, shared with feed_info.txt: a feed whose feed_lang
 * and agency_lang disagree is a warning in the validator. A function rather than
 * a constant so the environment is read when the feed is built, not when the
 * module is loaded.
 */
export function agencyLang(): string {
  return process.env.AGENCY_LANG || "en";
}

/**
 * Extract the agencies from the TransXChange objects
 */
export class AgencyStream extends RowStream<TransXChange, AgencyRow> {
  public readonly file = AGENCY;

  private agenciesSeen: Record<string, boolean> = {};
  private readonly agencyUrl = process.env.AGENCY_URL || "http://agency.com";
  private readonly agencyTimezone = process.env.AGENCY_TIMEZONE || "Europe/London";
  private readonly agencyLang = agencyLang();

  protected transform(data: TransXChange): void {
    for (const operatorId of Object.keys(data.Operators)) {
      const operator = data.Operators[operatorId];

      // An operator the document describes no further still gets a name: a route
      // points here, and a blank one reads as an anonymous operator.
      this.addAgency(agencyId(data.Operators, operatorId), operator.TradingName
        || operator.OperatorNameOnLicence
        || operator.OperatorShortName);
    }

    // A service may name an operator the document never declares, leaving the
    // route pointing at an agency that is not in the feed. GTFS calls that an
    // error, so the agency is written from the only thing known of it.
    for (const service of Object.values(data.Services ?? {})) {
      this.addAgency(agencyId(data.Operators, service.RegisteredOperatorRef));
    }
  }

  private addAgency(id: string, name?: string): void {
    if (!this.agenciesSeen[id]) {
      this.pushRow({
        agency_id: id,
        agency_name: name || id,
        agency_url: this.agencyUrl,
        agency_timezone: this.agencyTimezone,
        agency_lang: this.agencyLang,
        agency_phone: "",
        agency_fare_url: ""
      });

      this.agenciesSeen[id] = true;
    }
  }

}
