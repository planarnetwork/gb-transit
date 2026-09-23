
export class DownloadAndProcessCommand {

  constructor(
    private readonly download: FileProvider,
    private readonly process: FeedProcessor
  ) {}

  /**
   * Download and process the feed in one command.
   *
   * The files are changes applied in order, so processing stops at the first that fails: going on to
   * the next would record it as processed, and the one that failed would never be taken again.
   */
  public async run(argv: string[]): Promise<any> {
    const files = await this.download.run([]);

    try {
      for (const filename of files) {
        await this.process.doImport(filename);
      }
    }
    finally {
      await this.process.end();
    }
  }

}

export interface FileProvider {
  run(args: any[]): Promise<string[]>;
}

/**
 * Whatever consumes a downloaded feed file. The storage apps pass their
 * ImportFeedCommand; a build with no database passes something else.
 */
export interface FeedProcessor {
  doImport(filename: string): Promise<any>;
  end(): Promise<any>;
}