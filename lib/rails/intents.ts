import "server-only";

import type { AgentAuth } from "@/lib/agentApi/keys";
import { validateMarketOrder } from "@/lib/autotrade/orders";
import { openMarketTrade } from "@/lib/autotrade/trade";
import { routePrices } from "@/lib/providers/router";
import { notifyOwner } from "@/lib/rails/notify";
import { decideIntent, intentSummary, LIMITS } from "@/lib/rails/policy";
import { settleFromIntent } from "@/lib/rails/requests";
import { screenAddress } from "@/lib/rails/screening";
import { fromBase, MAX_REQUEST_USDC, parseSolanaPayUrl, paysAtLeast, USDC_DECIMALS, USDC_MINT } from "@/lib/rails/solanaPay";
import { appendLedger, keyUsage, mandateFor, toIntent, type Actor } from "@/lib/rails/store";
import type { IntentKind, IntentParams, IntentView, Mandate, Screening } from "@/lib/rails/types";
import { isSolanaAddress } from "@/lib/solana/address";
import { toBaseUnits } from "@/lib/solana/amount";
import { readHolding } from "@/lib/solana/holdings";
import { getTransactionTokenChanges, type TransactionTokenChanges } from "@/lib/solana/rpc";
import { buildTokenTransfer, type BuiltTransfer } from "@/lib/solana/transfer";
import { oneAtATime } from "@/lib/queue";
import { serviceClient } from "@/lib/supabase/server";
import type { AgentIntentRow, PaymentRequestRow } from "@/lib/supabase/types";
import { assetFor } from "@/lib/trade";

/* ---------------------------------------------------------------------------
   Agent intents: what an agent asks Elyra to carry out, and everything that
   happens to it.

     propose   an agent (by its key) asks. The ask is normalised — symbols
               resolved through the swap allowlist, amounts to base units, a
               payment request's payee and amount read from the request, not
               the agent — then priced, the payee screened, and decided
               against the key's mandate (lib/rails/policy.ts). Rejected,
               pending review, or (a perp order the mandate lets run) carried
               out now. Every proposal is recorded, refused ones included,
               and the agent gets the ledger hash as its receipt.
     approve   the person, in Elyra. A perp order runs then, through the same
               path as one placed by hand (lib/autotrade/trade.ts). A swap or
               a payment needs their wallet's signature, so approving opens
               the signing step and gives it fifteen minutes.
     confirm   the person's wallet signed it. The signature is proven against
               the chain — landed, signed by this account's wallet, and for a
               payment, the payee's USDC actually rising by the amount —
               before the intent is recorded as executed, with the balance
               changes the chain shows.
     decline   the person said no. Recorded.
     expire    nobody answered in time. Recorded by the five-minute pass.

   Elyra holds no key at any point. An agent cannot choose whose wallet pays,
   cannot raise its own limits, and cannot see another account's intents.
--------------------------------------------------------------------------- */

/** How long the person has to sign once they approve. */
const SIGNING_WINDOW_MS = 15 * 60_000;

type Result<T> = { ok: true; value: T } | { ok: false; error: string; status: number };
const fail = (error: string, status = 400) => ({ ok: false as const, error, status });

/** The text an agent gave for why, cut to size; shown as text, never acted on. */
function memoOf(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const text = value.replace(/[\u0000-\u001f\u007f]/g, " ").replace(/\s+/g, " ").trim().slice(0, 280);
  return text.length === 0 ? null : text;
}

/* ---------------------------------------------------------------------------
   Normalising an ask
--------------------------------------------------------------------------- */

interface Normalised {
  params: IntentParams;
  assets: string[];
  usd: number | null;
  payee?: string;
}

async function priceOf(mint: string): Promise<number | null> {
  const quoted = await routePrices([mint]).catch(() => null);
  const price = quoted?.data?.find((row) => row.id === mint)?.usdPrice;
  return typeof price === "number" && Number.isFinite(price) && price > 0 ? price : null;
}

async function normaliseSwap(args: Record<string, unknown>): Promise<Result<Normalised>> {
  const from = typeof args.from === "string" ? args.from.trim().toUpperCase() : "";
  const to = typeof args.to === "string" ? args.to.trim().toUpperCase() : "";
  const fromAsset = assetFor(from);
  const toAsset = assetFor(to);
  if (fromAsset === null || toAsset === null) {
    return fail(`${fromAsset === null ? from || "from" : to || "to"} is not on Elyra's swap list. Call get_market_snapshot or name a listed token such as SOL, USDC or JUP.`);
  }
  if (from === to) return fail("Those are the same token.");
  const amount = typeof args.amount === "number" ? String(args.amount) : typeof args.amount === "string" ? args.amount.trim() : "";
  if (toBaseUnits(amount, fromAsset.decimals) === null) return fail("`amount` must be an amount of the token sold, above zero, such as \"25\".");
  const price = await priceOf(fromAsset.mint);
  return { ok: true, value: { params: { kind: "swap", from, to, amount }, assets: [from, to], usd: price === null ? null : Number(amount) * price } };
}

async function normalisePayment(args: Record<string, unknown>, ownWallet: string | null): Promise<Result<Normalised>> {
  let to = typeof args.to === "string" ? args.to.trim() : "";
  let amountText = typeof args.amount === "number" ? String(args.amount) : typeof args.amount === "string" ? args.amount.trim() : "";
  let requestId: string | null = null;
  let reference: string | null = null;

  /* A payment request's payee and amount come from the request — never from
     the agent — so an agent cannot quietly pay a request to someone else. */
  const request = async (row: PaymentRequestRow | null): Promise<Result<null>> => {
    if (row === null) return fail("No open payment request has that id.", 404);
    if (row.status !== "open" || Date.parse(row.expires_at) <= Date.now()) return fail(`That payment request is ${row.status === "open" ? "expired" : row.status}.`);
    if (row.mint !== USDC_MINT) return fail("Only USDC requests can be paid this way.");
    to = row.recipient;
    amountText = fromBase(row.amount_base, row.decimals);
    requestId = row.id;
    reference = row.reference;
    return { ok: true, value: null };
  };

  if (typeof args.requestId === "string" && args.requestId.length > 0) {
    if (!/^[0-9a-f-]{36}$/i.test(args.requestId)) return fail("`requestId` is not a payment request id.");
    const { data } = await serviceClient().from("payment_requests").select("*").eq("id", args.requestId).maybeSingle();
    const checked = await request((data ?? null) as PaymentRequestRow | null);
    if (!checked.ok) return checked;
  } else if (typeof args.solanaPayUrl === "string" && args.solanaPayUrl.length > 0) {
    const parsed = parseSolanaPayUrl(args.solanaPayUrl);
    if (parsed === null) return fail("`solanaPayUrl` is not a Solana Pay transfer request.");
    if (parsed.mint !== USDC_MINT) return fail("Only USDC Solana Pay requests can be paid this way.");
    if (parsed.reference !== null) {
      const { data } = await serviceClient().from("payment_requests").select("*").eq("reference", parsed.reference).maybeSingle();
      if (data !== null && data !== undefined) {
        const checked = await request(data as PaymentRequestRow);
        if (!checked.ok) return checked;
      }
    }
    if (requestId === null) {
      to = parsed.recipient;
      amountText = parsed.amount ?? "";
      reference = parsed.reference;
    }
  }

  if (!isSolanaAddress(to)) return fail("`to` must be the payee's Solana wallet address.");
  if (ownWallet !== null && to === ownWallet) return fail("That is this account's own wallet; there is nothing to pay.");
  const amountBase = toBaseUnits(amountText, USDC_DECIMALS);
  if (amountBase === null) return fail("`amount` must be an amount of USDC above zero, such as \"12.50\".");
  if (BigInt(amountBase) > BigInt(MAX_REQUEST_USDC) * BigInt(10 ** USDC_DECIMALS)) return fail(`A payment is at most ${MAX_REQUEST_USDC.toLocaleString("en-US")} USDC.`);
  const amount = fromBase(amountBase, USDC_DECIMALS);
  return {
    ok: true,
    value: {
      params: { kind: "payment", to, amount, amountBase, mint: USDC_MINT, requestId, reference },
      assets: ["USDC"],
      /* USDC is priced at its face value: the cap is on what leaves, in dollars. */
      usd: Number(amount),
      payee: to,
    },
  };
}

function normalisePerp(args: Record<string, unknown>, mandate: Mandate): Result<Normalised> {
  const live = args.mode === "live";
  if (live && !mandate.livePerps) return fail("This agent's mandate allows paper perp orders only. Ask for mode \"paper\".", 403);
  const checked = validateMarketOrder({ ...args, mode: live ? "live" : "paper" });
  if ("error" in checked) return fail(checked.error);
  const order = checked.order;
  return {
    ok: true,
    value: {
      params: {
        kind: "perp_order",
        coin: order.coin,
        side: order.side,
        sizeUsd: order.sizeUsd,
        leverage: order.leverage,
        takeProfitPct: order.takeProfitPct,
        stopLossPct: order.stopLossPct,
        mode: order.mode,
      },
      assets: [order.coin.toUpperCase()],
      usd: order.sizeUsd,
    },
  };
}

/* ---------------------------------------------------------------------------
   Propose
--------------------------------------------------------------------------- */

async function ownSolanaWallet(userId: string): Promise<string | null> {
  const { data } = await serviceClient().from("profiles").select("solana_address").eq("id", userId).maybeSingle();
  const address = (data as { solana_address: string | null } | null)?.solana_address ?? null;
  return address !== null && isSolanaAddress(address) ? address : null;
}

async function agentName(userId: string, keyId: string): Promise<string> {
  const { data } = await serviceClient().from("agent_keys").select("name").eq("id", keyId).eq("user_id", userId).maybeSingle();
  return (data as { name: string } | null)?.name ?? "An agent";
}

/* One key's proposals run one at a time on an instance (lib/queue.ts), so
   two arriving together cannot both read the same day's total and both
   pass the cap. */
export function proposeIntent(auth: AgentAuth, kind: IntentKind, args: Record<string, unknown>, now: number = Date.now()): Promise<Result<IntentView>> {
  return oneAtATime(auth.keyId, () => propose(auth, kind, args, now));
}

async function propose(auth: AgentAuth, kind: IntentKind, args: Record<string, unknown>, now: number): Promise<Result<IntentView>> {
  const mandate = await mandateFor(auth.userId, auth.keyId);
  if (mandate === null) return fail("This key has no mandate. Its owner grants one in Elyra → Agents.", 403);

  const normalised =
    kind === "swap"
      ? await normaliseSwap(args)
      : kind === "payment"
        ? await normalisePayment(args, await ownSolanaWallet(auth.userId))
        : normalisePerp(args, mandate);
  if (!normalised.ok) return normalised;
  const { params, assets, usd, payee } = normalised.value;

  const screening: Screening | null = payee === undefined ? null : await screenAddress(payee, now);
  const usage = await keyUsage(auth.userId, auth.keyId, now);
  const { decision, reasons } = decideIntent({
    mandate,
    intent: { kind, assets, usd, payee, screening },
    spentTodayUsd: usage.spentTodayUsd,
    pendingCount: usage.pending,
    now,
  });

  const memo = memoOf(args.memo);
  const db = serviceClient();
  const { data, error } = await db
    .from("agent_intents")
    .insert({
      user_id: auth.userId,
      key_id: auth.keyId,
      kind,
      params: params as unknown as Record<string, unknown>,
      usd_value: usd === null ? null : Number(usd.toFixed(2)),
      status: decision === "rejected" ? "rejected" : decision === "auto" ? "approved" : "pending",
      reasons,
      memo,
      screening: screening as unknown as Record<string, unknown> | null,
      expires_at: new Date(now + LIMITS.intentTtlMinutes * 60_000).toISOString(),
      decided_at: decision === "needs_approval" ? null : new Date(now).toISOString(),
    })
    .select("*")
    .single();
  if (error !== null || data === null) return fail("The request could not be recorded, so nothing happened.", 503);
  let row = data as AgentIntentRow;

  const receipt = await appendLedger(auth.userId, {
    actor: `agent:${auth.keyId}`,
    event: "intent.proposed",
    subjectId: row.id,
    body: {
      kind,
      params,
      usd: usd === null ? null : usd.toFixed(2),
      decision,
      reasons,
      ...(screening === null ? {} : { screening: { status: screening.status, checkedAt: screening.checkedAt } }),
      ...(memo === null ? {} : { memo }),
    },
  });
  if (receipt !== null) {
    await db.from("agent_intents").update({ receipt }).eq("id", row.id).eq("user_id", auth.userId);
    row = { ...row, receipt };
  }

  const name = await agentName(auth.userId, auth.keyId);
  if (decision === "auto") {
    row = await runPerp(row, name, "elyra");
  } else if (decision === "needs_approval") {
    await notifyOwner(auth.userId, `${name} is asking you to approve`, [
      intentSummary(params),
      usd === null ? "" : `About $${usd.toFixed(2)}.`,
      "Nothing happens until you approve it in Elyra → Agents.",
    ]);
  }
  return { ok: true, value: toIntent(row, name) };
}

/* ---------------------------------------------------------------------------
   Perp orders: carried out through the same path as one placed by hand
--------------------------------------------------------------------------- */

async function runPerp(row: AgentIntentRow, name: string, actor: Actor): Promise<AgentIntentRow> {
  const params = row.params as unknown as Extract<IntentParams, { kind: "perp_order" }>;
  const checked = validateMarketOrder({ ...params });
  const db = serviceClient();
  const outcome = "error" in checked
    ? { ok: false as const, error: checked.error, status: 400 }
    : await openMarketTrade(row.user_id, checked.order, {
        ruleName: `Agent: ${name}`.slice(0, 60),
        reason: `${params.side === "long" ? "Bought" : "Sold short"} at the market for an agent (${name}), inside its mandate.`,
      });
  const settledAt = new Date().toISOString();
  const update = outcome.ok
    ? {
        status: "executed" as const,
        settled_at: settledAt,
        result: { positionId: outcome.position.id, mode: outcome.position.mode, entryPrice: String(outcome.position.entryPrice), size: String(outcome.position.size) },
      }
    : { status: "failed" as const, settled_at: settledAt, reasons: [...(row.reasons ?? []), outcome.error] };
  await db.from("agent_intents").update(update).eq("id", row.id).eq("user_id", row.user_id);
  await appendLedger(row.user_id, {
    actor,
    event: outcome.ok ? "intent.executed" : "intent.failed",
    subjectId: row.id,
    body: outcome.ok ? { ...update.result } : { error: outcome.error },
  });
  await notifyOwner(
    row.user_id,
    outcome.ok ? `${name} opened a ${params.mode} ${params.side} on ${params.coin}` : `${name}'s ${params.coin} order did not go through`,
    outcome.ok
      ? [intentSummary(params), "It is under Automation → Trades, with its take-profit and stop-loss attached."]
      : [intentSummary(params), outcome.error],
  );
  return { ...row, ...update } as AgentIntentRow;
}

/* ---------------------------------------------------------------------------
   The person's answers
--------------------------------------------------------------------------- */

async function ownIntent(userId: string, id: string): Promise<AgentIntentRow | null> {
  if (!/^[0-9a-f-]{36}$/i.test(id)) return null;
  const { data } = await serviceClient().from("agent_intents").select("*").eq("id", id).eq("user_id", userId).maybeSingle();
  return (data ?? null) as AgentIntentRow | null;
}

async function keyLive(userId: string, keyId: string): Promise<boolean> {
  const { data } = await serviceClient().from("agent_keys").select("id").eq("id", keyId).eq("user_id", userId).is("revoked_at", null).maybeSingle();
  return data !== null && data !== undefined;
}

export async function approveIntent(userId: string, id: string, now: number = Date.now()): Promise<Result<IntentView>> {
  const row = await ownIntent(userId, id);
  if (row === null) return fail("No such request.", 404);
  if (row.status !== "pending") return fail(`That request is already ${row.status}.`, 409);
  if (Date.parse(row.expires_at) <= now) return fail("That request has expired. Ask the agent to send it again.", 409);
  if (!(await keyLive(userId, row.key_id))) return fail("That agent's key has been revoked, so its requests can no longer be approved.", 409);

  const db = serviceClient();
  const { data } = await db
    .from("agent_intents")
    .update({
      status: "approved",
      decided_at: new Date(now).toISOString(),
      ...(row.kind === "perp_order" ? {} : { expires_at: new Date(now + SIGNING_WINDOW_MS).toISOString() }),
    })
    .eq("id", id)
    .eq("user_id", userId)
    .eq("status", "pending")
    .select("*");
  const approved = (data ?? [])[0] as AgentIntentRow | undefined;
  if (approved === undefined) return fail("That request changed while you were answering. Refresh.", 409);
  await appendLedger(userId, { actor: "person", event: "intent.approved", subjectId: id, body: { kind: row.kind } });

  const names = await agentName(userId, row.key_id);
  const final = row.kind === "perp_order" ? await runPerp(approved, names, "person") : approved;
  return { ok: true, value: toIntent(final, names) };
}

export async function declineIntent(userId: string, id: string): Promise<Result<IntentView>> {
  const row = await ownIntent(userId, id);
  if (row === null) return fail("No such request.", 404);
  if (row.status !== "pending" && row.status !== "approved") return fail(`That request is already ${row.status}.`, 409);
  const { data } = await serviceClient()
    .from("agent_intents")
    .update({ status: "declined", decided_at: new Date().toISOString() })
    .eq("id", id)
    .eq("user_id", userId)
    .in("status", ["pending", "approved"])
    .select("*");
  const declined = (data ?? [])[0] as AgentIntentRow | undefined;
  if (declined === undefined) return fail("That request changed while you were answering. Refresh.", 409);
  await appendLedger(userId, { actor: "person", event: "intent.declined", subjectId: id, body: { kind: row.kind } });
  return { ok: true, value: toIntent(declined, await agentName(userId, row.key_id)) };
}

/**
 * The unsigned transfer for an approved payment, built from the intent as
 * recorded — payee, amount and reference are the intent's, never the
 * browser's — from the session's own wallet.
 */
export async function buildPayment(userId: string, id: string, wallet: string): Promise<Result<BuiltTransfer & { to: string; amount: string }>> {
  const row = await ownIntent(userId, id);
  if (row === null || row.kind !== "payment") return fail("No such payment request.", 404);
  if (row.status !== "approved") return fail("Approve the request before signing it.", 409);
  if (Date.parse(row.expires_at) <= Date.now()) return fail("The time to sign this has passed. Ask the agent to send it again.", 409);
  const params = row.params as unknown as Extract<IntentParams, { kind: "payment" }>;

  const holding = await readHolding(wallet, USDC_MINT).catch(() => null);
  if (holding === null || BigInt(holding.amount) < BigInt(params.amountBase)) {
    return fail(`This wallet holds ${holding === null ? "no" : fromBase(holding.amount, USDC_DECIMALS)} USDC, less than the ${params.amount} to pay.`);
  }
  try {
    const built = await buildTokenTransfer({
      from: wallet,
      to: params.to,
      mint: USDC_MINT,
      amount: params.amountBase,
      decimals: USDC_DECIMALS,
      ...(params.reference === null ? {} : { reference: params.reference }),
    });
    return { ok: true, value: { ...built, to: params.to, amount: params.amount } };
  } catch {
    return fail("The payment could not be built just now. Try again.", 503);
  }
}

/** A landed transaction, waited for briefly: a node can lag the wallet by a slot or two. */
async function landed(signature: string): Promise<TransactionTokenChanges | null | "unreachable"> {
  for (let attempt = 0; attempt < 4; attempt += 1) {
    if (attempt > 0) await new Promise((resolve) => setTimeout(resolve, 1_500));
    try {
      const tx = await getTransactionTokenChanges(signature);
      if (tx !== null) return tx;
    } catch {
      return "unreachable";
    }
  }
  return null;
}

const SIGNATURE = /^[1-9A-HJ-NP-Za-km-z]{64,90}$/;

/**
 * Records an approved swap or payment as executed, once the chain proves it:
 * the transaction landed, this account's wallet signed it, and — for a
 * payment — the payee's USDC rose by the amount.
 */
export async function confirmIntent(userId: string, id: string, signature: string, wallet: string): Promise<Result<IntentView>> {
  if (!SIGNATURE.test(signature)) return fail("A confirmation needs the transaction signature from your wallet.");
  const row = await ownIntent(userId, id);
  if (row === null || row.kind === "perp_order") return fail("No such request.", 404);
  if (row.status !== "approved") return fail(`That request is ${row.status}, not waiting for a signature.`, 409);

  const tx = await landed(signature);
  if (tx === "unreachable") return fail("The Solana network could not be reached to check it. Try again shortly.", 503);
  if (tx === null) return fail("The network has not shown this transaction yet. Try again shortly.", 503);
  if (tx.err !== null) return fail("That transaction failed on-chain, so nothing moved.", 422);
  if (!tx.signers.includes(wallet)) return fail("That transaction was not signed by this account's wallet.", 422);

  const params = row.params as unknown as IntentParams;
  if (params.kind === "payment" && !paysAtLeast(tx.changes, { recipient: params.to, mint: USDC_MINT, amountBase: params.amountBase })) {
    return fail("That transaction does not pay the requested amount of USDC to the payee.", 422);
  }

  /* What the chain shows moved for this wallet (and, for a payment, the payee). */
  const observed = tx.changes
    .filter((change) => change.owner === wallet || (params.kind === "payment" && change.owner === params.to))
    .map((change) => ({ owner: change.owner, mint: change.mint, delta: change.delta }));
  const { data, error } = await serviceClient()
    .from("agent_intents")
    .update({ status: "executed", signature, settled_at: new Date().toISOString(), result: { signature, changes: observed } })
    .eq("id", id)
    .eq("user_id", userId)
    .eq("status", "approved")
    .select("*");
  if (error !== null) {
    return fail(error.code === "23505" ? "That signature already settled another request." : "It could not be recorded. Try again.", error.code === "23505" ? 409 : 503);
  }
  const executed = (data ?? [])[0] as AgentIntentRow | undefined;
  if (executed === undefined) return fail("That request changed while you were answering. Refresh.", 409);
  await appendLedger(userId, { actor: "person", event: "intent.executed", subjectId: id, body: { signature, changes: observed } });
  if (params.kind === "payment" && params.requestId !== null) await settleFromIntent(params.requestId, signature, wallet);
  return { ok: true, value: toIntent(executed, await agentName(userId, row.key_id)) };
}

/** Lapses intents nobody answered in time. Run by the five-minute pass. */
export async function expireIntents(now: number = Date.now(), cap = 50): Promise<number> {
  const db = serviceClient();
  const { data } = await db
    .from("agent_intents")
    .select("id, user_id, kind, status")
    .in("status", ["pending", "approved"])
    .lt("expires_at", new Date(now).toISOString())
    .limit(cap);
  let expired = 0;
  for (const row of (data ?? []) as Array<Pick<AgentIntentRow, "id" | "user_id" | "kind" | "status">>) {
    const updated = await db.from("agent_intents").update({ status: "expired" }).eq("id", row.id).eq("status", row.status).select("id");
    if ((updated.data ?? []).length === 0) continue;
    await appendLedger(row.user_id, { actor: "elyra", event: "intent.expired", subjectId: row.id, body: { kind: row.kind, was: row.status } });
    expired += 1;
  }
  return expired;
}
