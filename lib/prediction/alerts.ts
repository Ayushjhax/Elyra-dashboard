import "server-only";

import { serviceClient } from "@/lib/supabase/server";
import type { BookAnalytics } from "@/lib/prediction/book-analytics";

/* ---------------------------------------------------------------------------
   Prediction alerts.

   ── Why an alert is a state machine, not a predicate ───────────────────

   "Tell me when YES goes above 65¢" evaluated as a predicate on every book
   update fires continuously for as long as the condition holds. On a live
   feed that is dozens of identical messages a minute, which trains a user to
   mute the bot — after which the one alert that mattered is also muted.

   So a rule is ARMED, fires once on the crossing, moves to TRIGGERED, and
   re-arms only when the condition clears. A cooldown suppresses a re-fire
   even after clearing, for a price oscillating around the level.

   ── Thresholds are stored, never inferred ──────────────────────────────

   Inferring "above" from the price at creation time means an alert created
   while the market is moving can end up meaning the opposite of what was
   asked for. The direction the user said is the direction stored.

   Tenancy: `serviceClient()` bypasses RLS, so `.eq("user_id", …)` IS the
   boundary. The evaluator's global read returns no rule to any user.
--------------------------------------------------------------------------- */

export type AlertKind =
  | "price_above"
  | "price_below"
  | "probability_change"
  | "orderbook_imbalance"
  | "spread_expansion"
  | "spread_compression"
  | "liquidity_change"
  | "signal_new"
  | "signal_entry"
  | "signal_target"
  | "signal_invalidated"
  | "signal_expired"
  | "market_resolution";

export type AlertState = "armed" | "triggered" | "disabled";

export interface PredictionAlertRule {
  id: string;
  userId: string;
  marketId: string;
  tokenId: string | null;
  marketQuestion: string | null;
  outcomeLabel: string | null;
  kind: AlertKind;
  threshold: number | null;
  signalId: string | null;
  state: AlertState;
  lastValue: number | null;
  triggeredAt: string | null;
  cooldownSeconds: number;
  createdAt: string;
}

interface Row {
  id: string;
  user_id: string;
  market_id: string;
  token_id: string | null;
  market_question: string | null;
  outcome_label: string | null;
  kind: AlertKind;
  threshold: number | null;
  signal_id: string | null;
  state: AlertState;
  last_value: number | null;
  triggered_at: string | null;
  cooldown_seconds: number;
  created_at: string;
}

function toRule(row: Row): PredictionAlertRule {
  return {
    id: row.id,
    userId: row.user_id,
    marketId: row.market_id,
    tokenId: row.token_id,
    marketQuestion: row.market_question,
    outcomeLabel: row.outcome_label,
    kind: row.kind,
    threshold: row.threshold,
    signalId: row.signal_id,
    state: row.state,
    lastValue: row.last_value,
    triggeredAt: row.triggered_at,
    cooldownSeconds: row.cooldown_seconds,
    createdAt: row.created_at,
  };
}

/* ---------------------------------------------------------------------------
   Natural language → a validated rule (spec §59)
--------------------------------------------------------------------------- */

export interface ParsedAlert {
  kind: AlertKind;
  threshold: number | null;
}

/**
 * Compiles a phrase into a rule.
 *
 * Returns null rather than a best guess. An alert built from a misread phrase
 * is worse than no alert: it fires on the wrong condition and the user
 * believes they are covered.
 *
 * Prices are accepted as cents ("65"), percent ("65%") and decimals ("0.65"),
 * and are normalised to the internal 0–1 domain. The ambiguity in a bare
 * "0.65" is resolved as a probability because that is the domain of the
 * instrument; a bare "65" is cents because that is how the number is spoken.
 */
export function parsePredictionAlert(text: string): ParsedAlert | null {
  const lower = text.toLowerCase().trim();
  if (lower.length === 0) return null;

  /* Signal lifecycle rules carry no threshold — they reference a stored
     signal id, which the caller supplies. */
  if (/(enters?|entry|triggers?|setup\s+(?:enters|triggers))/.test(lower)) {
    return { kind: "signal_entry", threshold: null };
  }
  if (/target\s+(?:is\s+)?(?:hit|reached)|hits?\s+target/.test(lower)) {
    return { kind: "signal_target", threshold: null };
  }
  if (/invalid|stopped\s+out|no\s+longer\s+(?:valid|active)/.test(lower)) {
    return { kind: "signal_invalidated", threshold: null };
  }
  if (/resolv|settles?/.test(lower)) {
    return { kind: "market_resolution", threshold: null };
  }

  /* Accepts "0.3", ".3", "30" and "-0.3". Requiring a digit before the
     point drops a bare ".3", which is how the threshold is usually typed. */
  const number = /(-?(?:\d+(?:\.\d+)?|\.\d+))\s*(%|¢|c\b|cents?)?/.exec(lower);
  const raw = number === null ? null : Number.parseFloat(number[1]);
  const unit = number?.[2] ?? "";

  if (/imbalance/.test(lower)) {
    /* Imbalance is already −1..1 and is never a percentage here. */
    if (raw === null || raw < -1 || raw > 1) return null;
    return { kind: "orderbook_imbalance", threshold: raw };
  }

  if (/spread/.test(lower)) {
    if (raw === null || raw <= 0) return null;
    const widens = /wide|expand|blow|above|over|more/.test(lower);
    /* Spread thresholds are in POINTS, which is how a prediction trader
       speaks: "alert me if the spread goes above 3" means 3¢. */
    return { kind: widens ? "spread_expansion" : "spread_compression", threshold: raw };
  }

  if (/liquidity|depth/.test(lower)) {
    if (raw === null || raw <= 0) return null;
    return { kind: "liquidity_change", threshold: raw };
  }

  if (/moves?|change[sd]?|swing/.test(lower)) {
    if (raw === null || raw <= 0) return null;
    /* POINTS, not percent. A market going 54% → 64% is a 10-point move and
       an 18.5% relative one; "tell me if it moves 10" means the first, and
       reading it as the second fires roughly twice as often as asked. */
    return { kind: "probability_change", threshold: raw };
  }

  if (raw === null) return null;

  const probability =
    unit === "%" ? raw / 100 : unit === "" && raw > 1 ? raw / 100 : raw > 1 ? raw / 100 : raw;

  if (!Number.isFinite(probability) || probability <= 0 || probability >= 1) return null;

  const below = /below|under|beneath|drops?|falls?|less/.test(lower);
  const above = /above|over|breaks?|crosses|exceeds?|hits?|reach/.test(lower);

  /* Neither word present is not "pick one" — it is an unreadable instruction,
     and an alert that guesses is an alert that fires on the wrong side. */
  if (!below && !above) return null;

  return { kind: below ? "price_below" : "price_above", threshold: probability };
}

/* ---------------------------------------------------------------------------
   Storage
--------------------------------------------------------------------------- */

export async function createPredictionAlert(input: {
  userId: string;
  marketId: string;
  tokenId: string | null;
  marketQuestion?: string | null;
  outcomeLabel?: string | null;
  kind: AlertKind;
  threshold: number | null;
  signalId?: string | null;
  cooldownSeconds?: number;
}): Promise<string | null> {
  const { data, error } = await serviceClient()
    .from("prediction_alert_rules")
    .upsert(
      {
        user_id: input.userId,
        market_id: input.marketId,
        token_id: input.tokenId,
        market_question: input.marketQuestion ?? null,
        outcome_label: input.outcomeLabel ?? null,
        kind: input.kind,
        threshold: input.threshold,
        signal_id: input.signalId ?? null,
        /* Explicitly re-armed. Re-sending the same request for a rule that
           already fired should arm it again, not leave it silent. */
        state: "armed",
        triggered_at: null,
        last_value: null,
        cooldown_seconds: input.cooldownSeconds ?? 300,
        updated_at: new Date().toISOString(),
      },
      { onConflict: "user_id,market_id,token_id,kind,threshold" },
    )
    .select("id")
    .single();

  if (error !== null || data === null) return null;
  return data.id as string;
}

export async function listPredictionAlerts(userId: string): Promise<PredictionAlertRule[]> {
  const { data, error } = await serviceClient()
    .from("prediction_alert_rules")
    .select("*")
    .eq("user_id", userId)
    .order("created_at", { ascending: false })
    .limit(100);

  if (error !== null || data === null) return [];
  return (data as Row[]).map(toRule);
}

/** Deletes one rule, scoped to its owner. */
export async function deletePredictionAlert(userId: string, id: string): Promise<boolean> {
  const { error } = await serviceClient()
    .from("prediction_alert_rules")
    .delete()
    .eq("id", id)
    .eq("user_id", userId);

  return error === null;
}

/** Every armed rule for a token. The evaluator's read. */
export async function armedRulesFor(tokenIds: string[]): Promise<PredictionAlertRule[]> {
  if (tokenIds.length === 0) return [];

  const { data, error } = await serviceClient()
    .from("prediction_alert_rules")
    .select("*")
    .eq("state", "armed")
    .in("token_id", tokenIds)
    .limit(500);

  if (error !== null || data === null) return [];
  return (data as Row[]).map(toRule);
}

export async function markAlertTriggered(id: string, value: number | null): Promise<void> {
  await serviceClient()
    .from("prediction_alert_rules")
    .update({
      state: "triggered",
      last_value: value,
      triggered_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    })
    .eq("id", id);
}

export async function rearmAlert(id: string, value: number | null): Promise<void> {
  await serviceClient()
    .from("prediction_alert_rules")
    .update({ state: "armed", last_value: value, updated_at: new Date().toISOString() })
    .eq("id", id);
}

/* ---------------------------------------------------------------------------
   Evaluation
--------------------------------------------------------------------------- */

export interface AlertObservation {
  /** Current price for the rule's outcome — the midpoint. */
  price: number | null;
  analytics: BookAnalytics | null;
  /** Probability points moved over the comparison window. */
  changePoints?: number | null;
  now?: number;
}

export type AlertDecision =
  | { action: "fire"; value: number | null; message: string }
  | { action: "rearm"; value: number | null }
  | { action: "hold" };

/**
 * What one observation does to one rule.
 *
 * Pure, so the dedupe behaviour is testable without a database, a venue or a
 * clock. Returns `hold` in the overwhelmingly common case, and `hold` must
 * produce neither a write nor a message.
 */
export function evaluateAlert(
  rule: PredictionAlertRule,
  observation: AlertObservation,
): AlertDecision {
  const now = observation.now ?? Date.now();
  const reading = currentValue(rule, observation);
  if (reading === null) return { action: "hold" };

  const met = conditionMet(rule, reading);

  if (rule.state === "triggered") {
    /* Re-arm only once the condition has CLEARED. A rule that re-armed while
       still true would fire again immediately, which is the behaviour the
       state machine exists to prevent. */
    if (!met) {
      const since = rule.triggeredAt === null ? Infinity : now - Date.parse(rule.triggeredAt);
      if (since >= rule.cooldownSeconds * 1000) return { action: "rearm", value: reading };
    }
    return { action: "hold" };
  }

  if (rule.state !== "armed") return { action: "hold" };
  if (!met) return { action: "hold" };

  return { action: "fire", value: reading, message: describe(rule, reading) };
}

function currentValue(rule: PredictionAlertRule, observation: AlertObservation): number | null {
  switch (rule.kind) {
    case "price_above":
    case "price_below":
      return observation.price;
    case "orderbook_imbalance":
      return observation.analytics?.depth.top5.imbalance ?? null;
    case "spread_expansion":
    case "spread_compression":
      return observation.analytics?.spreadPoints ?? null;
    case "liquidity_change":
      return observation.analytics === null
        ? null
        : observation.analytics.depth.top5.bidUsd + observation.analytics.depth.top5.askUsd;
    case "probability_change":
      return observation.changePoints ?? null;
    default:
      /* Signal lifecycle and resolution rules are driven by the lifecycle
         worker, not by a book observation. */
      return null;
  }
}

function conditionMet(rule: PredictionAlertRule, value: number): boolean {
  const threshold = rule.threshold;
  if (threshold === null) return false;

  switch (rule.kind) {
    case "price_above":
      return value >= threshold;
    case "price_below":
      return value <= threshold;
    case "orderbook_imbalance":
      /* A threshold given as a magnitude means "either side". A signed one
         means that side specifically. */
      return threshold >= 0 ? value >= threshold : value <= threshold;
    case "spread_expansion":
      return value >= threshold;
    case "spread_compression":
      return value <= threshold;
    case "liquidity_change":
      return value <= threshold;
    case "probability_change":
      return Math.abs(value) >= threshold;
    default:
      return false;
  }
}

function describe(rule: PredictionAlertRule, value: number): string {
  const outcome = rule.outcomeLabel ?? "the outcome";

  switch (rule.kind) {
    case "price_above":
      return `${outcome} is at ${(value * 100).toFixed(1)}¢, above your ${((rule.threshold ?? 0) * 100).toFixed(0)}¢ level.`;
    case "price_below":
      return `${outcome} is at ${(value * 100).toFixed(1)}¢, below your ${((rule.threshold ?? 0) * 100).toFixed(0)}¢ level.`;
    case "orderbook_imbalance":
      return `Top-5 book imbalance on ${outcome} is ${value >= 0 ? "+" : ""}${value.toFixed(2)}, past your ${rule.threshold?.toFixed(2)} threshold.`;
    case "spread_expansion":
      return `The spread on ${outcome} widened to ${value.toFixed(1)} points.`;
    case "spread_compression":
      return `The spread on ${outcome} tightened to ${value.toFixed(1)} points.`;
    case "liquidity_change":
      return `Top-5 depth on ${outcome} fell to $${Math.round(value).toLocaleString()}.`;
    case "probability_change":
      return `${outcome} moved ${value >= 0 ? "+" : ""}${value.toFixed(1)} points.`;
    default:
      return `${outcome} met your alert condition.`;
  }
}
