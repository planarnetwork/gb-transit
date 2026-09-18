import {Transform, TransformCallback} from "node:stream";
import {Skipped} from "../converter/Skipped";

/**
 * Converts an xml string into a JSON object
 */
export class XMLStream extends Transform implements Skipped {

  /**
   * Documents that could not be parsed.
   */
  public skipped = 0;

  public readonly skippedDescription = "Documents that are not valid XML";

  constructor(private readonly parseXML: ParseXML) {
    super({ objectMode: true });
  }

  /**
   * Transform the XML using the parseXML method
   *
   * **A document that will not parse is skipped rather than fatal.** A dataset
   * is hundreds of documents from hundreds of registrations, and one of them
   * being malformed is not a reason to convert none of the rest - which is what
   * `FileStream` guards against when it reads an entry, only for the parse to
   * happen here, downstream of that guard, where the error reached the pipeline
   * and ended the run.
   */
  public async _transform(xml: string, encoding: string, callback: TransformCallback): Promise<void> {
    let json;

    try {
      json = await this.parseXML(xml);
    }
    catch (err) {
      this.skipped++;

      console.error(`Skipping a document that is not valid XML: ${err instanceof Error ? err.message : err}`);

      return callback();
    }

    callback(undefined, json);
  }

}

/**
 * Function that turns an XML string into a JSON object
 */
export type ParseXML = (xml: string) => Promise<any>;
