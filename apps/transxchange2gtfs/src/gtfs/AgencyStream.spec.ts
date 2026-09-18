import {describe, it, expect} from "vitest";
import {awaitStream} from "../testing/util";
import {AgencyStream} from "./AgencyStream";


describe("AgencyStream", () => {

  it("emits operators", async () => {
    const stream = new AgencyStream();

    stream.write({
      Operators: {
        ID: {
          OperatorCode: "Code",
          OperatorShortName: "Name",
          OperatorNameOnLicence: undefined
        }
      }
    });

    stream.end();

    return awaitStream(stream, (rows: any[]) => {
      const {agency_id, agency_name, agency_url, agency_timezone, agency_lang} = rows[0];

      // The operator code, not the document-local id: that id means nothing
      // outside the one document it is written in.
      expect(agency_id).to.equal("Code");
      expect(agency_name).to.equal("Name");
      expect(agency_url).to.equal("http://agency.com");
      expect(agency_timezone).to.equal("Europe/London");
      expect(agency_lang).to.equal("en");
    });
  });

  it("uses env vars if they are set", async () => {
    process.env.AGENCY_URL = "http://example.org";
    process.env.AGENCY_TIMEZONE = "Portugal/Lisbon";
    process.env.AGENCY_LANG = "pt";

    const stream = new AgencyStream();

    stream.write({
      Operators: {
        ID: {
          OperatorCode: "Code",
          OperatorShortName: "Name",
          OperatorNameOnLicence: undefined
        }
      }
    });

    stream.end();

    return awaitStream(stream, (rows: any[]) => {
      const {agency_id, agency_name, agency_url, agency_timezone, agency_lang} = rows[0];

      expect(agency_id).to.equal("Code");
      expect(agency_name).to.equal("Name");
      expect(agency_url).to.equal("http://example.org");
      expect(agency_timezone).to.equal("Portugal/Lisbon");
      expect(agency_lang).to.equal("pt");
    });
  });

  it("prefers the national operator code, which means the same in every document", async () => {
    const stream = new AgencyStream();

    stream.write({
      Operators: {
        tkt_oid: {
          NationalOperatorCode: "CHIL",
          OperatorCode: "CH",
          OperatorShortName: "Name",
          OperatorNameOnLicence: undefined
        }
      }
    });

    stream.end();

    return awaitStream(stream, (rows: any[]) => expect(rows[0].agency_id).to.equal("CHIL"));
  });

  it("names an operator the feed describes no further after its code", async () => {
    const stream = new AgencyStream();

    stream.write({
      Operators: {
        ID: {NationalOperatorCode: "CHIL", OperatorCode: "CH", OperatorShortName: ""}
      }
    });

    stream.end();

    return awaitStream(stream, (rows: any[]) => expect(rows[0].agency_name).to.equal("CHIL"));
  });
});

