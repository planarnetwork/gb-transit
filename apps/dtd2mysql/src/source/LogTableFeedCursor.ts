import {Kysely} from "kysely";
import {FeedCursor} from "@gb-transit/dtd-source";
import {Database} from "../database/Database";

/**
 * The last processed file as recorded by ImportFeedCommand in the log table.
 *
 * A missing table and an empty log both mean "start from the most recent full
 * refresh", which is why the error is swallowed rather than reported.
 */
export class LogTableFeedCursor implements FeedCursor {

  constructor(private readonly db: Kysely<Database>) {}

  public async getLastProcessedFile(): Promise<string | undefined> {
    try {
      const [log] = await this.db
        .selectFrom("log")
        .select("filename")
        .orderBy("id", "desc")
        .limit(1)
        .execute();

      return log?.filename ?? undefined;
    }
    catch (err) {
      return undefined;
    }
  }

}
