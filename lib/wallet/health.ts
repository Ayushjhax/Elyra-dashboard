/* ---------------------------------------------------------------------------
   The health meter, as arithmetic rather than as a vibe.

   The bars in the status bar are not decoration and they are not a hardcoded
   100%. They report whether the two upstreams this dashboard actually depends
   on are answering: the Solana RPC, which is where every balance comes from,
   and Pyth, which is where every price comes from. A dashboard whose health
   indicator cannot go down is worse than no indicator, because it teaches the
   operator to stop looking at it.

   Pure, and therefore tested. Nothing here fetches.
--------------------------------------------------------------------------- */

export type SubsystemState = "ok" | "degraded" | "down" | "unconfigured" | "unknown";

export interface HealthInput {
  rpc: SubsystemState;
  prices: SubsystemState;
  /** RPC round trip in ms, when the last read reported one. */
  latencyMs: number | null;
}

export type HealthTone = "positive" | "warning" | "negative" | "unknown";

export interface Health {
  /** 0–100, or null while neither subsystem has reported yet. */
  score: number | null;
  tone: HealthTone;
  /** Names the weakest link, for the tooltip. Never empty. */
  reason: string;
}

/**
 * Balances come from the RPC and prices only decorate them, so an RPC outage
 * costs more than a price outage. A wallet dashboard with no prices still
 * shows what you hold; with no RPC it shows nothing at all.
 */
const RPC_WEIGHT = 60;
const PRICE_WEIGHT = 40;

/** Above this the endpoint is answering, but not well. */
export const SLOW_MS = 400;
/** At and beyond this, the RPC's contribution is halved however healthy it claims to be. */
export const VERY_SLOW_MS = 2_000;

/** The spec's bands: green above 60, amber 20–60, red below 20. */
export const GREEN_AT = 60;
export const AMBER_AT = 20;

function share(state: SubsystemState, weight: number): number | null {
  switch (state) {
    case "ok":
      return weight;
    case "degraded":
      return weight / 2;
    case "down":
    case "unconfigured":
      return 0;
    case "unknown":
      /* Not zero. An unknown subsystem has not failed, and scoring it as a
         failure would make every first paint red before anything had gone
         wrong. It withdraws from the calculation instead. */
      return null;
  }
}

/**
 * How much of the RPC's share survives its round-trip time.
 *
 * 1.0 up to SLOW_MS, falling linearly to 0.5 at VERY_SLOW_MS. Halved rather
 * than zeroed at the far end: a slow endpoint is still returning correct
 * balances, and the meter should say "degraded", not "down".
 */
export function latencyFactor(latencyMs: number | null): number {
  if (latencyMs === null || latencyMs <= SLOW_MS) return 1;
  if (latencyMs >= VERY_SLOW_MS) return 0.5;
  const span = VERY_SLOW_MS - SLOW_MS;
  return 1 - 0.5 * ((latencyMs - SLOW_MS) / span);
}

/**
 * How an RPC round trip reads on its own: fine up to SLOW_MS, worth a look up
 * to VERY_SLOW_MS, a problem beyond it. The same two thresholds the meter
 * scores against, so a number and the meter never disagree.
 */
export function latencyTone(latencyMs: number | null): HealthTone {
  if (latencyMs === null) return "unknown";
  if (latencyMs <= SLOW_MS) return "positive";
  if (latencyMs < VERY_SLOW_MS) return "warning";
  return "negative";
}

export function toneFor(score: number | null): HealthTone {
  if (score === null) return "unknown";
  if (score >= GREEN_AT) return "positive";
  if (score >= AMBER_AT) return "warning";
  return "negative";
}

function reasonFor(input: HealthInput, latency: number): string {
  if (input.rpc === "unconfigured") return "Solana RPC is not configured";
  if (input.rpc === "down") return "Solana RPC is not responding";
  if (input.prices === "unconfigured") return "Pyth price feed is not configured";
  if (input.prices === "down") return "Pyth price feed is not responding";
  if (input.rpc === "degraded") return "Solana RPC is returning errors";
  if (input.prices === "degraded") return "Pyth price feed is returning errors";
  if (latency < 1) {
    return `Solana RPC is slow to answer${
      input.latencyMs === null ? "" : ` (${Math.round(input.latencyMs)}ms)`
    }`;
  }
  if (input.rpc === "unknown" && input.prices === "unknown") return "Checking upstreams";
  return "All upstreams responding";
}

export function health(input: HealthInput): Health {
  const latency = latencyFactor(input.latencyMs);

  const rpcRaw = share(input.rpc, RPC_WEIGHT);
  const rpcShare = rpcRaw === null ? null : rpcRaw * latency;
  const priceShare = share(input.prices, PRICE_WEIGHT);

  /* Only the subsystems that have reported are scored, and the total is
     rescaled to what they were worth. Otherwise a healthy RPC alongside a
     price feed that has not answered yet would read as 60% — a warning
     nobody caused. */
  const parts: Array<[number, number]> = [];
  if (rpcShare !== null) parts.push([rpcShare, RPC_WEIGHT]);
  if (priceShare !== null) parts.push([priceShare, PRICE_WEIGHT]);

  if (parts.length === 0) {
    return { score: null, tone: "unknown", reason: reasonFor(input, latency) };
  }

  const earned = parts.reduce((sum, [got]) => sum + got, 0);
  const available = parts.reduce((sum, [, max]) => sum + max, 0);
  const score = Math.round((earned / available) * 100);

  return { score, tone: toneFor(score), reason: reasonFor(input, latency) };
}

/* ---------------------------------------------------------------------------
   Turning what the wallet feed and the price feed report into subsystem
   states.

   Here rather than in the status bar because this is the mapping that decides
   whether the meter moves, and a mapping nobody can test is a meter nobody
   should trust.
--------------------------------------------------------------------------- */

/** The parts of the wallet feed that bear on health. */
export interface RpcReport {
  /** SOLANA_RPC_URL is unset. A configuration gap, not an outage. */
  unconfigured: boolean;
  /** No attempt has settled yet. */
  isLoading: boolean;
  error: string | null;
  /** An earlier reading is still on screen. */
  stale: boolean;
  /** A reading has been obtained at some point. */
  hasSnapshot: boolean;
}

export function rpcStateOf(report: RpcReport): SubsystemState {
  if (report.unconfigured) return "unconfigured";
  if (report.isLoading) return "unknown";
  if (report.error !== null) {
    /* Degraded rather than down while a stale reading is still displayed:
       the endpoint failed, but the panel is showing something true, and
       calling that a total outage overstates it. */
    return report.stale ? "degraded" : "down";
  }
  return report.hasSnapshot ? "ok" : "unknown";
}

export function priceStateOf(status: "loading" | "live" | "error"): SubsystemState {
  if (status === "live") return "ok";
  /* The price feed keeps its last good rows through a failure, so an error
     is a degraded feed rather than an absent one. */
  if (status === "error") return "degraded";
  return "unknown";
}
