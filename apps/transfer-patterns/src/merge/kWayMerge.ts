/**
 * Merge sorted, duplicate-free sequences into one, still sorted and still duplicate-free.
 *
 * Each shard has already been through `TransferPatternMerge`, which sorts a bucket with
 * `[...set].sort()` - a plain lexicographic sort of the whole line. So the order here has to be
 * that same order, and the comparison below is `<` on the joined codes rather than anything
 * cleverer. Get it wrong and `FrontCoder` still writes a file: one that decodes into patterns
 * nobody ever found, rather than one that fails. Hence the tests.
 *
 * Linear in the output and holding one pattern per shard, rather than the deal-into-buckets and
 * sort-each that produced the shards. That matters because this is the one stage that cannot be
 * sharded: it is the last thing the nightly does and the whole file goes through it.
 */
export async function* kWayMerge(
  sources: readonly AsyncIterable<string[]>[]
): AsyncGenerator<string[]> {
  const heads = await Promise.all(sources.map(source => advance(source[Symbol.asyncIterator]())));

  let previous: string | undefined;

  for (;;) {
    let lowest = -1;

    for (let i = 0; i < heads.length; i++) {
      if (heads[i].key !== undefined && (lowest === -1 || heads[i].key! < heads[lowest].key!)) {
        lowest = i;
      }
    }

    if (lowest === -1) {
      return;
    }

    const {pattern, key} = heads[lowest] as {pattern: string[]; key: string};

    heads[lowest] = await advance(heads[lowest].iterator);

    // The same pattern is found from both ends of the journey, so two shards can hold it and the
    // merge brings those copies next to each other. One is enough.
    if (key !== previous) {
      previous = key;

      yield pattern;
    }
  }
}

interface Head {
  readonly iterator: AsyncIterator<string[]>;
  readonly pattern?: string[];
  /** The joined pattern, kept rather than rebuilt: every one of these is compared several times. */
  readonly key?: string;
}

async function advance(iterator: AsyncIterator<string[]>): Promise<Head> {
  const next = await iterator.next();

  return next.done
    ? {iterator}
    : {iterator, pattern: next.value, key: next.value.join("")};
}
