import {Enricher, EnrichmentReport} from "./Enricher";
import {MutableFeed} from "./MutableFeed";

/**
 * Fetch everything at once, then apply in dependency order.
 *
 * The two halves are separate because fetching is slow and independent while
 * applying is quick and ordered. Twelve enrichers is one download, not twelve
 * in a queue.
 */
export async function enrich(feed: MutableFeed, enrichers: readonly Enricher[]): Promise<EnrichmentReport[]> {
  const ordered = order(enrichers);

  // Fetch failures name the enricher. Without this the build fails with a
  // timeout from some HTTP client and no indication which source was down.
  const fetched = await Promise.all(ordered.map(async enricher => {
    try {
      return await enricher.fetch();
    }
    catch (err) {
      throw new Error(`${enricher.key} could not fetch its data: ${message(err)}`);
    }
  }));

  const reports: EnrichmentReport[] = [];

  for (const [i, enricher] of ordered.entries()) {
    const report = enricher.apply(feed, fetched[i]);

    reports.push(report);
    console.log(
      `${enricher.key}: matched ${report.matched}, unmatched ${report.unmatched}, ` +
      `conflicts ${report.conflicts}`
    );

    for (const note of report.notes ?? []) {
      console.log(`  ${note}`);
    }

    // A list naming a field the enricher does not write turns everything away
    // and leaves a config that reads as enabling a source doing nothing. This
    // count is the only way anybody finds out.
    const refused = feed.refusedBy(enricher.key);

    if (refused > 0) {
      console.log(`  ${refused} write(s) turned away by its apply list`);
    }
  }

  return reports;
}

/**
 * Dependency order, settled before anything runs.
 *
 * Every reason to reject is checked up front rather than discovered part way
 * through: a build that has already downloaded four sources and then finds a
 * cycle has wasted the expensive part and left the feed half enriched.
 *
 * Ties are broken by key so the order is the same every run. Two enrichers that
 * do not depend on each other could go either way, and "either way" is how a
 * feed ends up depending on the order a config file happens to list things in.
 */
export function order(enrichers: readonly Enricher[]): Enricher[] {
  const byKey = new Map<string, Enricher>();

  for (const enricher of enrichers) {
    if (byKey.has(enricher.key)) {
      throw new Error(`Two enrichers both call themselves ${enricher.key}.`);
    }

    byKey.set(enricher.key, enricher);
  }

  for (const enricher of enrichers) {
    for (const dependency of enricher.dependsOn) {
      if (!byKey.has(dependency)) {
        throw new Error(
          `${enricher.key} depends on ${dependency}, which is not enabled. ` +
          `Enabled: ${[...byKey.keys()].sort().join(", ") || "nothing"}.`
        );
      }
    }
  }

  const remaining = new Map([...byKey].map(([key, e]) => [key, new Set(e.dependsOn)]));
  const sorted: Enricher[] = [];

  while (remaining.size > 0) {
    const ready = [...remaining]
      .filter(([, waitingFor]) => waitingFor.size === 0)
      .map(([key]) => key)
      .sort();

    if (ready.length === 0) {
      throw new Error(
        `These enrichers depend on each other in a circle: ${[...remaining.keys()].sort().join(", ")}.`
      );
    }

    for (const key of ready) {
      sorted.push(byKey.get(key)!);
      remaining.delete(key);
    }

    for (const waitingFor of remaining.values()) {
      for (const key of ready) {
        waitingFor.delete(key);
      }
    }
  }

  return sorted;
}

/**
 * provenance.json: every field an enricher wrote, and every write that lost.
 *
 * Written whenever an enricher ran, because the question it answers - why does
 * this feed say that - is only ever asked after the fact.
 */
export function provenanceFile(feed: MutableFeed, reports: readonly EnrichmentReport[]) {
  return {
    enrichers: reports.map(report => ({
      id: report.enricher,
      matched: report.matched,
      unmatched: report.unmatched,
      conflicts: report.conflicts,
      // Kept here as well as in the log, because a run's output expires in
      // fourteen days and the question "why is this field not what the source
      // says" is only ever asked later.
      refused: feed.refusedBy(report.enricher)
    })),
    conflicts: feed.ledger.conflicts,
    fields: feed.ledger.entries()
  };
}

function message(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}
