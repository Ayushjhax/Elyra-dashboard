import type { BuiltEvmStep, EvmTxRequest, EvmTxStatus } from "@/lib/evm/wire";
import { CANCELLED, signingFailure } from "@/lib/wallet/flows";

/* ---------------------------------------------------------------------------
   One EVM transaction, signed and seen through — the only path that moves
   funds on Ethereum or Robinhood Chain, shared by the send and swap dialogs
   the way lib/wallet/runSwap.ts is shared on Solana.

     1. SIGN    the caller's signer — Privy's embedded EVM wallet, in this
                browser — signs the transaction the server built. Every field
                is already fixed; the wallet fills in nothing.
     2. SUBMIT  /api/evm/submit holds the signed transaction to what was
                built and sealed, broadcasts it, and waits a few seconds.
     3. WATCH   still pending, this keeps asking /api/evm/status — which
                re-broadcasts each time — until the chain answers or the
                budget runs out. The watch lives in this call, not in a
                component effect, so nothing re-rendering can restart its
                clock (the lesson TransferDialog learned the hard way).

   A broadcast is never reported as success. Out of budget, the answer is
   "not confirmed yet", with the hash to check — not a guess either way.
--------------------------------------------------------------------------- */

type Fetcher = (url: string, init?: RequestInit) => Promise<Response>;

export type EvmTxRun =
  | { ok: true; hash: string; href: string | null }
  | {
      ok: false;
      error: string;
      cancelled: boolean;
      /** Set once it was broadcast: the person may need to check it. */
      hash?: string;
      href?: string | null;
      /** Broadcast, and still unresolved when the watch gave up. */
      unresolved?: boolean;
    };

/** How long the browser keeps watching. Ethereum under load can take minutes. */
const WATCH_BUDGET_MS = 4 * 60_000;
const WATCH_INTERVAL_MS = 3_000;

function sleep(ms: number, signal?: AbortSignal): Promise<void> {
  return new Promise((done) => {
    const handle = setTimeout(done, ms);
    signal?.addEventListener("abort", () => {
      clearTimeout(handle);
      done();
    });
  });
}

async function readStatus(response: Response): Promise<EvmTxStatus | null> {
  const payload = (await response.json().catch(() => null)) as EvmTxStatus | { error?: string } | null;
  if (payload === null || typeof payload !== "object") return null;
  if ("status" in payload) return payload;
  return { status: "failed", error: payload.error };
}

export async function runEvmTx(
  fetcher: Fetcher,
  sign: (tx: EvmTxRequest, summary: string) => Promise<string>,
  built: BuiltEvmStep,
  options: { onBroadcast?: (hash: string, href: string | null) => void; signal?: AbortSignal } = {},
): Promise<EvmTxRun> {
  let signed: string;
  try {
    signed = await sign(built.tx, built.summary);
  } catch (caught: unknown) {
    const error = signingFailure(caught, "The transaction could not be signed.");
    return { ok: false, error, cancelled: error === CANCELLED };
  }

  let submitted: EvmTxStatus | null;
  try {
    const response = await fetcher("/api/evm/submit", {
      method: "POST",
      body: JSON.stringify({ tx: built.tx, seal: built.seal, signedTransaction: signed }),
    });
    submitted = await readStatus(response);
  } catch {
    return {
      ok: false,
      error: "The network dropped before the transaction was confirmed. Check your wallet before trying again.",
      cancelled: false,
    };
  }

  if (submitted === null) return { ok: false, error: "The server did not answer.", cancelled: false };
  const hash = submitted.hash;
  const href = submitted.href ?? null;
  if (submitted.status === "confirmed" && hash !== undefined) return { ok: true, hash, href };
  if (submitted.status === "failed" || hash === undefined) {
    return { ok: false, error: submitted.error ?? "The transaction was not accepted.", cancelled: false, hash, href };
  }

  /* Pending: broadcast, not yet in a block. */
  options.onBroadcast?.(hash, href);
  const rebroadcast = submitted.signedTransaction ?? signed;
  const deadline = Date.now() + WATCH_BUDGET_MS;

  while (Date.now() < deadline) {
    await sleep(WATCH_INTERVAL_MS, options.signal);
    if (options.signal?.aborted === true) break;
    try {
      const response = await fetcher("/api/evm/status", {
        method: "POST",
        body: JSON.stringify({ chain: built.chain, hash, signedTransaction: rebroadcast }),
      });
      const status = await readStatus(response);
      if (status?.status === "confirmed") return { ok: true, hash, href };
      if (status?.status === "failed") {
        return { ok: false, error: status.error ?? "The transaction failed.", cancelled: false, hash, href };
      }
    } catch {
      /* A blip while watching is not the transaction failing. */
    }
  }

  return {
    ok: false,
    error: "Not confirmed yet. It may still land — check the explorer before trying again.",
    cancelled: false,
    hash,
    href,
    unresolved: true,
  };
}
