import * as fs from "node:fs";
import sax from "sax";
import {PermittedStations} from "./PermittedStations";

const ROOT = "FareGroupPermittedStations";
const RECORD = "PermittedStations";
const STATION = "Crs";

/**
 * Every record of the document, without holding them all.
 *
 * The feed is 59MB and 308,907 records, and a consumer usually wants to index
 * it and discard it rather than keep the document. Writing a chunk to the
 * parser and yielding what that chunk produced hands each record straight on,
 * and the next chunk is not read until the last has been drained; the README
 * has what that costs against the alternatives.
 *
 * `sax` rather than a scanner over the text. The document is machine generated
 * and utterly regular, which is the argument that talks people into parsing XML
 * with a regular expression, and it stops being true the first time the
 * publisher indents something differently.
 */
export async function* permittedStations(
  file: string,
  /**
   * How much to read at a time, in bytes. The default is node's, and the only
   * reason to set it is to choose where the chunk boundaries fall - a value or
   * a tag can straddle two reads, and one byte at a time exercises every
   * boundary a larger read could land on.
   */
  options: {readonly highWaterMark?: number} = {}
): AsyncGenerator<PermittedStations> {
  let batch: PermittedStations[] = [];
  const reader = records(record => batch.push(record), () => file);

  for await (const chunk of fs.createReadStream(file, {encoding: "utf8", ...options})) {
    reader.parser.write(String(chunk));

    yield* batch;
    batch = [];
  }

  reader.parser.close();
  reader.check();

  yield* batch;
}

/**
 * Every record, held.
 *
 * Worth it for a consumer that is going to index the whole set anyway;
 * `permittedStations` is there for one that is not.
 */
export async function loadPermittedStations(file: string): Promise<PermittedStations[]> {
  const held: PermittedStations[] = [];

  for await (const record of permittedStations(file)) {
    held.push(record);
  }

  return held;
}

/**
 * The records of a document already in memory.
 *
 * Separate from the read so a fixture can drive a test without a 59MB file, and
 * so a document that has changed shape upstream is a parsing problem here
 * rather than a consumer indexing records that match nothing.
 */
export function parsePermittedStations(xml: string): PermittedStations[] {
  const held: PermittedStations[] = [];
  const reader = records(record => held.push(record), () => "the document");

  reader.parser.write(xml);
  reader.parser.close();
  reader.check();

  return held;
}

/**
 * A parser that calls `onRecord` for each `<PermittedStations>` it closes, and
 * a `check` to run once the document is finished.
 *
 * `describe` is a function rather than a string so the streaming reader can
 * name the file without this having to know there is one.
 *
 * A record that is not the shape this feed has always had stops the read.
 * Filling a missing attribute with an empty string would give a consumer
 * 308,907 records that match nothing, and the only way anybody would find out
 * is by wondering why a join produced nothing.
 */
function records(onRecord: (record: PermittedStations) => void, describe: () => string) {
  const parser = sax.parser(true, {trim: true});
  let current: Draft | undefined;
  let text = "";
  let depth = 0;
  let root = false;

  parser.onopentag = node => {
    // Depth rather than name alone: a document that merely contains an element
    // of this name somewhere is the wrong document, which is the case this
    // check exists to catch.
    if (depth === 0) {
      root = node.name === ROOT;
    }
    else if (node.name === RECORD) {
      current = draft(node.attributes as Attributes, describe);
    }

    depth++;
    text = "";
  };

  parser.ontext = chunk => {
    text = chunk;
  };

  parser.oncdata = chunk => {
    text = chunk;
  };

  parser.onclosetag = name => {
    depth--;

    if (name === STATION && current !== undefined) {
      if (text === "") {
        throw new Error(`${describe()} has an empty <${STATION}> in ${where(current)}.`);
      }

      current.stations.push(text);
      text = "";
    }
    else if (name === RECORD && current !== undefined) {
      if (current.stations.length === 0) {
        throw new Error(`${describe()} has a record permitting no stations: ${where(current)}.`);
      }

      onRecord(current);
      current = undefined;
    }
  };

  parser.onerror = err => {
    throw new Error(`${describe()} is not valid XML: ${err.message}`);
  };

  // No records and the wrong document entirely look the same to a caller, and
  // the second is the one worth saying out loud.
  const check = () => {
    if (!root) {
      throw new Error(`${describe()} is not a fare group permitted stations feed: no <${ROOT}> root element.`);
    }
  };

  return {parser, check};
}

/** A record while its stations are still arriving. */
interface Draft extends Omit<PermittedStations, "stations"> {
  readonly stations: string[];
}

/** The attributes of a record, as `sax` hands them over. */
type Attributes = {readonly [name: string]: string | undefined};

function draft(attributes: Attributes, describe: () => string): Draft {
  return {
    fareGroup: required(attributes, "FareGroupNlc", describe),
    fareLocation: required(attributes, "FareLocationNlc", describe),
    routeCode: required(attributes, "RouteCode", describe),
    startDate: required(attributes, "StartDate", describe),
    endDate: required(attributes, "EndDate", describe),
    stations: []
  };
}

function required(attributes: Attributes, name: string, describe: () => string): string {
  const value = attributes[name];

  if (value === undefined || value === "") {
    throw new Error(`${describe()} has a <${RECORD}> with no ${name}: ${JSON.stringify(attributes)}.`);
  }

  return value;
}

/** A record named by its codes, for an error a person has to act on. */
function where(record: Draft): string {
  return `${record.fareGroup}/${record.fareLocation} route ${record.routeCode} from ${record.startDate}`;
}
