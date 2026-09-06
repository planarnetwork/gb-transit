import {Writable} from "stream";
import {TableWriter} from "./TableWriter";
import {FeedFile} from "@gb-transit/feed-parser";

export class RecordStream extends Writable {

  constructor(
    private readonly filename: string,
    private readonly file: FeedFile,
    private readonly tables: TableIndex
  ) {
    super({ decodeStrings: false });
  }

  public async _write(line: string, encoding: string, callback: WritableCallback): Promise<void> {
    if (line === "" || line.charAt(0) === "/") {
      return callback();
    }

    try {
      const record = this.file.getRecord(line);

      if (record) {
        await this.tables[record.name].apply(record.extractValues(line));
      }

      callback();
    }
    catch (err) {
      const details = err instanceof Error ? err.stack : String(err);

      callback(Error(`Error processing ${this.filename} with data ${line}` + details));
    }
  }

  public async _final(callback: WritableCallback): Promise<void> {
    try {
      await Promise.all(Object.values(this.tables).map(t => t.close()));

      callback();
    }
    catch (err) {
      callback(err instanceof Error ? err : Error(String(err)));
    }
  }

}

export type WritableCallback = (error?: Error | null) => void;

export type TableIndex = {
  [tableName: string]: TableWriter;
}
