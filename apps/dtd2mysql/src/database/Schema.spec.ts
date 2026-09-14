import {Field, Record} from "@gb-transit/feed-parser";
import {describe, expect, it} from 'vitest';
import config, {FeedConfig} from "@gb-transit/dtd-schema";
import schema from "./schema";
import {Column, FeedSchema} from "./Schema";
import {FieldType, getFieldType} from "./SchemaDialect";

/**
 * The declarations in config/schema are what the database holds, and the feed definitions have to fit in
 * them.
 *
 * Widening a column without touching the feed is fine, that is the point of the declaration owning the
 * schema. Narrowing one, renaming a column, reordering them or making a nullable field non null is not,
 * and shows up here rather than as a truncated value or a failed insert halfway through an import.
 */
describe("the declared schema", () => {

  for (const [feed, files] of Object.entries(config)) {
    const tables = schema[feed as keyof typeof schema] as FeedSchema;

    it(`describes every table the ${feed} feed writes to`, () => {
      expect(problems(files, tables)).to.deep.equal([]);
    });
  }

});

function problems(files: FeedConfig, tables: FeedSchema): string[] {
  const found: string[] = [];

  for (const record of records(files)) {
    const table = tables[record.name];

    if (!table) {
      found.push(`${record.name} has no declared table`);
      continue;
    }

    const columns = Object.keys(table.columns);
    const fields = Object.keys(record.fields);

    // the writer inserts positionally, so the order is part of the contract and not just the names
    if (columns.join() !== fields.join()) {
      found.push(`${record.name} declares [${columns}] but the feed writes [${fields}]`);
      continue;
    }

    for (const [name, field] of Object.entries(record.fields as { [k: string]: Field })) {
      found.push(...columnProblems(record.name, name, field, table.columns[name]));
    }

    if ([...table.key].join() !== [...record.key].join()) {
      found.push(`${record.name} declares the key [${table.key}] but the feed deletes by [${record.key}]`);
    }
  }

  return found;
}

function columnProblems(table: string, name: string, field: Field, column: Column): string[] {
  const at = `${table}.${name}`;
  const wanted = getFieldType(field);

  if (wanted.type !== column.type.type) {
    return [`${at} is declared ${column.type.type} but the feed parses it as ${wanted.type}`];
  }

  if (field.nullable && !column.nullable) {
    return [`${at} is declared not null but the feed can parse it as null`];
  }

  return capacity(at, wanted, column.type);
}

/**
 * A column has to be able to hold what the feed puts in it. Bigger is fine, smaller is not.
 */
function capacity(at: string, wanted: FieldType, declared: FieldType): string[] {
  if (wanted.type === "text" && declared.type === "text" && declared.length < wanted.length) {
    return [`${at} is declared ${declared.length} characters but the feed parses ${wanted.length}`];
  }

  if (wanted.type === "int" && declared.type === "int" && declared.length < wanted.length) {
    return [`${at} is declared ${declared.length} digits but the feed parses ${wanted.length}`];
  }

  if (wanted.type === "double" && declared.type === "double") {
    if (declared.length < wanted.length || declared.decimalDigits < wanted.decimalDigits) {
      return [`${at} is declared ${declared.length},${declared.decimalDigits} but the feed parses ${wanted.length},${wanted.decimalDigits}`];
    }
  }

  return [];
}

/**
 * Every record of a feed, deduplicated because some files share their record definitions
 */
function records(files: FeedConfig): Record[] {
  return [...new Set(Object.values(files).flatMap(file => file.recordTypes))];
}
