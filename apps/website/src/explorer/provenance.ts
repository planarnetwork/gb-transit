/**
 * The enrichment ledger the nightly publishes beside the feed.
 *
 * This is the file that answers "why does the feed say that". The build records every field an
 * enricher wrote and every write that lost, so a coordinate somebody disputes has an answer that is
 * a line rather than an argument: NaPTAN said this, OSM said that, NaPTAN won because it is priority
 * 50 and OSM is 30.
 *
 * It is published on every release and nothing has ever read it. That is what this is for.
 */

export interface Write {
  readonly enricher: string;
  readonly priority: number;
  readonly value: unknown;
}

export interface FieldHistory {
  readonly entity: string;
  readonly id: string;
  readonly field: string;
  readonly value: unknown;
  readonly by: string;
  /** Writes that lost, most recent first. Empty when nobody contested it. */
  readonly overruled: readonly Write[];
}

export interface EnricherSummary {
  readonly id: string;
  readonly matched: number;
  readonly unmatched: number;
  readonly conflicts: number;
  readonly refused?: number;
}

export interface ProvenanceFile {
  readonly enrichers: readonly EnricherSummary[];
  /** How many fields two enrichers disagreed over at the same priority. Zero is the healthy value. */
  readonly conflicts: number;
  readonly fields: readonly FieldHistory[];
}

/**
 * The ledger, indexed by the entity it is about.
 *
 * The stop view asks it one question - "what did the sources say about this station" - so the whole
 * of the interface is that question. There are 8,038 entries on the current release, which is small
 * enough to hold and far too many to scan per stop.
 */
export class Provenance {

  private readonly byId = new Map<string, FieldHistory[]>();

  constructor(public readonly file: ProvenanceFile) {
    for (const field of file.fields) {
      const existing = this.byId.get(field.id);

      if (existing === undefined) {
        this.byId.set(field.id, [field]);
      }
      else {
        existing.push(field);
      }
    }
  }

  public of(id: string): readonly FieldHistory[] {
    return this.byId.get(id) ?? [];
  }

  public get size(): number {
    return this.file.fields.length;
  }

  /** Every entry where a source was overruled, which is where the interesting questions are. */
  public contested(): readonly FieldHistory[] {
    return this.file.fields.filter(field => field.overruled.length > 0);
  }

}

/**
 * Read a ledger, or nothing.
 *
 * A release published before the build wrote one has none, and so does anybody's own feed. The stop
 * view leaves its provenance panel out rather than rendering an empty one.
 */
export function readProvenance(json: unknown): Provenance | undefined {
  if (json === null || typeof json !== "object") {
    return undefined;
  }

  const file = json as Partial<ProvenanceFile>;

  if (!Array.isArray(file.fields)) {
    return undefined;
  }

  return new Provenance({
    enrichers: Array.isArray(file.enrichers) ? file.enrichers : [],
    conflicts: typeof file.conflicts === "number" ? file.conflicts : 0,
    fields: file.fields
  });
}
