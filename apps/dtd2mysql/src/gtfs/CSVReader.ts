import * as fs from "fs";
import * as readline from "node:readline";

export interface CSVRow {
  readonly [column: string]: string;
}

/**
 * Read a GTFS file a row at a time, keyed by the column names in its header.
 *
 * The files are written by csv-write-stream, which quotes any value containing a comma, a quote or a
 * newline and doubles the quotes inside it. LOAD DATA was told about the comma and nothing else, so a
 * station name with one in it used to arrive split in two.
 */
export async function* readCSV(filename: string): AsyncGenerator<CSVRow> {
  const input = readline.createInterface({
    input: fs.createReadStream(filename, "utf8"),
    crlfDelay: Infinity
  });

  let header: string[] | undefined;
  let pending = "";
  let row = 0;

  for await (const text of input) {
    pending = pending.length === 0 ? withoutByteOrderMark(text) : `${pending}\n${text}`;

    const values = splitCSVRecord(pending);

    if (!values) {
      continue;
    }

    pending = "";

    if (!header) {
      header = values;
    }
    // a file ending in a newline reads as one empty value, which is not a row
    else if (values.length > 1 || values[0] !== "") {
      if (values.length !== header.length) {
        throw new Error(
          `${filename} row ${row} has ${values.length} values where the header has ${header.length} columns.`
        );
      }

      yield Object.fromEntries(header.map((column, i) => [column, values[i]]));
    }

    row++;
  }
}

/**
 * The specification permits a GTFS file to start with a byte order mark, and nothing in the stream
 * strips it. Left on, it is part of the first column's name, so the column is one no table has.
 */
function withoutByteOrderMark(line: string): string {
  return line.charCodeAt(0) === 0xfeff ? line.slice(1) : line;
}

/**
 * Split one record into its values, or return nothing when the text is not a whole record yet because a
 * quoted value has a newline inside it
 */
export function splitCSVRecord(text: string): string[] | undefined {
  const values: string[] = [];
  let value = "";
  let quoted = false;

  for (let i = 0; i < text.length; i++) {
    const character = text[i];

    if (quoted) {
      // a doubled quote is one quote, a single one ends the value
      if (character !== '"') {
        value += character;
      }
      else if (text[i + 1] === '"') {
        value += '"';
        i++;
      }
      else {
        quoted = false;
      }
    }
    // only a value that starts with a quote is quoted, as that is all the writer produces
    else if (character === '"' && value.length === 0) {
      quoted = true;
    }
    else if (character === ",") {
      values.push(value);
      value = "";
    }
    else {
      value += character;
    }
  }

  return quoted ? undefined : [...values, value];
}
