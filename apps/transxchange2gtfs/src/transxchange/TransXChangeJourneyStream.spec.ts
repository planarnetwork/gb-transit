import {describe, it, expect} from "vitest";
import {awaitStream} from "../testing/util";
import {Duration, LocalDate, LocalTime} from "@js-joda/core";
import {StopActivity} from "../transxchange/TransXChange";
import {
  BankHolidays,
  TransXChangeJourney,
  TransXChangeJourneyStream
} from "../transxchange/TransXChangeJourneyStream";


describe("TransXChangeJourneyStream", () => {
  const transxchange = {
    Services: {
      "M6_MEGA": {
        "Description": "Falmouth - Victoria,London",
        "Lines": {
          "l_M6_MEGA": "M6"
        },
        "Mode": "coach",
        "OperatingPeriod": {
          "EndDate": LocalDate.parse("2099-12-31"),
          "StartDate": LocalDate.parse("2018-06-24")
        },
        "RegisteredOperatorRef": "OId_MEGA",
        "ServiceCode": "M6_MEGA",
        "StandardService": {
          "JP384": {
            "Direction": "outbound",
            "Sections": ["JPSection-51", "JPSection-77", "JPSection-21"]
          }
        }
      }
    },
    VehicleJourneys: [
      {
        "DepartureTime": LocalTime.parse("01:00"),
        "JourneyPatternRef": "JP384",
        "LineRef": "l_M6_MEGA",
        "OperatingProfile": {
          "BankHolidayOperation": {
            "DaysOfNonOperation": [],
            "DaysOfOperation": []
          },
          "RegularDayType": [[1, 1, 1, 1, 1, 1, 1]],
          "SpecialDaysOperation": {
            "DaysOfNonOperation": [],
            "DaysOfOperation": []
          }
        },
        "ServiceRef": "M6_MEGA"
      },
      {
        "DepartureTime": LocalTime.parse("01:00"),
        "JourneyPatternRef": "JP384",
        "LineRef": "l_M6_MEGA",
        "OperatingProfile": {
          "BankHolidayOperation": {
            "DaysOfNonOperation": [],
            "DaysOfOperation": []
          },
          "RegularDayType": [[1, 0, 1, 0, 0, 0, 0], [1, 1, 0, 0, 1, 0, 0]],
          "SpecialDaysOperation": {
            "DaysOfNonOperation": [],
            "DaysOfOperation": []
          }
        },
        "ServiceRef": "M6_MEGA"
      },
      {
        "DepartureTime": LocalTime.parse("01:00"),
        "JourneyPatternRef": "JP384",
        "LineRef": "l_M6_MEGA",
        "OperatingProfile": {
          "BankHolidayOperation": {
            "DaysOfNonOperation": [],
            "DaysOfOperation": []
          },
          "RegularDayType": [[1, 1, 1, 1, 1, 1, 1]],
          "SpecialDaysOperation": {
            "DaysOfNonOperation": [{
              "StartDate": LocalDate.parse("2018-06-24"),
              "EndDate": LocalDate.parse("2018-07-31")
            }],
            "DaysOfOperation": []
          }
        },
        "ServiceRef": "M6_MEGA"
      },
      {
        "DepartureTime": LocalTime.parse("01:00"),
        "JourneyPatternRef": "JP384",
        "LineRef": "l_M6_MEGA",
        "OperatingProfile": {
          "BankHolidayOperation": {
            "DaysOfNonOperation": [],
            "DaysOfOperation": []
          },
          "RegularDayType": [[1, 1, 1, 1, 1, 1, 1]],
          "SpecialDaysOperation": {
            "DaysOfNonOperation": [{
              "StartDate": LocalDate.parse("2018-07-24"),
              "EndDate": LocalDate.parse("2099-12-31")
            }],
            "DaysOfOperation": []
          }
        },
        "ServiceRef": "M6_MEGA"
      },
      {
        "DepartureTime": LocalTime.parse("01:00"),
        "JourneyPatternRef": "JP384",
        "LineRef": "l_M6_MEGA",
        "OperatingProfile": {
          "BankHolidayOperation": {
            "DaysOfNonOperation": [],
            "DaysOfOperation": []
          },
          "RegularDayType": [[1, 1, 1, 1, 1, 1, 1]],
          "SpecialDaysOperation": {
            "DaysOfNonOperation": [{
              "StartDate": LocalDate.parse("2018-07-24"),
              "EndDate": LocalDate.parse("2018-07-25")
            }],
            "DaysOfOperation": []
          }
        },
        "ServiceRef": "M6_MEGA"
      },
      {
        "DepartureTime": LocalTime.parse("23:00"),
        "JourneyPatternRef": "JP384",
        "LineRef": "l_M6_MEGA",
        "OperatingProfile": {
          "BankHolidayOperation": {
            "DaysOfNonOperation": [],
            "DaysOfOperation": []
          },
          "RegularDayType": [[1, 1, 1, 1, 1, 1, 1]],
          "SpecialDaysOperation": {
            "DaysOfNonOperation": [],
            "DaysOfOperation": []
          }
        },
        "ServiceRef": "M6_MEGA"
      },
      {
        "DepartureTime": LocalTime.parse("23:00"),
        "JourneyPatternRef": "JP384",
        "LineRef": "l_M6_MEGA",
        "OperatingProfile": {
          "BankHolidayOperation": {
            "DaysOfNonOperation": ["ChristmasDayHoliday", "BoxingDayHoliday"],
            "DaysOfOperation": []
          },
          "RegularDayType": [[1, 1, 1, 1, 1, 1, 1]],
          "SpecialDaysOperation": {
            "DaysOfNonOperation": [],
            "DaysOfOperation": []
          }
        },
        "ServiceRef": "M6_MEGA"
      },
      {
        "DepartureTime": LocalTime.parse("01:00"),
        "JourneyPatternRef": "JP384",
        "LineRef": "l_M6_MEGA",
        "OperatingProfile": {
          "BankHolidayOperation": {
            "DaysOfNonOperation": [],
            "DaysOfOperation": ["ChristmasDay"]
          },
          "RegularDayType": "HolidaysOnly",
          "SpecialDaysOperation": {
            "DaysOfNonOperation": [],
            "DaysOfOperation": []
          }
        },
        "ServiceRef": "M6_MEGA"
      },
    ],
    JourneySections: {
      "JPSection-51": [
        {
          From: { Activity: StopActivity.PickUp, StopPointRef: "118000037" },
          To: { Activity: StopActivity.PickUp, StopPointRef: "1180033077" },
          RunTime: Duration.parse("PT5M"),
          RouteLinkRef: ""
        }
      ],
      "JPSection-77": [
        {
          From: { Activity: StopActivity.PickUp, StopPointRef: "1180033077" },
          To: { Activity: StopActivity.PickUpAndSetDown, StopPointRef: "1100DEC10183" },
          RunTime: Duration.parse("PT65M"),
          RouteLinkRef: ""
        }
      ],
      "JPSection-21": [
        {
          From: { Activity: StopActivity.PickUpAndSetDown, StopPointRef: "1100DEC10183" },
          To: { Activity: StopActivity.PickUpAndSetDown, StopPointRef: "010000036", WaitTime: Duration.parse("PT5M") },
          RunTime: Duration.parse("PT115M"),
          RouteLinkRef: ""
        },
        {
          From: { Activity: StopActivity.PickUpAndSetDown, StopPointRef: "010000036" },
          To: { Activity: StopActivity.PickUpAndSetDown, StopPointRef: "0170SGA56570" },
          RunTime: Duration.parse("PT15M"),
          RouteLinkRef: ""
        },
        {
          From: { Activity: StopActivity.PickUpAndSetDown, StopPointRef: "0170SGA56570" },
          To: { Activity: StopActivity.SetDown, StopPointRef: "490016736W" },
          RunTime: Duration.parse("PT155M"),
          RouteLinkRef: ""
        }
      ],
    },
    RouteLinks: {
      "": { Distance: 0 }
    }
  };

  it("emits a calendar", async () => {
    const stream = new TransXChangeJourneyStream({} as BankHolidays);

    stream.write(transxchange);
    stream.end();

    return awaitStream(stream, (rows: TransXChangeJourney[]) => {
      expect(rows[0].calendar.startDate.toString()).to.equal("2018-06-24");
      expect(rows[0].calendar.endDate.toString()).to.equal("2099-12-31");
      expect(rows[0].calendar.days.toString()).to.equal("1,1,1,1,1,1,1");
      expect(rows[0].calendar.id).to.equal(1);
    });
  });

  it("clips a calendar to the window the feed is built for", async () => {
    const stream = new TransXChangeJourneyStream({} as BankHolidays, {
      from: LocalDate.parse("2026-01-01"),
      to: LocalDate.parse("2026-12-31")
    });

    stream.write(transxchange);
    stream.end();

    return awaitStream(stream, (rows: TransXChangeJourney[]) => {
      // The service says 2018 to 2099, and neither is a statement about what
      // the feed describes.
      expect(rows[0].calendar.startDate.toString()).to.equal("2026-01-01");
      expect(rows[0].calendar.endDate.toString()).to.equal("2026-12-31");
    });
  });

  it("drops a journey that runs on no day inside the window", async () => {
    const stream = new TransXChangeJourneyStream({} as BankHolidays, {
      from: LocalDate.parse("2000-01-01"),
      to: LocalDate.parse("2000-12-31")
    });

    stream.write(transxchange);
    stream.end();

    return awaitStream(stream, (rows: TransXChangeJourney[]) => {
      expect(rows.length).to.equal(0);
      expect(stream.skipped).to.be.greaterThan(0);
    });
  });

  it("keeps every journey when there is no window", async () => {
    const stream = new TransXChangeJourneyStream({} as BankHolidays);

    stream.write(transxchange);
    stream.end();

    return awaitStream(stream, (rows: TransXChangeJourney[]) => {
      expect(rows.length).to.be.greaterThan(0);
      expect(stream.skipped).to.equal(0);
    });
  });

  it("merges days of the week", async () => {
    const stream = new TransXChangeJourneyStream({} as BankHolidays);

    stream.write(transxchange);
    stream.end();

    return awaitStream(stream, (rows: TransXChangeJourney[]) => {
      expect(rows[1].calendar.id).to.equal(2);
      expect(rows[1].calendar.days.toString()).to.equal("1,1,1,0,1,0,0");
    });
  });

  it("shortens the calendar start and end for non operational date ranges at the beginning or end of the operation period", async () => {
    const stream = new TransXChangeJourneyStream({} as BankHolidays);

    stream.write(transxchange);
    stream.end();

    return awaitStream(stream, (rows: TransXChangeJourney[]) => {
      expect(rows[2].calendar.startDate.toString()).to.equal("2018-08-01");
      expect(rows[2].calendar.endDate.toString()).to.equal("2099-12-31");
      expect(rows[3].calendar.startDate.toString()).to.equal("2018-06-24");
      expect(rows[3].calendar.endDate.toString()).to.equal("2018-07-23");
    });
  });

  it("adds exclude dates for non operational date ranges in the middle of the operation period", async () => {
    const stream = new TransXChangeJourneyStream({} as BankHolidays);

    stream.write(transxchange);
    stream.end();

    return awaitStream(stream, (rows: TransXChangeJourney[]) => {
      expect(rows[4].calendar.excludes[0].toString()).to.equal("2018-07-24");
      expect(rows[4].calendar.excludes[1].toString()).to.equal("2018-07-25");
      expect(rows[4].calendar.excludes.length).to.equal(2);
    });

  });

  it("adds excludes for bank holidays", async () => {
    const dates = {
      ChristmasDayHoliday: [LocalDate.parse("2017-12-25"), LocalDate.parse("2018-12-25"), LocalDate.parse("2019-12-25")],
      BoxingDayHoliday: [LocalDate.parse("2017-12-26"), LocalDate.parse("2018-12-26"), LocalDate.parse("2019-12-26")]
    };
    const stream = new TransXChangeJourneyStream(dates as BankHolidays);

    stream.write(transxchange);
    stream.end();

    return awaitStream(stream, (rows: TransXChangeJourney[]) => {
      expect(rows[6].calendar.excludes[0].toString()).to.equal("2018-12-25");
      expect(rows[6].calendar.excludes[1].toString()).to.equal("2019-12-25");
      expect(rows[6].calendar.excludes[2].toString()).to.equal("2018-12-26");
      expect(rows[6].calendar.excludes[3].toString()).to.equal("2019-12-26");
    });

  });

  it("adds include days for bank holiday only services", async () => {
    const dates = {
      ChristmasDay: [LocalDate.parse("2017-12-25"), LocalDate.parse("2018-12-25"), LocalDate.parse("2019-12-25")]
    };
    const stream = new TransXChangeJourneyStream(dates as BankHolidays);

    stream.write(transxchange);
    stream.end();

    return awaitStream(stream, (rows: TransXChangeJourney[]) => {
      expect(rows[7].calendar.days.toString()).to.equal("0,0,0,0,0,0,0");
      expect(rows[7].calendar.startDate.toString()).to.equal("2018-06-24");
      expect(rows[7].calendar.endDate.toString()).to.equal("2099-12-31");
      expect(rows[7].calendar.includes[0].toString()).to.equal("2018-12-25");
      expect(rows[7].calendar.includes[1].toString()).to.equal("2019-12-25");
    });


  });

  it("calculates stops times", async () => {
    const stream = new TransXChangeJourneyStream({} as BankHolidays);

    stream.write(transxchange);
    stream.end();

    return awaitStream(stream, (rows: TransXChangeJourney[]) => {
      expect(rows[0].stops[0].dropoff).to.equal(false);
      expect(rows[0].stops[0].pickup).to.equal(true);
      expect(rows[0].stops[0].stop).to.equal("118000037");
      expect(rows[0].stops[0].arrivalTime).to.equal("01:00:00");
      expect(rows[0].stops[0].departureTime).to.equal("01:00:00");

      expect(rows[0].stops[1].dropoff).to.equal(false);
      expect(rows[0].stops[1].pickup).to.equal(true);
      expect(rows[0].stops[1].stop).to.equal("1180033077");
      expect(rows[0].stops[1].arrivalTime).to.equal("01:05:00");
      expect(rows[0].stops[1].departureTime).to.equal("01:05:00");
    });
  });

  it("includes wait time in departure times and subsequent arrival times", async () => {
    const stream = new TransXChangeJourneyStream({} as BankHolidays);

    stream.write(transxchange);
    stream.end();

    return awaitStream(stream, (rows: TransXChangeJourney[]) => {
      expect(rows[0].stops[2].dropoff).to.equal(true);
      expect(rows[0].stops[2].pickup).to.equal(true);
      expect(rows[0].stops[2].stop).to.equal("1100DEC10183");
      expect(rows[0].stops[2].arrivalTime).to.equal("02:10:00");
      expect(rows[0].stops[2].departureTime).to.equal("02:10:00");

      expect(rows[0].stops[3].dropoff).to.equal(true);
      expect(rows[0].stops[3].pickup).to.equal(true);
      expect(rows[0].stops[3].stop).to.equal("010000036");
      expect(rows[0].stops[3].arrivalTime).to.equal("04:05:00");
      expect(rows[0].stops[3].departureTime).to.equal("04:10:00");
    });

  });

  it("rolls over midnight", async () => {
    const stream = new TransXChangeJourneyStream({} as BankHolidays);

    stream.write(transxchange);
    stream.end();

    return awaitStream(stream, (rows: TransXChangeJourney[]) => {
      expect(rows[5].stops[0].dropoff).to.equal(false);
      expect(rows[5].stops[0].pickup).to.equal(true);
      expect(rows[5].stops[0].stop).to.equal("118000037");
      expect(rows[5].stops[0].arrivalTime).to.equal("23:00:00");
      expect(rows[5].stops[0].departureTime).to.equal("23:00:00");

      expect(rows[5].stops[2].dropoff).to.equal(true);
      expect(rows[5].stops[2].pickup).to.equal(true);
      expect(rows[5].stops[2].stop).to.equal("1100DEC10183");
      expect(rows[5].stops[2].arrivalTime).to.equal("24:10:00");
      expect(rows[5].stops[2].departureTime).to.equal("24:10:00");

      expect(rows[5].stops[3].dropoff).to.equal(true);
      expect(rows[5].stops[3].pickup).to.equal(true);
      expect(rows[5].stops[3].stop).to.equal("010000036");
      expect(rows[5].stops[3].arrivalTime).to.equal("26:05:00");
      expect(rows[5].stops[3].departureTime).to.equal("26:10:00");
    });

  });

  it("creates a trip name for outward journeys", async () => {
    const stream = new TransXChangeJourneyStream({} as BankHolidays);

    const customTransxchange = Object.assign({}, transxchange, {
      Services: {
        "M6_MEGA": {
          "ServiceOrigin": "Aberdeen",
          "ServiceDestination": "Bungay",
          "Description": "Falmouth - Victoria,London",
          "Lines": {
            "l_M6_MEGA": "M6"
          },
          "Mode": "coach",
          "OperatingPeriod": {
            "EndDate": LocalDate.parse("2099-12-31"),
            "StartDate": LocalDate.parse("2018-06-24")
          },
          "RegisteredOperatorRef": "OId_MEGA",
          "ServiceCode": "M6_MEGA",
          "StandardService": {
            "JP384": {
              "Direction": "outbound",
              "Sections": ["JPSection-51", "JPSection-77", "JPSection-21"]
            }
          }
        }
      },
    })

    stream.write(customTransxchange);
    stream.end();

    return awaitStream(stream, (rows: TransXChangeJourney[]) => {
      expect(rows[0].trip.shortName).to.equal("Bungay");
    });

  });

  it("creates a trip name for return journeys", async () => {
    const stream = new TransXChangeJourneyStream({} as BankHolidays);

    const customTransxchange = Object.assign({}, transxchange, {
      Services: {
        "M6_MEGA": {
          "ServiceOrigin": "Aberdeen",
          "ServiceDestination": "Bungay",
          "Description": "Falmouth - Victoria,London",
          "Lines": {
            "l_M6_MEGA": "M6"
          },
          "Mode": "coach",
          "OperatingPeriod": {
            "EndDate": LocalDate.parse("2099-12-31"),
            "StartDate": LocalDate.parse("2018-06-24")
          },
          "RegisteredOperatorRef": "OId_MEGA",
          "ServiceCode": "M6_MEGA",
          "StandardService": {
            "JP384": {
              "Direction": "inbound",
              "Sections": ["JPSection-51", "JPSection-77", "JPSection-21"]
            }
          }
        }
      },
    })

    stream.write(customTransxchange);
    stream.end();

    return awaitStream(stream, (rows: TransXChangeJourney[]) => {
      expect(rows[0].trip.shortName).to.equal("Aberdeen");
    });

  });

  it("applies a From WaitTime to the previous stop's departure", async () => {
    const stream = new TransXChangeJourneyStream({} as BankHolidays);

    const customTransxchange = Object.assign({}, transxchange, {
      JourneySections: Object.assign({}, transxchange.JourneySections, {
        "JPSection-21": [
          {
            From: { Activity: StopActivity.PickUpAndSetDown, StopPointRef: "1100DEC10183" },
            To: { Activity: StopActivity.PickUpAndSetDown, StopPointRef: "010000036", WaitTime: Duration.parse("PT5M") },
            RunTime: Duration.parse("PT115M"),
            RouteLinkRef: ""
          },
          {
            From: { Activity: StopActivity.PickUpAndSetDown, StopPointRef: "010000036", WaitTime: Duration.parse("PT3M") },
            To: { Activity: StopActivity.PickUpAndSetDown, StopPointRef: "0170SGA56570" },
            RunTime: Duration.parse("PT15M"),
            RouteLinkRef: ""
          },
          {
            From: { Activity: StopActivity.PickUpAndSetDown, StopPointRef: "0170SGA56570" },
            To: { Activity: StopActivity.SetDown, StopPointRef: "490016736W" },
            RunTime: Duration.parse("PT155M"),
            RouteLinkRef: ""
          }
        ]
      })
    });

    stream.write(customTransxchange);
    stream.end();

    return awaitStream(stream, (rows: TransXChangeJourney[]) => {
      // stop[3] is "010000036": arrival 04:05, dep bumped from 04:10 to 04:13 by the From.WaitTime on the next link
      expect(rows[0].stops[3].stop).to.equal("010000036");
      expect(rows[0].stops[3].arrivalTime).to.equal("04:05:00");
      expect(rows[0].stops[3].departureTime).to.equal("04:13:00");

      // stop[4] is "0170SGA56570": leaves 010000036 at 04:13, +15m run time = 04:28
      expect(rows[0].stops[4].stop).to.equal("0170SGA56570");
      expect(rows[0].stops[4].arrivalTime).to.equal("04:28:00");
    });
  });

  it("creates a trip name where there is no service origin or destination", async () => {
    const stream = new TransXChangeJourneyStream({} as BankHolidays);

    const customTransxchange = Object.assign({}, transxchange, {
      Services: {
        "M6_MEGA": {
          "Description": "Falmouth - Victoria,London",
          "Lines": {
            "l_M6_MEGA": "M6"
          },
          "Mode": "coach",
          "OperatingPeriod": {
            "EndDate": LocalDate.parse("2099-12-31"),
            "StartDate": LocalDate.parse("2018-06-24")
          },
          "RegisteredOperatorRef": "OId_MEGA",
          "ServiceCode": "M6_MEGA",
          "StandardService": {
            "JP384": {
              "Direction": "outbound",
              "Sections": ["JPSection-51", "JPSection-77", "JPSection-21"]
            }
          }
        }
      },
    })

    stream.write(customTransxchange);
    stream.end();

    return awaitStream(stream, (rows: TransXChangeJourney[]) => {
      expect(rows[0].trip.shortName).to.equal("Falmouth - Victoria,London");
    });

  });

});
