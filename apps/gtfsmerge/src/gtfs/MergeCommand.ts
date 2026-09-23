import * as fs from "fs";
import {deliverFeed} from "@gb-transit/gtfs-output";
import {readMergeInput, streamOf} from "./FeedIndex";
import {GTFSOutputFactory} from "./GTFSOutputFactory";
import {extraColumns} from "./ExtraColumns";
import {declaredColumns, withheldColumns} from "./MergeFeed";

/**
 * Merges a list of input GTFS files into a single output file
 */
export class MergeCommand {

  constructor(
    private readonly outputFactory: GTFSOutputFactory,
    private readonly directory: string,
    private readonly shapes = true
  ) {}

  /**
   * Iterate over the list of inputs loading and merging each one at a time.
   */
  public async run(
    inputs: string[],
    outputFile: string,
    filterDatesBefore?: string
  ): Promise<void> {
    // Every feed's columns before anything is written, because each file is
    // opened with its header and a column only the last feed has would
    // otherwise arrive too late to be in it.
    const extra = await extraColumns(inputs, declaredColumns(this.shapes), withheldColumns(this.shapes));

    for (const [file, columns] of Object.entries(extra)) {
      console.log(`Passing through ${file} ${columns.join(", ")}`);
    }

    const output = this.outputFactory.create(extra);

    for (const input of inputs) {
      console.log("Loading " + input);
      const gtfs = await readMergeInput(input, filterDatesBefore, extra);

      console.log("Processing " + input);
      await output.write(gtfs, streamOf(input, this.shapes, extra));
    }

    await output.end();

    console.log("Writing " + outputFile);

    await deliverFeed(this.directory, outputFile);
  }
}
