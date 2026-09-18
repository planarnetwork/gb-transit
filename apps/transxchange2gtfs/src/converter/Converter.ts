import {FeedRow, RowWriter} from "@gb-transit/gtfs-schema";
import {FileOutput, deliverFeed} from "@gb-transit/gtfs-output";
import {FileStream} from "../xml/FileStream";
import {Skipped} from "./Skipped";
import {RowStream} from "../gtfs/RowStream";
import * as fs from "node:fs";
import * as path from "node:path";
import {Writable} from "node:stream";
import {finished} from "node:stream/promises";

/**
 * Runs the pipeline and writes what comes out of it.
 *
 * Each stream declares the file it writes and the columns of it, so the writer
 * is opened from the stream rather than from a filename passed alongside it -
 * which is what used to let a stream's header and its rows disagree.
 */
export class Converter {

  constructor(
    private readonly inputStream: FileStream,
    private readonly gtfsFiles: readonly RowStream<any, any>[],
    private readonly directory: string,
    private readonly skipping: readonly Skipped[] = []
  ) {}

  public async process(input: string[], output: string | undefined): Promise<void> {
    if (input.length === 0 || output === undefined) {
      throw Error("Invalid number of arguments");
    }

    fs.rmSync(this.directory, {recursive: true, force: true});
    fs.mkdirSync(this.directory, {recursive: true});

    const target = new FileOutput();
    const written = this.gtfsFiles.map(stream => {
      const writer = target.open(
        path.join(this.directory, stream.file.filename),
        stream.file.columns
      );

      return finished(stream.pipe(sink(writer)));
    });

    for (const file of input) {
      this.inputStream.write(file);
    }

    this.inputStream.end();

    await Promise.all(written);
    await target.end();

    this.reportSkipped();

    await deliverFeed(this.directory, output);
  }

  /**
   * What did not make it into the feed.
   *
   * Each of these is survivable by design, which is why it has to be said out
   * loud: a run that skipped half its input otherwise looks like one that
   * skipped none of it.
   */
  private reportSkipped(): void {
    for (const stage of this.skipping) {
      if (stage.skipped > 0) {
        console.warn(`${stage.skippedDescription}: ${stage.skipped}`);
      }
    }
  }

}

/**
 * A writer as a stream, so the rows go through node's own pipe.
 *
 * This was `for await (const row of source)`, which reads one row per
 * microtask - slower than the streams producing them, so a shapes file of a
 * million points ends up buffered rather than written. A pipe applies the
 * backpressure that stops that.
 */
function sink<R extends FeedRow>(writer: RowWriter<R>): Writable {
  return new Writable({
    objectMode: true,
    write(row: R, _encoding, done) {
      if (writer.write(row)) {
        return done();
      }

      writer.drain().then(() => done(), done);
    },
    final(done) {
      writer.end();
      writer.finished().then(() => done(), done);
    }
  });
}
