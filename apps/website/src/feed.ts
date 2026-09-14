import {RELEASE} from "./site.js";

/**
 * What the nightly build publishes about itself, alongside the feeds.
 *
 * Everything the site claims about a feed is read from this rather than written
 * into a page, so it cannot drift from what was actually built. Optional fields
 * are optional because releases published before a field existed do not carry
 * it, and a page that renders `undefined` is worse than one that says nothing.
 */
export interface FeedMeta {
  built: string;
  commit: string;
  trips: number;
  feed_version: string;
  feed_start_date: string;
  feed_end_date: string;
  stop_times?: number;
  /** The lines the standard feed's trips run over. */
  shapes?: number;
  shape_points?: number;
  /**
   * The National Rail only feed. Absent until the build that produces it
   * reaches master, which is the whole reason platform two renders as a
   * placeholder rather than as a download link that would 404.
   */
  trips_national_rail_only?: number;
  stop_times_national_rail_only?: number;
  /**
   * Who the feed was built from, as the build itself credited them. Older
   * releases predate this and have none, which is why the page falls back to
   * naming the timetable rather than showing an empty list.
   */
  sources?: Source[];
}

export interface Source {
  organisation: string;
  licence: string;
  url?: string;
}

/**
 * The one source every feed has had. Only used for a release published before
 * the build started declaring them.
 *
 * NaPTAN is Open Government Licence v3.0, which makes acknowledgement a
 * condition of use - so a hardcoded list that forgets a source is not just out
 * of date, it is the page failing to do the one thing it is for. This is a
 * fallback for an empty list, never an addition to a real one.
 */
const TIMETABLE: Source = {
  organisation: "Rail Delivery Group",
  licence: "Rail Settlement Plan data licence",
  url: "https://raildata.org.uk/"
};

export function sources(feed: FeedMeta | undefined): Source[] {
  return feed?.sources?.length ? feed.sources : [TIMETABLE];
}

/**
 * One of the zips the nightly build publishes.
 *
 * `platform` because that is how the page presents them, and the metaphor is
 * doing real work: they leave from the same station, they are the same trains,
 * and which one you want depends on where you are going.
 */
export interface Feed {
  platform: number;
  file: string;
  summary: string;
  points: string[];
  /** What this feed holds, from the release, or nothing when it holds nothing yet. */
  figures(feed: FeedMeta | undefined): Figure[];
  /**
   * Whether this feed is in the latest release. A feed that is not gets a
   * placeholder rather than a download link, so the page cannot advertise an
   * asset that would 404.
   */
  published(feed: FeedMeta | undefined): boolean;
}

export interface Figure {
  label: string;
  value: string;
}

export const FEEDS: Feed[] = [
  {
    platform: 1,
    file: "gtfs.zip",
    summary: "The standard feed. Stops where passengers can board and alight, and nothing else — " +
      "the shape every routing engine and trip planner expects.",
    points: [
      "Drops straight into OpenTripPlanner",
      "Smaller, faster to load",
      "Splits and joins resolved",
      "Every trip drawn as a line"
    ],
    figures: feed => rows([
      ["Trips", feed && number(feed.trips)],
      ["Stop times", feed?.stop_times !== undefined && number(feed.stop_times)],
      ["Shapes", feed?.shapes !== undefined && number(feed.shapes)]
    ]),
    published: feed => feed !== undefined
  },
  {
    platform: 2,
    file: "gtfs-national-rail-only.zip",
    summary: "The standard feed without the services National Rail does not hold authority over — " +
      "no tube, no Metro, no ferries, no scheduled buses, and no replacement buses TfL runs.",
    points: [
      "For a feed merged with other sources",
      "Where those sources describe the metro better",
      "Same identifiers as the standard feed"
    ],
    figures: feed => rows([
      ["Trips", feed?.trips_national_rail_only !== undefined && number(feed.trips_national_rail_only)],
      ["Stop times", feed?.stop_times_national_rail_only !== undefined
        && number(feed.stop_times_national_rail_only)]
    ]),
    published: feed => feed?.trips_national_rail_only !== undefined
  }
];

/**
 * A figure the release did not carry is left out rather than rendered as a
 * blank, because a labelled empty value reads as a feed holding none of
 * something rather than as a release that predates the count.
 */
function rows(pairs: [string, string | false | undefined][]): Figure[] {
  return pairs
    .filter((pair): pair is [string, string] => typeof pair[1] === "string")
    .map(([label, value]) => ({label, value}));
}

export function download(feed: Feed): string {
  return `${RELEASE}/${feed.file}`;
}

/** `20260904` as `04/09/2026`, which is how a date is written here. */
export function date(yyyymmdd: string): string {
  return `${yyyymmdd.slice(6, 8)}/${yyyymmdd.slice(4, 6)}/${yyyymmdd.slice(0, 4)}`;
}

export function number(value: number): string {
  return value.toLocaleString("en-GB");
}

export function built(feed: FeedMeta): string {
  return new Date(feed.built).toLocaleString("en-GB", {
    day: "numeric", month: "short", year: "numeric",
    hour: "2-digit", minute: "2-digit", timeZone: "UTC"
  });
}

/**
 * The four figures the departure board shows. In the order a board shows them:
 * where it goes, how much of it there is, and what it was made from.
 */
export function board(feed: FeedMeta): Figure[] {
  return [
    {label: "Covers", value: `${date(feed.feed_start_date)} → ${date(feed.feed_end_date)}`},
    {label: "Trips", value: number(feed.trips)},
    {label: "Built from", value: feed.feed_version},
    {label: "Built", value: built(feed)}
  ];
}

/**
 * The latest release's own description of itself.
 *
 * Fetched once per build. A page that builds without the network is worth more
 * than one that fails, so a failure here is a site with less to say rather than
 * a deploy that does not happen - every caller already handles the case where
 * nothing has been published at all.
 */
let pending: Promise<FeedMeta | undefined> | undefined;

export function latest(): Promise<FeedMeta | undefined> {
  pending ??= fetchLatest();

  return pending;
}

async function fetchLatest(): Promise<FeedMeta | undefined> {
  try {
    const response = await fetch(`${RELEASE}/feed-meta.json`, {redirect: "follow"});

    return response.ok ? await response.json() as FeedMeta : undefined;
  }
  catch {
    return undefined;
  }
}
