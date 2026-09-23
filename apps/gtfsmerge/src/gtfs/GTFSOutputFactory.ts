import {FileOutput} from "@gb-transit/gtfs-output";
import * as fs from "fs";
import * as path from "node:path";
import {GTFSOutput} from "./GTFSOutput";
import {AreasMerger} from "./merger/AreasMerger";
import {FeedInfoMerger} from "./merger/FeedInfoMerger";
import {ShapesMerger} from "./merger/ShapesMerger";
import {FrequenciesMerger} from "./merger/FrequenciesMerger";
import {DedupingWriter} from "./DedupingWriter";
import {ATTRIBUTIONS, outputFiles} from "./MergeFeed";
import {CalendarMerger} from "./merger/CalendarMerger";
import {MemoizedSequence} from "../sequence/MemoizedSequence";
import {StopsAndTransfersMerger} from "./merger/StopsAndTransfersMerger";
import {StopTimesMerger} from "./merger/StopTimesMerger";
import {TripsMerger} from "./merger/TripsMerger";
import {GenericMerger} from "./merger/GenericMerger";
import {CalendarFactory} from "./calendar/CalendarFactory";
import {Sequence} from "../sequence/Sequence";
import CheapRuler from "cheap-ruler";
import {RouteMerger, RouteTypeIndex} from "./merger/RouteMerger";
import type {Columns, FeedRow, FileSchema} from "@gb-transit/gtfs-schema";
import type {FeedFileName} from "@gb-transit/gtfs-loader";
import type {ExtraColumns} from "./ExtraColumns";

export class GTFSOutputFactory {

  constructor(
    private readonly calendarFactory: CalendarFactory,
    private readonly directory: string,
    private readonly ruler: CheapRuler,
    private readonly shapes: boolean,
    private readonly transferDistance: number,
    private readonly removeRouteTypes: RouteTypeIndex
  ) {}

  /**
   * Open a file per output, in the columns this tool writes.
   *
   * Which columns each file has used to live in this method as an array of
   * strings beside each stream. It is now declared in MergeFeed.ts against the
   * row type, so a column that is not a field of the row it is written from does
   * not compile.
   */
  public create(extra: ExtraColumns = {}): GTFSOutput {
    fs.rmSync(this.directory, {recursive: true, force: true});
    fs.mkdirSync(this.directory, {recursive: true});

    const files = outputFiles(this.shapes);
    const output = new FileOutput();
    const at = (file: string) => path.join(this.directory, file);
    // The columns the merge declares, then the ones the feeds carry beyond them -
    // which are not fields of the row type, so the writer is told they are.
    const open = <R extends FeedRow>(schema: FileSchema<R>) => output.open(
      at(schema.filename),
      [...schema.columns, ...extra[schema.filename as FeedFileName] ?? []] as unknown as Columns<R>
    );

    // Deduplicated because two feeds describe the same station, agency or
    // service in their own terms and the merged feed wants one row for it.
    const calendar = new DedupingWriter(open(files.calendar), row => String(row.service_id));
    const routes = new DedupingWriter(open(files.routes), row => String(row.route_id));
    const agency = new DedupingWriter(open(files.agency), row => String(row.agency_id));
    const stops = new DedupingWriter(open(files.stops), row => row.stop_id);
    const areas = new DedupingWriter(open(files.areas), row => String(row.area_id));
    const stopAreas = new DedupingWriter(open(files.stopAreas), row => `${row.area_id}_${row.stop_id}`);
    // Keyed on the statement rather than on the organisation: the DfT is the
    // authority for NaPTAN under one licence and could be the authority for
    // something else under another, and both statements are true.
    const attributions = new DedupingWriter(
      open(files.attributions),
      // Stringified rather than joined: String(null) and String(undefined) are
      // "null" and "undefined", so two rows saying the same thing in different
      // ways survived as two, and a comma inside a licence could run two
      // different rows together.
      row => JSON.stringify(ATTRIBUTIONS.columns.map(column => row[column] ?? null))
    );

    const calendarDates = open(files.calendarDates);
    const trips = open(files.trips);
    const stopTimes = open(files.stopTimes);
    const transfers = open(files.transfers);
    const frequencies = open(files.frequencies);
    const shapes = files.shapes === undefined ? undefined : open(files.shapes);

    return new GTFSOutput(
      new CalendarMerger(calendar, calendarDates, this.calendarFactory, new MemoizedSequence()),
      new StopsAndTransfersMerger(stops, transfers, this.ruler, this.transferDistance),
      new StopTimesMerger(stopTimes),
      new TripsMerger(trips, new Sequence(), new Sequence(), new Sequence()),
      new GenericMerger(agency),
      new RouteMerger(routes, new Sequence(), this.removeRouteTypes),
      new GenericMerger(attributions),
      new AreasMerger(areas, stopAreas),
      new FeedInfoMerger(open(files.feedInfo)),
      new ShapesMerger(shapes),
      new FrequenciesMerger(frequencies)
    );
  }
}
