import {promisify} from "node:util";
import {parseString} from "xml2js";
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import {workingDirectory} from "@gb-transit/gtfs-output";
import {naptanFile} from "@gb-transit/naptan";
import {FileStream} from "./xml/FileStream";
import {ParseXML, XMLStream} from "./xml/XMLStream";
import {TransXChangeStream} from "./transxchange/TransXChangeStream";
import {BankHolidays, DateWindow, TransXChangeJourneyStream} from "./transxchange/TransXChangeJourneyStream";
import {getBankHolidays} from "./reference/BankHolidays";
import {NaPTANIndex, StopLocationIndex, naptanIndexesFrom} from "./reference/NaPTAN";
import {stopAreas} from "./reference/StopAreas";
import {AgencyStream} from "./gtfs/AgencyStream";
import {CalendarDatesStream} from "./gtfs/CalendarDatesStream";
import {CalendarStream} from "./gtfs/CalendarStream";
import {FeedInfoStream} from "./gtfs/FeedInfoStream";
import {RoutesStream} from "./gtfs/RoutesStream";
import {ShapesStream} from "./gtfs/ShapesStream";
import {StopTimesStream} from "./gtfs/StopTimesStream";
import {StopsStream} from "./gtfs/StopsStream";
import {TransfersStream} from "./gtfs/TransfersStream";
import {TripsStream} from "./gtfs/TripsStream";
import {Converter} from "./converter/Converter";
import {LocalDate} from "@js-joda/core";

/**
 * One end of the window, named after the flag it came from so that a date the
 * parser will not take says which argument to fix.
 */
function day(value: string | undefined, flag: string): LocalDate | undefined {
  if (value === undefined) {
    return undefined;
  }

  try {
    return LocalDate.parse(value);
  }
  catch {
    throw new Error(`${flag} must be a date as YYYY-MM-DD. Got "${value}".`);
  }
}

/**
 * Where NaPTAN is cached between runs.
 */
const CACHE = path.join(os.tmpdir(), "gb-transit-naptan");

export interface ConverterOptions {
  /** Re-download NaPTAN even if a cached copy is current. */
  readonly refreshStops?: boolean;
  /**
   * Use no NaPTAN data, and download nothing. stops.txt and transfers.txt are
   * still written from what the documents themselves say, which for a feed
   * using AnnotatedStopPointRef is a name and no coordinate.
   */
  readonly skipStops?: boolean;
  /**
   * Read NaPTAN from this file instead of downloading it.
   *
   * The reason the end to end test can run at all: the download is 100MB and a
   * test that depends on the DfT being up is not a test.
   */
  readonly naptanFile?: string;
  /**
   * Where the files are assembled before being put at `output`. Defaults to a
   * sibling of the output, so moving them into place cannot cross a filesystem.
   */
  readonly tmp?: string;
  /** The first day the feed describes. Defaults to today. */
  readonly from?: string;
  /** The last day the feed describes. Defaults to a year after `from`. */
  readonly to?: string;
  /** What feed_info.txt calls this build. Defaults to the date it was made. */
  readonly version?: string;
  /**
   * Do not group a pair of stops either side of a street under a station of
   * their own. See `reference/StopAreas.ts` for what the grouping is and how
   * far it can be trusted.
   */
  readonly skipStopAreas?: boolean;
}

/**
 * Dependency container
 */
export class Container {

  public async getConverter(options: ConverterOptions = {}): Promise<Converter> {
    const [naptanIndex, locationIndex] = await this.getNaPTANIndexes(options);
    const areas = options.skipStopAreas ? {} : stopAreas(naptanIndex);
    const window = this.getWindow(options);
    const files = new FileStream();
    const xml = new XMLStream(this.getParseXML());
    const transxchange = new TransXChangeStream();
    const journeys = new TransXChangeJourneyStream(this.getBankHolidays(), window);

    files.pipe(xml).pipe(transxchange).pipe(journeys);

    return new Converter(
      files,
      [
        journeys.pipe(new CalendarStream()),
        journeys.pipe(new CalendarDatesStream()),
        journeys.pipe(new TripsStream()),
        journeys.pipe(new StopTimesStream()),
        journeys.pipe(new ShapesStream()),
        journeys.pipe(new FeedInfoStream(window, options.version ?? LocalDate.now().toString())),
        transxchange.pipe(new AgencyStream()),
        transxchange.pipe(new RoutesStream()),
        transxchange.pipe(new TransfersStream(naptanIndex, locationIndex, areas)),
        transxchange.pipe(new StopsStream(naptanIndex, areas))
      ],
      options.tmp ?? path.join(os.tmpdir(), `transxchange2gtfs_${process.pid}`),
      [files, xml, journeys]
    );
  }

  /**
   * The days the feed is built for.
   *
   * A registration says when it began and when it ends and neither is a
   * statement about the feed, so the conversion is told instead. A year from
   * today is long enough for a planner and short enough that the timetables in
   * it are ones an operator has actually registered.
   */
  private getWindow(options: ConverterOptions): DateWindow {
    const from = day(options.from, "--from") ?? LocalDate.now();
    const to = day(options.to, "--to") ?? from.plusYears(1);

    // Every stage downstream reads a backwards window as "nothing runs" rather
    // than as bad input, so the conversion would finish successfully with a feed
    // of headers and no rows, a feed_info.txt whose dates are the wrong way
    // round, and a skip count indistinguishable from the legitimate one.
    if (to.isBefore(from)) {
      throw new Error(`--to (${to}) is before --from (${from}).`);
    }

    return {from, to};
  }

  public async getNaPTANIndexes(
    options: ConverterOptions
  ): Promise<[NaPTANIndex, StopLocationIndex]> {
    if (options.skipStops) {
      return [{}, {}];
    }

    if (options.naptanFile !== undefined) {
      return naptanIndexesFrom(options.naptanFile);
    }

    return naptanIndexesFrom(await naptanFile(CACHE, options.refreshStops ? 0 : 30)());
  }

  public getParseXML(): ParseXML {
    return promisify(parseString as any);
  }

  private getBankHolidays(): BankHolidays {
    return getBankHolidays();
  }

}
