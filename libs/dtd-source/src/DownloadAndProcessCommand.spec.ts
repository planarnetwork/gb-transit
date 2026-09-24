import {describe, expect, it} from "vitest";
import {DownloadAndProcessCommand, FeedProcessor} from "./DownloadAndProcessCommand";

describe("DownloadAndProcessCommand", () => {

  it("processes every file in order", async () => {
    const processor = new RecordingProcessor();

    await new DownloadAndProcessCommand(downloads(["C101", "C102"]), processor).run([]);

    expect(processor.imported).to.deep.equal(["C101", "C102"]);
    expect(processor.ended).to.equal(true);
  });

  it("stops at the first file that fails, so a later one is not recorded past it", async () => {
    const processor = new RecordingProcessor(["C101"]);

    await expect(new DownloadAndProcessCommand(downloads(["C101", "C102"]), processor).run([]))
      .rejects.toThrow("C101 failed");

    expect(processor.imported).to.deep.equal([]);
    expect(processor.ended).to.equal(true);
  });

  it("reports the failure that stopped it rather than one from closing", async () => {
    const processor = new RecordingProcessor(["C101"], new Error("already closed"));

    await expect(new DownloadAndProcessCommand(downloads(["C101"]), processor).run([]))
      .rejects.toThrow("C101 failed");
  });

  it("reports a failure to close when nothing else failed", async () => {
    const processor = new RecordingProcessor([], new Error("already closed"));

    await expect(new DownloadAndProcessCommand(downloads(["C101"]), processor).run([]))
      .rejects.toThrow("already closed");
  });

});

const downloads = (files: string[]) => ({ run: async () => files });

class RecordingProcessor implements FeedProcessor {
  public readonly imported: string[] = [];
  public ended = false;

  constructor(private readonly failing: string[] = [], private readonly closing?: Error) {}

  public async doImport(filename: string): Promise<void> {
    if (this.failing.includes(filename)) {
      throw new Error(`${filename} failed`);
    }

    this.imported.push(filename);
  }

  public async end(): Promise<void> {
    this.ended = true;

    if (this.closing) {
      throw this.closing;
    }
  }
}
