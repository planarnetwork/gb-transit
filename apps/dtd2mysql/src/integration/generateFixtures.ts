import * as fs from "node:fs";
import * as path from "node:path";
import config, {FeedConfig} from "@gb-transit/dtd-schema";
import {BooleanField, CSVRecord, DateField, DoubleField, FeedFile, Field, FieldMap, FixedWidthRecord, ForeignKeyField, IntField, MultiRecordFile, NullDateField, Record, RecordAction, ShortDateField, TextField, TimeField, VariableLengthText, ZeroFillIntField} from "@gb-transit/feed-parser";

/**
 * Writes one line per record type for the feeds whose fixtures are generated rather than hand written.
 *
 * A feed like fares is 19 files and 45 tables, which is more than anyone wants to transcribe against the
 * DTD spec by hand. The field definitions already say where every value sits and what it may contain, so
 * the line is built from them and then read back with the record's own parser to prove it is accepted.
 *
 * The data is synthetic, so this checks that the database layer stores and returns what the feed parsed,
 * not that the parsing is right. The timetable fixture is hand written and realistic for that.
 *
 * Run with yarn fixture:generate. The output is committed, so the baseline only moves when someone
 * means it to.
 */

/**
 * Feeds whose files are generated, and the name the archive and its files take.
 *
 * The fifth character of the archive name says whether the feed is a full refresh or a set of changes.
 */
const generated = {
  fares: { feed: config.fares, prefix: "RJFAF999" },
  routeing: { feed: config.routeing, prefix: "RJRGF999" },
  // the nfm64 feed keys its only file on the empty extension, so the file has no extension either
  nfm64: { feed: config.nfm64, prefix: "nfm64" }
};

/**
 * Values that the field definition alone cannot supply.
 *
 * The nfm64 file only accepts four ticket types, and that filter lives in the file rather than the field.
 */
const overrides: { [record: string]: { [field: string]: string } } = {
  nfm64: { ticket_code: "SOS" }
};

function main(): void {
  for (const [name, { feed, prefix }] of Object.entries(generated)) {
    const directory = path.join(__dirname, "fixture", name);

    fs.rmSync(directory, { recursive: true, force: true });
    fs.mkdirSync(directory, { recursive: true });

    for (const [extension, file] of Object.entries(feed as FeedConfig)) {
      const filename = extension === "" ? prefix : `${prefix}.${extension}`;

      fs.writeFileSync(path.join(directory, filename), generateFile(file).join("\n") + "\n");
    }

    console.log(`${name}: ${Object.keys(feed).length} files`);
  }
}

/**
 * One line per record type the file can hold
 */
function generateFile(file: FeedFile): string[] {
  const records: [string | null, Record][] = file instanceof MultiRecordFile
    ? Object.entries(file.records)
    : file.recordTypes.map(record => [null, record]);

  return records.map(([identifier, record]) => generateLine(file, record, identifier));
}

/**
 * Build the line, stamp the record identifier on it and then check the feed agrees with the result
 */
function generateLine(file: FeedFile, record: Record, identifier: string | null): string {
  const body = record instanceof CSVRecord ? csvLine(record) : fixedWidthLine(record);
  const line = identifier === null || !(file instanceof MultiRecordFile)
    ? body
    : write(body, file.typeStart, identifier);

  if (file.getRecord(line) !== record) {
    throw new Error(`${record.name}: the feed does not read this line back as the record it was built from`);
  }

  const { action } = record.extractValues(line);

  if (action !== RecordAction.Insert) {
    throw new Error(`${record.name}: the line parses as ${action} rather than an insert`);
  }

  return line;
}

/**
 * Fixed width fields are written loosest first, so that where two fields overlap the one that would
 * reject the other's value is the one that ends up deciding the characters.
 */
function fixedWidthLine(record: Record): string {
  if (!(record instanceof FixedWidthRecord)) {
    throw new Error(`${record.name}: no idea how to build a line for a ${record.constructor.name}`);
  }

  const fields = Object.entries(record.fields as FieldMap);
  const end = fields.map(([, field]) => field.position + field.length);
  let line = " ".repeat(Math.max(record.charPosition + 1, ...end));

  for (const [name, field] of [...fields].sort(([, a], [, b]) => strictness(a) - strictness(b))) {
    line = write(line, field.position, valueFor(field, record.name, name));
  }

  return Object.keys(record.actionMap).length === 0
    ? line
    : write(line, record.charPosition, insertCharacter(record));
}

/**
 * The delimited files address their fields by column rather than by character.
 *
 * A negative position counts back from the end, so the line needs enough columns for those to land past
 * the ones counted from the front. Columns no field claims are filled so the shape is still a valid line.
 */
function csvLine(record: CSVRecord): string {
  if (typeof record.fieldDelimiter !== "string") {
    throw new Error(`${record.name}: only a plain delimiter can be written back out`);
  }

  const fields = Object.entries(record.fields as FieldMap);
  const positions = fields.map(([, field]) => field.position);
  const columns = Array(columnCount(positions)).fill("X");

  for (const [name, field] of fields) {
    columns[(field.position + columns.length) % columns.length] = valueFor(field, record.name, name);
  }

  return columns.join(record.fieldDelimiter);
}

function columnCount(positions: number[]): number {
  const front = Math.max(0, ...positions.map(position => position + 1));
  const back = Math.max(0, ...positions.map(position => -position));

  return front + back;
}

/**
 * The character that makes the record an insert, preferring one the record names
 */
function insertCharacter(record: FixedWidthRecord): string {
  const insert = Object.entries(record.actionMap).find(([, action]) => action === RecordAction.Insert);

  if (insert) {
    return insert[0];
  }

  // anything the map does not mention is treated as an insert
  const unmapped = [..."IRNABCDEFG"].find(character => !(character in record.actionMap));

  if (!unmapped) {
    throw new Error(`${record.name}: every character maps to an action other than insert`);
  }

  return unmapped;
}

/**
 * A value the field will accept, of exactly the width the field occupies
 */
function valueFor(field: Field, record: string, name: string): string {
  const override = overrides[record]?.[name];

  if (override !== undefined) {
    return override;
  }

  // VariableLengthText extends TextField, everything else here extends Field directly
  if (field instanceof TextField) return "A".repeat(field.length);
  if (field instanceof ZeroFillIntField) return "1".repeat(field.length);
  if (field instanceof BooleanField) return field.truthyChars[0];
  if (field instanceof ShortDateField) return "250101";
  if (field instanceof NullDateField) return "";
  if (field instanceof DateField) return "01012025";
  if (field instanceof TimeField) return "1000".padEnd(field.length, " ").substring(0, field.length);
  if (field instanceof DoubleField) return doubleFor(field);
  if (field instanceof IntField) return "1".repeat(field.length);
  if (field instanceof ForeignKeyField) return "1";

  throw new Error(`${record}.${name}: no value for a ${field.constructor.name}`);
}

/**
 * A number that fits both the width of the field and the precision of the column it is stored in
 */
function doubleFor(field: DoubleField): string {
  const whole = field.length - field.decimalDigits - 1;

  return whole > 0
    ? `${"1".repeat(whole)}.${"1".repeat(field.decimalDigits)}`
    : "1".repeat(field.length);
}

/**
 * How badly a field reacts to being handed another field's characters, lowest first
 */
function strictness(field: Field): number {
  if (field instanceof BooleanField || field instanceof IntField || field instanceof DoubleField) return 3;
  if (field instanceof DateField || field instanceof ShortDateField) return 2;
  if (field instanceof TimeField) return 1;

  return 0;
}

function write(line: string, position: number, value: string): string {
  const padded = line.padEnd(position, " ");

  return padded.substring(0, position) + value + padded.substring(position + value.length);
}

main();
