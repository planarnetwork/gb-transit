import {Transform, TransformCallback} from "node:stream";
import {Skipped} from "../converter/Skipped";
import {documents} from "./Documents";

/**
 * Reads a set of XML or zip files and emits the documents in them downstream.
 *
 * **One document at a time.** A TransXChange document runs to tens of megabytes
 * and a dataset holds hundreds of them, so pushing them all in and letting the
 * stream buffer costs gigabytes: the whole dataset ends up in memory at once
 * because the parser downstream is slower than the loop. Each push waits for the
 * reader to take it, which is what keeps a national dataset inside a gigabyte.
 */
export class FileStream extends Transform implements Skipped {

  private drained: (() => void) | undefined;

  /**
   * Entries that could not be read. Counted rather than only logged, so a run
   * that quietly skipped half its input can say so.
   */
  public skipped = 0;

  public readonly skippedDescription = "Entries of the input that could not be read";

  constructor() {
    super({objectMode: true});
  }

  /**
   * Called when the reader wants more, which is what `pushDocument` waits for.
   */
  public _read(size: number): void {
    super._read(size);

    const resolve = this.drained;

    this.drained = undefined;
    resolve?.();
  }

  /**
   * Emit every document in the file. An entry that cannot be read is counted and
   * skipped; a file that cannot be read at all fails the conversion.
   */
  public async _transform(file: string, encoding: string, callback: TransformCallback): Promise<void> {
    try {
      for (const document of documents(file)) {
        if ("error" in document) {
          this.skipped++;
          console.error(`Skipping ${document.name}: ${document.error.message}`);
          continue;
        }

        console.log("Processing " + document.name);
        await this.pushDocument(document.xml);
      }
    }
    catch (err) {
      return callback(err instanceof Error ? err : new Error(String(err)));
    }

    callback();
  }

  /**
   * Emit one document, waiting if the reader is not ready for it.
   */
  private async pushDocument(xml: string): Promise<void> {
    if (!this.push(xml)) {
      await new Promise<void>(resolve => {
        this.drained = resolve;
      });
    }
  }

}
