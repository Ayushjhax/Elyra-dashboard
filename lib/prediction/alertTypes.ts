/* ---------------------------------------------------------------------------
   A prediction-market alert rule, as /api/prediction/alerts returns it —
   apart from lib/prediction/alerts.ts, which stores and evaluates rules and
   is server-only, so the website and the Android app read one definition.
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

/** "Rises above 65%", "Moves 5 points", "Resolves". */
export function describeRule(rule: Pick<PredictionAlertRule, "kind" | "threshold">): string {
  const level = rule.threshold;
  switch (rule.kind) {
    case "price_above":
      return `Rises above ${level === null ? "—" : `${(level * 100).toFixed(0)}%`}`;
    case "price_below":
      return `Falls below ${level === null ? "—" : `${(level * 100).toFixed(0)}%`}`;
    case "probability_change":
      return `Moves ${level === null ? "—" : level} points`;
    case "market_resolution":
      return "Resolves";
    case "orderbook_imbalance":
      return `Order book imbalance past ${level ?? "—"}`;
    case "spread_expansion":
      return "Spread widens";
    case "spread_compression":
      return "Spread narrows";
    case "liquidity_change":
      return "Liquidity changes";
    default:
      return rule.kind.replace(/_/g, " ");
  }
}
