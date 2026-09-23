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
import {stationAreas, stopAreas} from "./reference/StopAreas";
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
import {scanServices, Supersession, supersession} from "./transxchange/Supersession";
import {LocalDate} from "@js-joda/core";

/** One end of the window, named after the flag so a bad date says what to fix. */
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
   * their own, nor a metro, tram or ferry platform under the station NaPTAN
   * numbers it after. See `reference/StopAreas.ts` for what the grouping is and
   * how far it can be trusted.
   */
  readonly skipStopAreas?: boolean;
  /**
   * Where two services of one operator and line overlap, run only the one that
   * starts latest on the days they share. For TfL, whose engineering works
   * timetables are separate services on top of the base timetable rather than
   * revisions of it; see `transxchange/Supersession.ts` for why it is not the
   * default.
   */
  readonly supersedeByLine?: boolean;
}

/**
 * Dependency container
 */
export class Container {

  /**
   * `inputs` are only read here when `supersedeByLine` asks for them to be
   * scanned before the conversion starts.
   */
  public async getConverter(options: ConverterOptions = {}, inputs: readonly string[] = []): Promise<Converter> {
    const [naptanIndex, locationIndex] = await this.getNaPTANIndexes(options);
    const areas = options.skipStopAreas ? {} : {...stopAreas(naptanIndex), ...stationAreas(naptanIndex)};
    const window = this.getWindow(options);
    const superseded = options.supersedeByLine ? this.getSupersession(inputs, window) : new Map();
    const files = new FileStream();
    const xml = new XMLStream(this.getParseXML());
    const transxchange = new TransXChangeStream();
    const journeys = new TransXChangeJourneyStream(this.getBankHolidays(), window, superseded);

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
   * A registration's own dates say nothing about what the feed can be trusted
   * for, so the conversion is told instead. A year is long enough for a planner
   * and short enough that the timetables in it have been registered.
   */
  private getWindow(options: ConverterOptions): DateWindow {
    const from = day(options.from, "--from") ?? LocalDate.now();
    const to = day(options.to, "--to") ?? from.plusYears(1);

    // Every stage downstream reads a backwards window as "nothing runs" rather
    // than as bad input, and would build an empty feed and report success.
    if (to.isBefore(from)) {
      throw new Error(`--to (${to}) is before --from (${from}).`);
    }

    return {from, to};
  }

  private getSupersession(inputs: readonly string[], window: DateWindow): Supersession {
    const superseded = supersession(scanServices(inputs), window);
    const days = [...superseded.values()].reduce((total, dates) => total + dates.length, 0);

    console.log(`${superseded.size} service(s) replaced by a newer timetable for their line on ${days} day(s)`);

    return superseded;
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
