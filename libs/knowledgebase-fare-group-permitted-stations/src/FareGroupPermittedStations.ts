import * as fs from "node:fs";
import sax from "sax";
import {PermittedStations} from "./PermittedStations";

const ROOT = "FareGroupPermittedStations";
const RECORD = "PermittedStations";
const STATION = "Crs";

/**
 * Every record of the document, without holding them all.
 *
 * The feed is 59MB and 308,907 records. Reading it whole into a DOM - which is
 * what `xml2js` does, and what the only XML parsing in this repository does
 * today - costs 551MB of heap for a document a consumer usually wants to index
 * and then discard. Writing a chunk to the parser and yielding what it produced
 * is 71MB: the generator hands each record straight to its consumer, and the
 * next chunk is not read until the last one has been drained.
 *
 * `sax` rather than a scanner over the text. The document is machine generated
 * and utterly regular, which is the argument that talks people into parsing XML
 * with a regular expression, and it stops being true the first time the
 * publisher indents something differently.
 */
export async function* permittedStations(file: string): AsyncGenerator<PermittedStations> {
  let batch: PermittedStations[] = [];
  const reader = records(record => batch.push(record), () => file);
  let first = true;

  for await (const chunk of fs.createReadStream(file, "utf8")) {
    // Two thirds of the documents in a national BODS archive begin with a byte
    // order mark, and so does this one. A strict parser reads it as content
    // before the root element and rejects the document.
    reader.parser.write(first ? String(chunk).replace(/^﻿/, "") : String(chunk));
    first = false;

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
 * Around 250MB for the 309,000 of them. Worth it for a consumer that is going
 * to index the whole set anyway; `permittedStations` is there for one that is
 * not.
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
 * rather than an enrichment that quietly matches nothing.
 */
export function parsePermittedStations(xml: string): PermittedStations[] {
  const held: PermittedStations[] = [];
  const reader = records(record => held.push(record), () => "the document");

  reader.parser.write(xml.replace(/^﻿/, ""));
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
 */
function records(onRecord: (record: PermittedStations) => void, describe: () => string) {
  const parser = sax.parser(true);
  let current: Draft | undefined;
  let text = "";
  let root = false;

  parser.onopentag = node => {
    if (node.name === ROOT) {
      root = true;
    }
    else if (node.name === RECORD) {
      current = draft(node.attributes as Attributes);
    }

    text = "";
  };

  // A text node arrives in as many pieces as the chunking happens to split it
  // into, so it is accumulated and trimmed once at the close rather than
  // trimmed on the way in. `sax`'s own `trim` option would turn a `CET` that
  // straddles a chunk boundary into `CE` and `T`.
  parser.ontext = chunk => {
    text += chunk;
  };

  parser.oncdata = chunk => {
    text += chunk;
  };

  parser.onclosetag = name => {
    if (name === STATION && current !== undefined) {
      current.stations.push(text.trim());
    }
    else if (name === RECORD && current !== undefined) {
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
      throw new Error(`${describe()} is not a fare group permitted stations feed: no <${ROOT}> element.`);
    }
  };

  return {parser, check};
}

/** A record while its stations are still arriving. */
interface Draft extends Omit<PermittedStations, "stations"> {
  readonly stations: string[];
}

/** The attributes of a record, as `sax` hands them over. */
type Attributes = {readonly [name: string]: string};

function draft(attributes: Attributes): Draft {
  return {
    fareGroup: attributes.FareGroupNlc ?? "",
    fareLocation: attributes.FareLocationNlc ?? "",
    routeCode: attributes.RouteCode ?? "",
    startDate: attributes.StartDate ?? "",
    endDate: attributes.EndDate ?? "",
    stations: []
  };
}
