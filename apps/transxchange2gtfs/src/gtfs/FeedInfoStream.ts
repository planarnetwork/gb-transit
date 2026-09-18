import {FeedInfoRow} from "@gb-transit/gtfs-schema";
import {DateTimeFormatter, LocalDate} from "@js-joda/core";
import {RowStream} from "./RowStream";
import {FEED_INFO} from "./TxcFeed";
import {DateWindow, TransXChangeJourney} from "../transxchange/TransXChangeJourneyStream";
import {TransformCallback} from "node:stream";

const PUBLISHER = "Planar Network";
const PUBLISHER_URL = "https://github.com/planarnetwork/dtd2mysql";

/**
 * What the feed can be trusted for.
 *
 * TransXChange has nothing to build this from, which is why the file was not
 * written at all; the window the conversion was asked for is the missing half.
 * GTFS defines these as the first and last day the feed describes *completely*,
 * and the calendars answer neither on their own - a registration that began in
 * 2001 and still runs is emitted with its real start date, and one with no end
 * in sight is emitted with 2099. So it is the window, with the end pulled in
 * where the timetables run out first.
 */
export class FeedInfoStream extends RowStream<TransXChangeJourney, FeedInfoRow> {
  public readonly file = FEED_INFO;

  private readonly formatter = DateTimeFormatter.ofPattern("yyyyMMdd");
  private last: LocalDate | undefined;

  constructor(
    private readonly window: DateWindow,
    private readonly version: string
  ) {
    super();
  }

  protected transform(journey: TransXChangeJourney): void {
    const end = journey.calendar.endDate;

    if (this.last === undefined || end.isAfter(this.last)) {
      this.last = end;
    }
  }

  public _flush(callback: TransformCallback): void {
    const covered = this.last !== undefined && this.last.isBefore(this.window.to)
      ? this.last
      : this.window.to;

    this.pushRow({
      feed_publisher_name: PUBLISHER,
      feed_publisher_url: PUBLISHER_URL,
      feed_lang: process.env.AGENCY_LANG || "en",
      feed_start_date: this.window.from.format(this.formatter),
      feed_end_date: covered.format(this.formatter),
      feed_version: this.version
    });

    callback();
  }

}
