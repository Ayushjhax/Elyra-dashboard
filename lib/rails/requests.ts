import "server-only";

import { randomBytes } from "node:crypto";
import { getAddressDecoder } from "@solana/kit";
import { notifyOwner } from "@/lib/rails/notify";
import { MAX_REQUEST_USDC, paysAtLeast, USDC_DECIMALS, USDC_MINT } from "@/lib/rails/solanaPay";
import { appendLedger, toRequest, type Actor } from "@/lib/rails/store";
import type { PaymentRequestView } from "@/lib/rails/types";
import { toBaseUnits } from "@/lib/solana/amount";
import { getSignaturesForAddress, getTransactionTokenChanges } from "@/lib/solana/rpc";
import { serviceClient } from "@/lib/supabase/server";
import type { PaymentRequestRow } from "@/lib/supabase/types";

/* ---------------------------------------------------------------------------
   Payment requests: how a person — or an agent acting for them — gets paid
   in USDC on Solana.

   A request is a Solana Pay transfer request (lib/rails/solanaPay.ts) to the
   person's own wallet, with a fresh reference key. Anyone pays it from any
   Solana Pay wallet, or from Elyra (an agent's payment intent, approved and
   signed by its owner). Settlement is read from the chain, never told: the
   transactions carrying the reference are fetched, and the request is paid
   only by one that succeeded and raised the recipient's USDC by at least the
   amount. It is checked when anyone asks for its status and on the
   five-minute tick, and recorded once — the paid signature is unique.

   Elyra never holds the money: it goes from the payer's wallet straight to
   the recipient's.
--------------------------------------------------------------------------- */

const MIN_MINUTES = 5;
const MAX_MINUTES = 7 * 24 * 60;
const DEFAULT_MINUTES = 24 * 60;

/** A fresh reference: 32 random bytes, written as a Solana address. Nobody holds its key. */
export function newReference(): string {
  return getAddressDecoder().decode(randomBytes(32));
}

/** Printable, single-line, short: a label a payer's wallet shows. */
function cleanText(value: unknown, max: number): string {
  if (typeof value !== "string") return "";
  return value
    .replace(/[\u0000-\u001f\u007f]/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, max);
}

export async function createRequest(input: {
  userId: string;
  keyId: string | null;
  recipient: string;
  amount: unknown;
  label: unknown;
  memo?: unknown;
  expiresInMinutes?: unknown;
  actor: Actor;
}): Promise<{ ok: true; request: PaymentRequestView } | { ok: false; error: string; status: number }> {
  const amountText = typeof input.amount === "number" ? String(input.amount) : typeof input.amount === "string" ? input.amount : "";
  const amountBase = toBaseUnits(amountText, USDC_DECIMALS);
  if (amountBase === null) return { ok: false, error: "Ask for an amount of USDC above zero, such as 12.50.", status: 400 };
  if (BigInt(amountBase) > BigInt(MAX_REQUEST_USDC) * BigInt(10 ** USDC_DECIMALS)) {
    return { ok: false, error: `A request may ask for at most ${MAX_REQUEST_USDC.toLocaleString("en-US")} USDC.`, status: 400 };
  }
  const label = cleanText(input.label, 80);
  if (label.length === 0) return { ok: false, error: "Give the request a label the payer will see, such as what it is for.", status: 400 };
  const memo = cleanText(input.memo, 280);

  let minutes = DEFAULT_MINUTES;
  if (input.expiresInMinutes !== undefined && input.expiresInMinutes !== null) {
    const asked = Number(input.expiresInMinutes);
    if (!Number.isInteger(asked) || asked < MIN_MINUTES || asked > MAX_MINUTES) {
      return { ok: false, error: `A request stays open from ${MIN_MINUTES} minutes to 7 days.`, status: 400 };
    }
    minutes = asked;
  }

  const db = serviceClient();
  const { data, error } = await db
    .from("payment_requests")
    .insert({
      user_id: input.userId,
      key_id: input.keyId,
      recipient: input.recipient,
      mint: USDC_MINT,
      amount_base: amountBase,
      decimals: USDC_DECIMALS,
      label,
      memo: memo.length === 0 ? null : memo,
      reference: newReference(),
      status: "open",
      expires_at: new Date(Date.now() + minutes * 60_000).toISOString(),
    })
    .select("*")
    .single();
  if (error !== null || data === null) return { ok: false, error: "The request could not be saved.", status: 503 };
  const row = data as PaymentRequestRow;

  await appendLedger(input.userId, {
    actor: input.actor,
    event: "request.created",
    subjectId: row.id,
    body: { amount: toRequest(row, null).amount, mint: row.mint, recipient: row.recipient, label: row.label, reference: row.reference, expiresAt: row.expires_at },
  });
  return { ok: true, request: toRequest(row, null) };
}

/** Records a request as paid by `signature`, once. Returns whether this call recorded it. */
async function markPaid(row: PaymentRequestRow, signature: string, payer: string | null): Promise<boolean> {
  const paidAt = new Date().toISOString();
  const { data } = await serviceClient()
    .from("payment_requests")
    .update({ status: "paid", paid_signature: signature, paid_by: payer, paid_at: paidAt })
    .eq("id", row.id)
    .eq("status", "open")
    .select("id");
  if ((data ?? []).length === 0) return false;
  const amount = toRequest(row, null).amount;
  await appendLedger(row.user_id, {
    actor: "elyra",
    event: "request.settled",
    subjectId: row.id,
    body: { signature, payer, amount, mint: row.mint, reference: row.reference },
  });
  await notifyOwner(row.user_id, `Payment received · ${amount} USDC`, [`"${row.label}" was paid on Solana.`, "Settled on-chain and recorded in your agent ledger."]);
  return true;
}

/**
 * Settles an open request from the chain if it has been paid, or lapses it
 * if it is past its time. Returns the row as it now stands.
 */
export async function checkRequest(row: PaymentRequestRow, now: number = Date.now()): Promise<PaymentRequestRow> {
  if (row.status !== "open") return row;

  let signatures: Array<{ signature: string; err: unknown }> = [];
  try {
    signatures = (await getSignaturesForAddress(row.reference, 20)) as Array<{ signature: string; err: unknown }>;
  } catch {
    return row;
  }
  /* Oldest first: the first transaction that pays it is the one that did. */
  for (const entry of [...signatures].reverse()) {
    if (entry.err !== null && entry.err !== undefined) continue;
    const tx = await getTransactionTokenChanges(entry.signature).catch(() => null);
    if (tx === null || tx.err !== null) continue;
    if (paysAtLeast(tx.changes, { recipient: row.recipient, mint: row.mint, amountBase: row.amount_base })) {
      const recorded = await markPaid(row, entry.signature, tx.signers[0] ?? null);
      return recorded ? { ...row, status: "paid", paid_signature: entry.signature, paid_by: tx.signers[0] ?? null, paid_at: new Date().toISOString() } : row;
    }
  }

  if (Date.parse(row.expires_at) <= now) {
    const { data } = await serviceClient().from("payment_requests").update({ status: "expired" }).eq("id", row.id).eq("status", "open").select("id");
    if ((data ?? []).length > 0) {
      await appendLedger(row.user_id, { actor: "elyra", event: "request.expired", subjectId: row.id, body: { reference: row.reference } });
      return { ...row, status: "expired" };
    }
  }
  return row;
}

/** A paid request by an intent's own signature, when the intent settled it. */
export async function settleFromIntent(requestId: string, signature: string, payer: string): Promise<void> {
  const { data } = await serviceClient().from("payment_requests").select("*").eq("id", requestId).eq("status", "open").maybeSingle();
  if (data === null || data === undefined) return;
  await markPaid(data as PaymentRequestRow, signature, payer);
}

export async function cancelRequest(userId: string, id: string): Promise<boolean> {
  const { data } = await serviceClient()
    .from("payment_requests")
    .update({ status: "cancelled" })
    .eq("id", id)
    .eq("user_id", userId)
    .eq("status", "open")
    .select("id");
  if ((data ?? []).length === 0) return false;
  await appendLedger(userId, { actor: "person", event: "request.cancelled", subjectId: id, body: {} });
  return true;
}

/* A public status read checks the chain at most this often per request. */
const CHECK_EVERY_MS = 10_000;
const lastChecked = new Map<string, number>();

/** A request by id, for its public page or an agent's status call, checked against the chain. */
export async function readRequest(id: string, userId?: string): Promise<PaymentRequestRow | null> {
  let query = serviceClient().from("payment_requests").select("*").eq("id", id);
  if (userId !== undefined) query = query.eq("user_id", userId);
  const { data } = await query.maybeSingle();
  if (data === null || data === undefined) return null;
  const row = data as PaymentRequestRow;
  const now = Date.now();
  if (row.status === "open" && now - (lastChecked.get(id) ?? 0) >= CHECK_EVERY_MS) {
    lastChecked.set(id, now);
    if (lastChecked.size > 5_000) lastChecked.clear();
    return checkRequest(row, now);
  }
  return row;
}
