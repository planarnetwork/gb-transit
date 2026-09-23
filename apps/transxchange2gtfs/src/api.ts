import {workingDirectory} from "@gb-transit/gtfs-output";
import {Container, ConverterOptions} from "./Container";

export type {ConverterOptions};

export interface ConvertOptions extends ConverterOptions {
  /** TransXChange XML files, or zips of them. */
  readonly inputs: readonly string[];
  /** A `.zip`, or a directory to write the files into. */
  readonly output: string;
}

/**
 * Convert TransXChange to GTFS.
 *
 * The function the CLI is a wrapper around, so the end to end tests can convert
 * in process and require("transxchange2gtfs") does not run a conversion.
 */
export async function convert(options: ConvertOptions): Promise<void> {
  const converter = await new Container().getConverter({
    ...options,
    tmp: options.tmp ?? workingDirectory(options.output)
  }, options.inputs);

  return converter.process([...options.inputs], options.output);
}
