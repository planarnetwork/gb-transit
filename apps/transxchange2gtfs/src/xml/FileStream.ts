import AdmZip from "adm-zip";
import {Transform, TransformCallback} from "node:stream";
import * as fs from "node:fs";
import {parse} from "node:path";
import {Skipped} from "../converter/Skipped";

/**
 * A document's bytes as text, without a byte order mark.
 *
 * Two thirds of the documents in a national Bus Open Data Service archive begin
 * with one, and an XML parser reads it as content before the first tag and
 * rejects the document. `toString("utf8")` keeps it; a `TextDecoder` drops it.
 */
const decoder = new TextDecoder("utf-8");

/**
 * Reads a set of XML or zip files and emits the contents downstream.
 *
 * A BODS download is a zip of zips of XML, so a zip entry that is itself a zip is
 * opened in turn.
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
   * Pop the next file off the list and emit it. If we've got no more files, close the stream
   */
  public async _transform(file: string, encoding: string, callback: TransformCallback): Promise<void> {
    const extension = parse(file).ext.toLowerCase();

    try {
      if (extension === ".xml") {
        console.log("Processing " + file);
        await this.pushDocument(decoder.decode(fs.readFileSync(file)));
      }
      else if (extension === ".zip") {
        console.log("Processing zip " + file);
        await this.readZip(new AdmZip(file));
      }
      else {
        throw new Error("Unknown file type: " + file);
      }
    }
    catch (err) {
      return callback(err instanceof Error ? err : new Error(String(err)));
    }

    callback();
  }

  /**
   * Every entry, and a bad one does not take the others with it.
   *
   * A dataset is hundreds of documents from hundreds of registrations, and one
   * of them being corrupt is not a reason to convert none of the rest. This is
   * deliberate rather than incidental - see fa74ff8, "ignore errors in
   * individual files" - so the error is reported and the loop carries on.
   */
  private async readZip(zip: AdmZip): Promise<void> {
    for (const entry of zip.getEntries()) {
      const name = entry.entryName.toLowerCase();

      if (entry.isDirectory) {
        continue;
      }

      try {
        if (name.endsWith(".xml")) {
          console.log("Processing " + entry.entryName);
          await this.pushDocument(decoder.decode(entry.getData()));
        }
        else if (name.endsWith(".zip")) {
          console.log("Processing " + entry.entryName);
          await this.readZip(new AdmZip(entry.getData()));
        }
        else {
          console.log("Skipping " + entry.entryName);
        }
      }
      catch (err) {
        this.skipped++;
        console.error(`Skipping ${entry.entryName}: ${err instanceof Error ? err.message : err}`);
      }
    }
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
