import AdmZip from "adm-zip";
import * as fs from "node:fs";
import {parse} from "node:path";

/**
 * A document's bytes as text, without a byte order mark.
 *
 * Two thirds of the documents in a national Bus Open Data Service archive begin
 * with one, and an XML parser reads it as content before the first tag and
 * rejects the document. `toString("utf8")` keeps it; a `TextDecoder` drops it.
 */
const decoder = new TextDecoder("utf-8");

/** One document of the input, or the reason an entry of it could not be read. */
export type DocumentEntry =
  | {readonly name: string, readonly xml: string}
  | {readonly name: string, readonly error: Error};

/**
 * Every TransXChange document in a file, which is an XML document or a zip of
 * them. A BODS download is a zip of zips of XML, so a zip entry that is itself a
 * zip is opened in turn.
 *
 * A bad entry of a zip is yielded as an error rather than thrown, and the entries
 * after it are still read: a dataset is hundreds of documents from hundreds of
 * registrations, and one of them being corrupt is not a reason to convert none of
 * the rest - see fa74ff8, "ignore errors in individual files". A file that is
 * neither XML nor a zip is a mistake in the arguments, and throws.
 */
export function* documents(file: string): Generator<DocumentEntry> {
  const extension = parse(file).ext.toLowerCase();

  if (extension === ".xml") {
    yield {name: file, xml: decoder.decode(fs.readFileSync(file))};
  }
  else if (extension === ".zip") {
    yield* zipDocuments(new AdmZip(file));
  }
  else {
    throw new Error("Unknown file type: " + file);
  }
}

function* zipDocuments(zip: AdmZip): Generator<DocumentEntry> {
  for (const entry of zip.getEntries()) {
    const name = entry.entryName.toLowerCase();

    if (entry.isDirectory) {
      continue;
    }

    try {
      if (name.endsWith(".xml")) {
        yield {name: entry.entryName, xml: decoder.decode(entry.getData())};
      }
      else if (name.endsWith(".zip")) {
        yield* zipDocuments(new AdmZip(entry.getData()));
      }
      else {
        console.log("Skipping " + entry.entryName);
      }
    }
    catch (err) {
      yield {name: entry.entryName, error: err instanceof Error ? err : new Error(String(err))};
    }
  }
}
