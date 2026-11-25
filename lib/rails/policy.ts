import { isSolanaAddress } from "@/lib/solana/address";
import { MANDATE_KINDS, type IntentKind, type IntentParams, type Mandate, type MandateKind, type Screening } from "@/lib/rails/types";

/* ---------------------------------------------------------------------------
   The mandate, and the decision every agent intent gets against it. Pure.

   An agent never moves money on its own say. It asks; this decides whether
   the ask is inside what the person granted, and how it may proceed:

     rejected        outside the mandate, unpriceable, or to a payee that is
                     sanctioned or could not be screened — recorded, with why;
     needs_approval  inside the mandate: the person reviews it in Elyra and,
                     for a swap or a payment, signs it in their own wallet;
     auto            a perp order inside a mandate that allows perps to run
                     without review — the only kind Elyra can carry out with
                     no wallet signature, through the person's Hyperliquid API
                     wallet, which cannot withdraw.

   Fails closed throughout: a figure that cannot be priced cannot be held to
   a cap, so it is refused rather than waved through, and a payee the screen
   could not reach is refused rather than assumed clear.
--------------------------------------------------------------------------- */

export const LIMITS = {
  /** The most a mandate may allow in one intent. */
  maxPerIntentUsd: 10_000,
  /** The most a mandate may allow in a UTC day. */
  maxDailyUsd: 50_000,
  /** Pending intents one key may have waiting at once, so an agent cannot flood the queue. */
  maxPendingPerKey: 20,
  maxAssets: 40,
  maxPayees: 50,
  /** The longest a mandate may run before it must be renewed. */
  maxDays: 90,
  /** How long an intent waits for the person before it lapses. */
  intentTtlMinutes: 30,
} as const;

export interface MandateInput {
  kinds: MandateKind[];
  assets: string[] | null;
  perIntentUsd: number;
  dailyUsd: number;
  payees: string[];
  autoPerps: boolean;
  livePerps: boolean;
  /** Days from now, or null for no end date before revocation. */
  expiresInDays: number | null;
}

const finite = (value: unknown): value is number => typeof value === "number" && Number.isFinite(value);

function list(value: unknown): string[] {
  if (Array.isArray(value)) return value.filter((entry): entry is string => typeof entry === "string");
  if (typeof value === "string") return value.split(/[\s,]+/);
  return [];
}

/** A mandate as typed in the console, checked, or what is wrong with it in words. */
export function validateMandate(input: Record<string, unknown>): { mandate: MandateInput } | { error: string } {
  const kinds = [...new Set(list(input.kinds))].filter((kind): kind is MandateKind => (MANDATE_KINDS as readonly string[]).includes(kind));
  if (kinds.length === 0) return { error: "Choose at least one thing this agent may ask for." };

  const perIntentUsd = input.perIntentUsd;
  const dailyUsd = input.dailyUsd;
  if (!finite(perIntentUsd) || perIntentUsd <= 0 || perIntentUsd > LIMITS.maxPerIntentUsd) {
    return { error: `The per-transaction cap must be above $0 and at most $${LIMITS.maxPerIntentUsd.toLocaleString("en-US")}.` };
  }
  if (!finite(dailyUsd) || dailyUsd < perIntentUsd || dailyUsd > LIMITS.maxDailyUsd) {
    return { error: `The daily cap must be at least the per-transaction cap and at most $${LIMITS.maxDailyUsd.toLocaleString("en-US")}.` };
  }

  const rawAssets = input.assets === null || input.assets === undefined ? [] : list(input.assets);
  const assets = [...new Set(rawAssets.map((entry) => entry.trim().toUpperCase()).filter((entry) => entry.length > 0))];
  if (assets.some((asset) => !/^[A-Z0-9$][A-Z0-9$.:_-]{0,31}$/.test(asset))) return { error: "An asset must be a ticker such as SOL or xyz:NVDA." };
  if (assets.length > LIMITS.maxAssets) return { error: `List at most ${LIMITS.maxAssets} assets.` };

  const payees = [...new Set(list(input.payees).map((entry) => entry.trim()).filter((entry) => entry.length > 0))];
  if (payees.some((payee) => !isSolanaAddress(payee))) return { error: "Every payee must be a Solana wallet address." };
  if (payees.length > LIMITS.maxPayees) return { error: `List at most ${LIMITS.maxPayees} payees.` };

  const perps = kinds.includes("perp_order");
  const autoPerps = perps && input.autoPerps === true;
  const livePerps = perps && input.livePerps === true;

  let expiresInDays: number | null = null;
  if (input.expiresInDays !== null && input.expiresInDays !== undefined && input.expiresInDays !== "") {
    const days = Number(input.expiresInDays);
    if (!Number.isInteger(days) || days < 1 || days > LIMITS.maxDays) return { error: `A mandate runs from 1 to ${LIMITS.maxDays} days.` };
    expiresInDays = days;
  }

  return {
    mandate: {
      kinds,
      assets: assets.length === 0 ? null : assets,
      perIntentUsd,
      dailyUsd,
      payees,
      autoPerps,
      livePerps,
      expiresInDays,
    },
  };
}

export type Decision = "rejected" | "needs_approval" | "auto";

export interface IntentFacts {
  kind: IntentKind;
  /** Every asset the intent touches, upper-case: both sides of a swap, a perp's coin, USDC for a payment. */
  assets: string[];
  /** Null when it could not be priced. */
  usd: number | null;
  /** The payee, for a payment. */
  payee?: string;
  screening?: Screening | null;
}

/** Whether a mandate is in force at `now`. */
export function mandateActive(mandate: Pick<Mandate, "expiresAt">, now: number): boolean {
  return mandate.expiresAt === null || Date.parse(mandate.expiresAt) > now;
}

export function decideIntent(input: {
  mandate: Mandate | null;
  intent: IntentFacts;
  /** Dollars this key's intents already hold against today's cap. */
  spentTodayUsd: number;
  pendingCount: number;
  now: number;
}): { decision: Decision; reasons: string[] } {
  const { mandate, intent } = input;
  const refuse = (reason: string) => ({ decision: "rejected" as const, reasons: [reason] });

  if (mandate === null) return refuse("This agent has no mandate: its owner has not granted it any transactions.");
  if (!mandateActive(mandate, input.now)) return refuse("This agent's mandate has expired. Its owner can renew it in Elyra → Agents.");
  if (!mandate.kinds.includes(intent.kind)) return refuse(`This agent's mandate does not include ${intent.kind.replace("_", " ")}s.`);
  if (input.pendingCount >= LIMITS.maxPendingPerKey) {
    return refuse(`This agent already has ${LIMITS.maxPendingPerKey} requests waiting for review.`);
  }

  if (mandate.assets !== null) {
    const outside = intent.assets.filter((asset) => !mandate.assets?.includes(asset.toUpperCase()));
    if (outside.length > 0) return refuse(`${outside.join(" and ")} ${outside.length === 1 ? "is" : "are"} outside this agent's mandate.`);
  }

  if (intent.usd === null || !Number.isFinite(intent.usd)) {
    return refuse("It could not be priced, so it cannot be held to the mandate's caps.");
  }
  if (intent.usd > mandate.perIntentUsd) {
    return refuse(`$${intent.usd.toFixed(2)} is above this agent's $${mandate.perIntentUsd.toLocaleString("en-US")} per-transaction cap.`);
  }
  if (input.spentTodayUsd + intent.usd > mandate.dailyUsd) {
    return refuse(
      `It would take today's total to $${(input.spentTodayUsd + intent.usd).toFixed(2)}, above this agent's $${mandate.dailyUsd.toLocaleString("en-US")} daily cap.`,
    );
  }

  if (intent.kind === "payment") {
    if (intent.payee === undefined || !isSolanaAddress(intent.payee)) return refuse("A payment needs a Solana wallet to pay.");
    if (mandate.payees.length > 0 && !mandate.payees.includes(intent.payee)) return refuse("That payee is not on this agent's list of allowed payees.");
    const screen = intent.screening ?? null;
    if (screen === null || screen.status === "unavailable") return refuse("The payee could not be screened against the sanctions list, so it was not offered.");
    if (screen.status === "listed") return refuse("The payee is on the OFAC sanctions list. Elyra does not route payments to it.");
  }

  if (intent.kind === "perp_order" && mandate.autoPerps) return { decision: "auto", reasons: [] };
  return { decision: "needs_approval", reasons: [] };
}

/** One line for an intent, the same everywhere it is shown. */
export function intentSummary(params: IntentParams): string {
  switch (params.kind) {
    case "swap":
      return `Swap ${params.amount} ${params.from} for ${params.to}`;
    case "payment":
      return `Pay ${params.amount} USDC to ${params.to.slice(0, 4)}…${params.to.slice(-4)}${params.requestId === null ? "" : " (a payment request)"}`;
    case "perp_order":
      return `${params.side === "long" ? "Long" : "Short"} ${params.coin} · $${params.sizeUsd} at ${params.leverage}x · TP ${params.takeProfitPct}% · SL ${params.stopLossPct}% (${params.mode})`;
  }
}
