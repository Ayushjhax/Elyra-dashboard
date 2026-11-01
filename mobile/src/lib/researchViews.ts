import type { EvaluationState } from "@/lib/research/signalTypes";
import type { YieldOpportunity } from "@/lib/research/types";

/* ---------------------------------------------------------------------------
   The Research tabs' decisions, kept out of the components so they are
   tested rather than drawn: where a signal check stands, how pools sort,
   and whether a recap's prices share one source time.
--------------------------------------------------------------------------- */

export type CheckTone = "positive" | "accent" | "caution" | "muted" | "negative";

export interface CheckStatus {
  /** "Within thresholds", "Threshold crossed", "Feed unavailable"… */
  label: string;
  /** One line for the expanded card. */
  detail: string;
  tone: CheckTone;
  /** Only this counts toward "a quiet market". */
  within: boolean;
}

/**
 * Where one family of checks stands. A feed that could not be read, a stale
 * reading or an unsupported asset is never passed off as within thresholds.
 */
export function checkStatus(input: {
  noun: string;
  loading: boolean;
  failed: boolean;
  hasData: boolean;
  state: EvaluationState | undefined;
  triggered: boolean;
}): CheckStatus {
  const { noun } = input;
  if (input.loading) return { label: "Evaluating…", detail: `Reading ${noun} data.`, tone: "muted", within: false };
  if (!input.hasData) {
    return input.failed
      ? { label: "Evaluation failed", detail: "The evaluation could not be run. Try again.", tone: "negative", within: false }
      : { label: "Not evaluated", detail: "No evaluation yet.", tone: "muted", within: false };
  }
  if (input.triggered) return { label: "Threshold crossed", detail: `A ${noun} threshold was crossed — see the observation above.`, tone: "accent", within: false };
  switch (input.state) {
    case "evaluated":
      return { label: "Within thresholds", detail: `No ${noun} threshold crossed.`, tone: "positive", within: true };
    case "stale":
      return { label: "Stale reading", detail: `The ${noun} reading is too old to confirm either way.`, tone: "caution", within: false };
    case "unsupported":
      return { label: "Not supported", detail: `${noun.charAt(0).toUpperCase()}${noun.slice(1)} checks are not available for this asset.`, tone: "muted", within: false };
    default:
      return { label: "Feed unavailable", detail: `The ${noun} feed could not be read, so this check could not run.`, tone: "caution", within: false };
  }
}

export type PoolSort = "apyPct" | "apy30dPct" | "tvlUsd";

/**
 * Highest first by the chosen figure, as numbers. A pool missing that figure
 * goes last; ties keep a fixed order — by name, then vault address — so the
 * list never shuffles between reads.
 */
export function sortPools(pools: readonly YieldOpportunity[], by: PoolSort): YieldOpportunity[] {
  const value = (pool: YieldOpportunity) => {
    const figure = pool[by];
    return typeof figure === "number" && Number.isFinite(figure) ? figure : null;
  };
  return [...pools].sort((a, b) => {
    const left = value(a);
    const right = value(b);
    if (left === null && right !== null) return 1;
    if (right === null && left !== null) return -1;
    if (left !== null && right !== null && left !== right) return right - left;
    return a.name.localeCompare(b.name) || a.id.localeCompare(b.id);
  });
}

/** Pools whose name, asset, provider or vault contains the query (case-insensitive). */
export function searchPools(pools: readonly YieldOpportunity[], query: string): YieldOpportunity[] {
  const needle = query.trim().toLowerCase();
  if (needle === "") return [...pools];
  return pools.filter((pool) => `${pool.name} ${pool.asset} ${pool.provider} ${pool.id}`.toLowerCase().includes(needle));
}

/** The one source time every price shares, or null when they differ (each row then shows its own). */
export function sharedTime(times: readonly (string | null | undefined)[]): string | null {
  const valid = times.filter((time): time is string => typeof time === "string" && Number.isFinite(Date.parse(time)));
  if (valid.length === 0 || valid.length !== times.length) return null;
  const first = Date.parse(valid[0]);
  return valid.every((time) => Date.parse(time) === first) ? valid[0] : null;
}
