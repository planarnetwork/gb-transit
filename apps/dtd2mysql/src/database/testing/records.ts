import {BooleanField, DateField, DoubleField, FixedWidthRecord, IntField, Record, TextField, TimeField, VariableLengthText, ZeroFillIntField} from "@gb-transit/feed-parser";
import config, {FeedConfig} from "@gb-transit/dtd-schema";
import schema from "../schema";
import {
  boolean, char, date, double, integer, nullable, Table, table, time, varchar
} from "../Schema";

/**
 * A record using every field type, with a unique key and two indexes
 */
export function testRecord(name: string = "test"): Record {
  return new FixedWidthRecord(
    name,
    ["field", "field4"], {
      "field": new IntField(0, 4),
      "field2": new ZeroFillIntField(1, 3),
      "field3": new TextField(2, 5),
      "field4": new VariableLengthText(3, 5),
      "field5": new DateField(7),
      "field6": new TimeField(7, 4),
      "field7": new BooleanField(7),
      "field8": new DoubleField(7, 7, 5),
    },
    ["field5", "field6"]
  );
}

/**
 * A record with a single integer field of the given length
 */
export function intRecord(length: number): Record {
  return new FixedWidthRecord("ints", [], { "sized": new IntField(0, length) }, []);
}

/**
 * Every record type across all of the feeds
 */
export function feedRecords(): Record[] {
  const feeds: FeedConfig[] = Object.values(config);

  return feeds.flatMap(feed => Object.values(feed).flatMap(file => file.recordTypes));
}

/**
 * The declared table matching testRecord, using every column type
 */
export function testTable(): Table {
  return table({
    field: integer(4),
    field2: char(3),
    field3: char(5),
    field4: varchar(5),
    field5: date,
    field6: nullable(time),
    field7: boolean,
    field8: double(7, 5)
  }, {
    key: ["field", "field4"],
    indexes: ["field5", "field6"]
  });
}

/**
 * The declared table matching intRecord
 */
export function intTable(length: number): Table {
  return table({ sized: integer(length) });
}

/**
 * Every declared table across all of the feeds, with its name
 */
export function feedTables(): [string, Table][] {
  return Object.values(schema).flatMap(feed => Object.entries(feed));
}
