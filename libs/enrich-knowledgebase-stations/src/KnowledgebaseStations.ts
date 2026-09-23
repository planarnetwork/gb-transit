import {Attribution, CRS, Enricher, EnrichmentReport, MutableFeed} from "@gb-transit/gtfs";
import {StepFreeCategory, wheelchairBoarding} from "./StepFree";

/**
 * One Knowledgebase station, reduced to the parts a GTFS stop wants.
 *
 * The feed carries far more than this - facilities, opening hours, car parks,
 * lifts one at a time - and none of it has anywhere to go in GTFS. What is kept
 * is what a stop has a field for, plus the name, which nothing writes and every
 * message about a mismatch needs.
 */
export interface KnowledgebaseStation {
  readonly crs: CRS;
  readonly name: string;
  /** The last part of the station's nationalrail.co.uk address. */
  readonly slug: string;
  readonly stepFree: StepFreeCategory | undefined;
}

export const KNOWLEDGEBASE_STATIONS = "KNOWLEDGEBASE_STATIONS";

const ATTRIBUTION: Attribution = {
  organisation: "National Rail Enquiries",
  licence: "National Rail Enquiries Knowledgebase licence",
  url: "https://www.nationalrail.co.uk/developers/knowledgebase-data-feeds/",
  shareAlike: false
};

/**
 * Whether a wheelchair user can get to a platform, from the Knowledgebase.
 *
 * The DTD says nothing about accessibility, so `wheelchair_boarding` has been
 * coming from a hand-maintained table of 2,442 entries that nothing checked and
 * nothing refreshed. The Knowledgebase is the industry's own record of it:
 * 2,613 stations, each with the step-free category its operator declared and
 * the ORR audits, updated daily.
 *
 * **It joins on CRS**, which is the code the feed identifies a station by and
 * the one the Knowledgebase publishes. Every record has one and no two records
 * share one, so the join needs no reconciliation - unlike NaPTAN, which has to
 * go through the TIPLOC.
 *
 * Two fields. `wheelchair_boarding` cannot express the difference between
 * step-free access in one direction and step-free access to two of four
 * platforms, and `stop_url` points at the page that can.
 *
 * Named for the feed rather than for the source: the Knowledgebase publishes
 * several, and incidents, ticket restrictions and the rest are different data
 * arriving on different terms.
 */
export class KnowledgebaseStationsEnricher implements Enricher<readonly KnowledgebaseStation[]> {

  public readonly key = KNOWLEDGEBASE_STATIONS;
  public readonly dependsOn: readonly string[] = [];
  public readonly attribution = ATTRIBUTION;

  constructor(
    private readonly source: () => Promise<readonly KnowledgebaseStation[]>,
    public readonly priority: number = 50
  ) {}

  public fetch(): Promise<readonly KnowledgebaseStation[]> {
    return this.source();
  }

  public apply(feed: MutableFeed, stations: readonly KnowledgebaseStation[]): EnrichmentReport {
    const byCrs = new Map(stations.map(station => [station.crs, station]));
    const notes: string[] = [];
    const used = new Set<CRS>();

    let matched = 0;
    let unmatched = 0;
    let unclassified = 0;

    for (const station of feed.stations) {
      const knowledgebase = byCrs.get(station.crs);

      if (knowledgebase === undefined) {
        unmatched++;
        continue;
      }

      used.add(knowledgebase.crs);
      matched++;

      // A station the Knowledgebase has not classified is left exactly as it
      // was. Writing the 0 that stands for "no information" would replace a
      // value the override file does have with an assertion that nobody knows,
      // which is a loss dressed up as an enrichment.
      if (knowledgebase.stepFree === undefined) {
        unclassified++;
      }
      else {
        feed.set(station, "wheelchair_boarding", wheelchairBoarding(knowledgebase.stepFree), this);
      }

      if (knowledgebase.slug !== "") {
        feed.set(station, "stop_url", stationUrl(knowledgebase.slug), this);
      }
    }

    // Saying only the number invites somebody to chase it. The Knowledgebase
    // covers National Rail stations; the feed also carries the Underground, the
    // Metro, trams, ferries and buses, which have no record here at all.
    if (unmatched > 0) {
      notes.push(`${unmatched} stops are not National Rail stations, so the Knowledgebase does not cover them`);
    }

    if (unclassified > 0) {
      notes.push(`${unclassified} stations have no step-free category, so their accessibility was left alone`);
    }

    // The other direction, and the one that catches the feed shrinking rather
    // than the source: a station the Knowledgebase knows and this feed does not
    // is a station no train called at in the window, or a code that has moved.
    const surplus = stations.length - used.size;

    if (surplus > 0) {
      notes.push(`${surplus} Knowledgebase stations are not in this feed`);
    }

    return {enricher: this.key, matched, unmatched, conflicts: 0, notes};
  }

}

/**
 * The station's page on nationalrail.co.uk.
 *
 * Built from the slug the feed publishes rather than from the CRS, because the
 * slug is the identity that address is made of; `/stations/ABW/` is not a page.
 * Taken as it is written, including the one record whose slug begins with a
 * capital - lowercasing it produces a 404 where the slug as published is at
 * least what the publisher thinks the address is.
 */
export function stationUrl(slug: string): string {
  return `https://www.nationalrail.co.uk/stations/${slug}/`;
}
