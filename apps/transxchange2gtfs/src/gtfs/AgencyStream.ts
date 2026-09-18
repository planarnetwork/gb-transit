import {AgencyRow} from "@gb-transit/gtfs-schema";
import {RowStream} from "./RowStream";
import {AGENCY} from "./TxcFeed";
import {TransXChange} from "../transxchange/TransXChange";
import {agencyId} from "./AgencyId";

/**
 * Extract the agencies from the TransXChange objects
 */
export class AgencyStream extends RowStream<TransXChange, AgencyRow> {
  public readonly file = AGENCY;

  private agenciesSeen: Record<string, boolean> = {};
  private readonly agencyUrl = process.env.AGENCY_URL || "http://agency.com";
  private readonly agencyTimezone = process.env.AGENCY_TIMEZONE || "Europe/London";
  private readonly agencyLang = process.env.AGENCY_LANG || "en";

  protected transform(data: TransXChange): void {
    for (const operatorId of Object.keys(data.Operators)) {
      const id = agencyId(data.Operators, operatorId);

      if (!this.agenciesSeen[id]) {
        const operator = data.Operators[operatorId];

        this.pushRow({
          agency_id: id,
          // A document that names an operator and describes it no further still
          // gets a name, because a route points here and a blank one reads as a
          // feed with an anonymous operator in it.
          agency_name: operator.TradingName
            || operator.OperatorNameOnLicence
            || operator.OperatorShortName
            || id,
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

}
