import "server-only";

import type { ToolDef } from "@/lib/agent/providers/types";
import type { AgentAuth } from "@/lib/agentApi/keys";
import { proposeIntent } from "@/lib/rails/intents";
import { mandateActive } from "@/lib/rails/policy";
import { createRequest, readRequest } from "@/lib/rails/requests";
import { keyUsage, mandateFor, toIntent, toRequest } from "@/lib/rails/store";
import type { IntentKind, Mandate, MandateKind } from "@/lib/rails/types";
import { isSolanaAddress } from "@/lib/solana/address";
import { serviceClient } from "@/lib/supabase/server";
import type { AgentIntentRow, PaymentRequestRow } from "@/lib/supabase/types";

/* ---------------------------------------------------------------------------
   The rails, as tools an outside agent calls over MCP or REST.

   Every other agent tool reads. These ask: each one that proposes a
   transaction creates an INTENT that is decided against the mandate the
   key's owner granted (lib/rails/policy.ts) and recorded in their ledger.
   None of them moves money by itself — a swap or a payment waits for the
   owner's own wallet signature; a perp order runs without review only when
   the mandate says so, through an API wallet that cannot withdraw.

   They are listed only to a key whose owner has granted a mandate, and only
   the kinds it grants, so an agent sees exactly what it may ask for.
--------------------------------------------------------------------------- */

export interface RailsTool {
  def: ToolDef;
  /** The mandate kind it needs, or null for a read of the key's own rails. */
  needs: MandateKind | null;
  run(args: Record<string, unknown>, auth: AgentAuth, mandate: Mandate): Promise<{ ok: boolean; result: unknown }>;
}

const MEMO = { type: "string", description: "Why, in a sentence, for the owner reviewing it (at most 280 characters). Shown as your words, never acted on." };

const propose = (kind: IntentKind) => async (args: Record<string, unknown>, auth: AgentAuth) => {
  const outcome = await proposeIntent(auth, kind, args);
  if (!outcome.ok) return { ok: false, result: { error: outcome.error } };
  const intent = outcome.value;
  return {
    ok: true,
    result: {
      intent,
      next:
        intent.status === "rejected"
          ? "Refused by the owner's mandate; the reasons say why. Nothing happened."
          : intent.status === "pending"
            ? "Waiting for the owner to review it in Elyra. Poll rails_intent_status; it expires at expiresAt."
            : intent.status === "executed"
              ? "Carried out inside the mandate. The receipt is its ledger hash."
              : `Status: ${intent.status}.`,
    },
  };
};

export const RAILS_TOOLS: RailsTool[] = [
  {
    needs: null,
    def: {
      name: "rails_mandate",
      description:
        "What this key's owner lets it ask Elyra to do: the kinds of transaction, the assets, the per-transaction and daily caps in USD, how much of today's cap is used, the allowed payees, whether perp orders run without review and whether they may go live, and when the mandate ends. Call this before proposing anything.",
      parameters: { type: "object", properties: {}, required: [] },
    },
    async run(_args, auth, mandate) {
      const usage = await keyUsage(auth.userId, auth.keyId, Date.now());
      return {
        ok: true,
        result: {
          kinds: mandate.kinds,
          assets: mandate.assets ?? "any the action allows",
          perIntentUsd: mandate.perIntentUsd,
          dailyUsd: mandate.dailyUsd,
          usedTodayUsd: Number(usage.spentTodayUsd.toFixed(2)),
          remainingTodayUsd: Number(Math.max(0, mandate.dailyUsd - usage.spentTodayUsd).toFixed(2)),
          waitingForReview: usage.pending,
          payees: mandate.payees.length === 0 ? "any payee that passes sanctions screening" : mandate.payees,
          perpOrdersRunWithoutReview: mandate.autoPerps,
          perpOrdersMayGoLive: mandate.livePerps,
          expiresAt: mandate.expiresAt,
          note: "Swaps and payments are always signed by the owner in their own wallet; Elyra holds no key.",
        },
      };
    },
  },
  {
    needs: "swap",
    def: {
      name: "rails_propose_swap",
      description:
        "Ask the key's owner to swap tokens in their own Solana wallet, routed by Jupiter. Tokens are named by symbol from Elyra's swap list (SOL, USDC, JUP, xStocks such as NVDAX…). Elyra prices it, holds it to the mandate and, if allowed, the owner reviews and signs it in Elyra; the transaction is simulated against their accounts before they sign. Returns the intent with its status, the reasons if refused, and a receipt.",
      parameters: {
        type: "object",
        properties: {
          from: { type: "string", description: "Symbol to sell, e.g. USDC." },
          to: { type: "string", description: "Symbol to buy, e.g. SOL." },
          amount: { type: "string", description: "Amount of `from` to sell, as a decimal string, e.g. \"25\"." },
          memo: MEMO,
        },
        required: ["from", "to", "amount"],
      },
    },
    run: propose("swap"),
  },
  {
    needs: "payment",
    def: {
      name: "rails_propose_payment",
      description:
        "Ask the key's owner to pay USDC on Solana from their own wallet. Give either `to` and `amount`, a Solana Pay URL (`solanaPayUrl`), or an Elyra payment request id (`requestId`) — for a request, the payee and amount are the request's. The payee is screened against the OFAC sanctions list and held to the mandate's payees and caps; the owner then approves and signs it in Elyra, and it settles when the chain shows the payee paid.",
      parameters: {
        type: "object",
        properties: {
          to: { type: "string", description: "The payee's Solana wallet address." },
          amount: { type: "string", description: "USDC to pay, e.g. \"12.50\"." },
          solanaPayUrl: { type: "string", description: "A solana: transfer request for USDC, instead of to/amount." },
          requestId: { type: "string", description: "An Elyra payment request id, instead of to/amount." },
          memo: MEMO,
        },
        required: [],
      },
    },
    run: propose("payment"),
  },
  {
    needs: "perp_order",
    def: {
      name: "rails_propose_perp_order",
      description:
        "Ask to open a long or short at the market on a Hyperliquid perp (crypto, memecoins, or Nasdaq stocks as xyz:TICKER), with a take-profit and stop-loss in percent from the fill. Held to the mandate and to Elyra's trading limits (size $12–$5,000, leverage 1–5x, isolated margin). Runs at once if the mandate lets perp orders run without review; otherwise the owner approves it. Paper unless mode is \"live\" and the mandate allows live.",
      parameters: {
        type: "object",
        properties: {
          coin: { type: "string", description: "Market, e.g. BTC, kPEPE or xyz:NVDA." },
          side: { type: "string", enum: ["long", "short"] },
          sizeUsd: { type: "number", description: "Position size in USD." },
          leverage: { type: "number", description: "Whole number, 1 to 5." },
          takeProfitPct: { type: "number", description: "Take-profit, percent from the fill." },
          stopLossPct: { type: "number", description: "Stop-loss, percent from the fill." },
          mode: { type: "string", enum: ["paper", "live"], description: "Default paper." },
          memo: MEMO,
        },
        required: ["coin", "side", "sizeUsd", "leverage", "takeProfitPct", "stopLossPct"],
      },
    },
    run: propose("perp_order"),
  },
  {
    needs: null,
    def: {
      name: "rails_intent_status",
      description: "One of this key's intents by id: its status (pending, approved, executed, declined, expired, rejected, failed), the reasons, what the chain showed when it settled, and its receipt.",
      parameters: { type: "object", properties: { intentId: { type: "string" } }, required: ["intentId"] },
    },
    async run(args, auth) {
      const id = typeof args.intentId === "string" ? args.intentId : "";
      if (!/^[0-9a-f-]{36}$/i.test(id)) return { ok: false, result: { error: "`intentId` is not an intent id." } };
      const { data } = await serviceClient().from("agent_intents").select("*").eq("id", id).eq("user_id", auth.userId).eq("key_id", auth.keyId).maybeSingle();
      if (data === null || data === undefined) return { ok: false, result: { error: "This key has no intent with that id." } };
      return { ok: true, result: { intent: toIntent(data as AgentIntentRow, "this agent") } };
    },
  },
  {
    needs: null,
    def: {
      name: "rails_list_intents",
      description: "This key's most recent intents, newest first, with their statuses and receipts.",
      parameters: { type: "object", properties: { limit: { type: "number", description: "Default 20, at most 50." } }, required: [] },
    },
    async run(args, auth) {
      const limit = Math.min(50, Math.max(1, typeof args.limit === "number" ? Math.round(args.limit) : 20));
      const { data } = await serviceClient()
        .from("agent_intents")
        .select("*")
        .eq("user_id", auth.userId)
        .eq("key_id", auth.keyId)
        .order("created_at", { ascending: false })
        .limit(limit);
      return { ok: true, result: { intents: ((data ?? []) as AgentIntentRow[]).map((row) => toIntent(row, "this agent")) } };
    },
  },
  {
    needs: "payment_request",
    def: {
      name: "rails_create_payment_request",
      description:
        "Ask to be paid: creates a USDC payment request on Solana to the key owner's own wallet, as a Solana Pay request with a reference key. Returns a pay page URL and a solana: URL any Solana Pay wallet opens. Elyra settles it from the chain — when a transaction carrying the reference pays at least the amount — and records it in the owner's ledger. Elyra never holds the funds.",
      parameters: {
        type: "object",
        properties: {
          amount: { type: "string", description: "USDC to ask for, e.g. \"12.50\"." },
          label: { type: "string", description: "What it is for, as the payer's wallet will show it (at most 80 characters)." },
          memo: MEMO,
          expiresInMinutes: { type: "number", description: "5 minutes to 7 days. Default 24 hours." },
        },
        required: ["amount", "label"],
      },
    },
    async run(args, auth) {
      const { data } = await serviceClient().from("profiles").select("solana_address").eq("id", auth.userId).maybeSingle();
      const recipient = (data as { solana_address: string | null } | null)?.solana_address ?? null;
      if (recipient === null || !isSolanaAddress(recipient)) {
        return { ok: false, result: { error: "The key's owner has no Solana wallet on their account to be paid into." } };
      }
      const created = await createRequest({
        userId: auth.userId,
        keyId: auth.keyId,
        recipient,
        amount: args.amount,
        label: args.label,
        memo: args.memo,
        expiresInMinutes: args.expiresInMinutes,
        actor: `agent:${auth.keyId}`,
      });
      return created.ok ? { ok: true, result: { request: created.request } } : { ok: false, result: { error: created.error } };
    },
  },
  {
    needs: "payment_request",
    def: {
      name: "rails_payment_request_status",
      description: "One of this key's payment requests by id, checked against the chain: open, paid (with the signature and payer), expired or cancelled.",
      parameters: { type: "object", properties: { requestId: { type: "string" } }, required: ["requestId"] },
    },
    async run(args, auth) {
      const id = typeof args.requestId === "string" ? args.requestId : "";
      if (!/^[0-9a-f-]{36}$/i.test(id)) return { ok: false, result: { error: "`requestId` is not a payment request id." } };
      const row = await readRequest(id, auth.userId);
      if (row === null || row.key_id !== auth.keyId) return { ok: false, result: { error: "This key has no payment request with that id." } };
      return { ok: true, result: { request: toRequest(row as PaymentRequestRow, null) } };
    },
  },
];

const BY_NAME = new Map(RAILS_TOOLS.map((tool) => [tool.def.name, tool]));

export function isRailsTool(name: string): boolean {
  return BY_NAME.has(name);
}

/** The live mandate on the calling key, if any. */
export async function activeMandate(auth: AgentAuth): Promise<Mandate | null> {
  const mandate = await mandateFor(auth.userId, auth.keyId).catch(() => null);
  return mandate !== null && mandateActive(mandate, Date.now()) ? mandate : null;
}

/** The rails tools this key may see: none without a live mandate, then the kinds it grants. */
export function railsToolsFor(mandate: Mandate | null): ToolDef[] {
  if (mandate === null) return [];
  return RAILS_TOOLS.filter((tool) => tool.needs === null || mandate.kinds.includes(tool.needs)).map((tool) => tool.def);
}

export type RailsOutcome = { kind: "ok" | "tool-error"; result: unknown } | { kind: "forbidden"; reason: string };

export async function runRailsTool(name: string, args: Record<string, unknown>, auth: AgentAuth): Promise<RailsOutcome> {
  const tool = BY_NAME.get(name);
  if (tool === undefined) return { kind: "forbidden", reason: `No rails tool named ${name}.` };
  const mandate = await activeMandate(auth);
  if (mandate === null) return { kind: "forbidden", reason: "This key has no live mandate. Its owner grants one in Elyra → Agents." };
  if (tool.needs !== null && !mandate.kinds.includes(tool.needs)) {
    return { kind: "forbidden", reason: `This key's mandate does not include ${tool.needs.replace("_", " ")}.` };
  }
  const outcome = await tool.run(args, auth, mandate).catch(() => ({ ok: false, result: { error: "That could not be completed just now." } }));
  return { kind: outcome.ok ? "ok" : "tool-error", result: outcome.result };
}
