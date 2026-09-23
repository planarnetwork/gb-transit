import {describe, it, expect} from "vitest";
import {awaitStream} from "../testing/util";
import {LocalDate} from "@js-joda/core";
import {RoutesStream} from "./RoutesStream";


describe("RoutesStream", () => {

  it("emits rail routes with route_type 2", async () => {
    const stream = new RoutesStream();

    stream.write({
      Operators: {"OId_DLR": {NationalOperatorCode: "DLRL", OperatorCode: "DLR"}},
      Services: {
        "25-DLR-_-y05-216": {
          "Description": "Bank - Beckton",
          "Lines": { "l_DLR": { "LineName": "DLR", "Description": "" } },
          "Mode": "rail",
          "OperatingPeriod": {
            "EndDate": LocalDate.parse("2099-12-31"),
            "StartDate": LocalDate.parse("2018-06-24")
          },
          "RegisteredOperatorRef": "OId_DLR",
          "ServiceCode": "25-DLR-_-y05-216"
        }
      }
    });

    stream.end();

    return awaitStream(stream, (rows: any[]) => {
      const {route_id, route_type} = rows[0];

      expect(route_id).to.equal("25-DLR-_-y05-216|l_DLR");
      expect(route_type).to.equal(2);
    });
  });

  it("falls back to the document's own operator id when there is no code", async () => {
    const stream = new RoutesStream();

    stream.write({
      Services: {
        "S1": {
          "Description": "",
          "Lines": {"l1": {"LineName": "1", "Description": ""}},
          "Mode": "bus",
          "OperatingPeriod": {
            "EndDate": LocalDate.parse("2099-12-31"),
            "StartDate": LocalDate.parse("2018-06-24")
          },
          "RegisteredOperatorRef": "OP1",
          "ServiceCode": "S1"
        }
      }
    });

    stream.end();

    return awaitStream(stream, (rows: any[]) => expect(rows[0].agency_id).to.equal("OP1"));
  });

  it("emits routes", async () => {
    const stream = new RoutesStream();

    stream.write({
      Operators: {"OId_MEGA": {NationalOperatorCode: "MEGA", OperatorCode: "MG"}},
      Services: {
        "M6_MEGA": {
          "Description": "Falmouth - Victoria,London",
          "Lines": {
            "l_M6_MEGA": { "LineName": "M6", "Description": "" }
          },
          "Mode": "coach",
          "OperatingPeriod": {
            "EndDate": LocalDate.parse("2099-12-31"),
            "StartDate": LocalDate.parse("2018-06-24")
          },
          "RegisteredOperatorRef": "OId_MEGA",
          "ServiceCode": "M6_MEGA"
        }
      }
    });

    stream.end();

    return awaitStream(stream, (rows: any[]) => {
      const {route_id, agency_id, route_short_name, route_long_name, route_type} = rows[0];

      expect(route_id).to.equal("M6_MEGA|l_M6_MEGA");
      expect(agency_id).to.equal("MEGA");
      expect(route_short_name).to.equal("M6");
      expect(route_long_name).to.equal("Falmouth - Victoria,London");
      // A coach is the extended route type for one, not a bus.
      expect(route_type).to.equal(200);
    });
  });

});

