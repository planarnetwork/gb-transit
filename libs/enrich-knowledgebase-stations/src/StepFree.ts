/**
 * The step-free access category a station is classified under.
 *
 * Five of them, set by the operator and audited by the ORR. The Knowledgebase
 * publishes the letter and a paragraph of prose; the letter is the part that
 * can be compared between stations.
 */
export type StepFreeCategory = "A" | "B1" | "B2" | "B3" | "C";

const CATEGORIES = new Set<string>(["A", "B1", "B2", "B3", "C"]);

/**
 * The category out of what the feed publishes.
 *
 * `category` arrives as a letter, a comma and a description - `"A, Compliant
 * step-free access to all platform(s)"` - and the description is only useful
 * for three of the five. B1 and B2 both say "(refer to quick reference guide)",
 * so the letter is the whole of the machine-readable content.
 *
 * 37 of the 2,613 stations have no category at all. They come back undefined
 * rather than as a sixth category, because "not classified" is an absence of
 * data and not a classification.
 */
export function stepFreeCategory(category: string | null | undefined): StepFreeCategory | undefined {
  const letter = String(category ?? "").split(",")[0].trim().toUpperCase();

  return CATEGORIES.has(letter) ? letter as StepFreeCategory : undefined;
}

/**
 * The category as GTFS states it on a station.
 *
 * For a stop with no parent the spec asks whether an accessible path exists
 * from outside to at least one platform: `1` if one does, `2` if none does, `0`
 * if nobody knows. That is a coarser question than the category answers, and
 * the mapping follows from it rather than from how good the access is.
 *
 * So **A, B1, B2 and B3 are all `1`**. A is step-free to every platform, B1 and
 * B2 are step-free to every platform with a constraint - one direction only, or
 * a ramp steep enough to be worth warning about - and B3 reaches only some
 * platforms. In every one of those a path exists, which is what `1` claims.
 * Only C, no step-free access to any platform, is `2`.
 *
 * `2` is not "partial". It tells a wheelchair user not to travel, so it belongs
 * only to the category that means no platform can be reached. The detail that
 * distinguishes A from B3 does not fit in a field with three values, and
 * `stop_url` points at the page that has it.
 */
export function wheelchairBoarding(category: StepFreeCategory | undefined): 0 | 1 | 2 {
  return category === undefined ? 0 : category === "C" ? 2 : 1;
}
