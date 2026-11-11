import type { BuiltSuiStep, SuiTxStatus } from "@/lib/sui/wire";
import { CANCELLED, signingFailure } from "@/lib/wallet/flows";

/* ---------------------------------------------------------------------------
   One Sui transaction, signed and seen through — the only path that moves
   funds on Sui, shared by the send and swap dialogs.

     1. SIGN    the wallet — Privy's embedded Sui wallet — signs the 32-byte
                hash the server computed over the bytes it built. It never
                sees or edits the transaction itself.
     2. SUBMIT  /api/sui/submit attaches that signature to the sealed bytes,
                checks it against the session's address, and executes. Sui
                finalises in well under a second, so the answer is final:
                confirmed, or failed with the reason.
--------------------------------------------------------------------------- */

type Fetcher = (url: string, init?: RequestInit) => Promise<Response>;

export type SuiTxRun =
  | { ok: true; digest: string; href: string | null }
  | { ok: false; error: string; cancelled: boolean; digest?: string; href?: string | null };

export async function runSuiTx(
  fetcher: Fetcher,
  sign: (hash: `0x${string}`) => Promise<string>,
  built: BuiltSuiStep,
  publicKey: string | null,
): Promise<SuiTxRun> {
  let signature: string;
  try {
    signature = await sign(built.hash);
  } catch (caught: unknown) {
    const error = signingFailure(caught, "The transaction could not be signed.");
    return { ok: false, error, cancelled: error === CANCELLED };
  }

  try {
    const response = await fetcher("/api/sui/submit", {
      method: "POST",
      body: JSON.stringify({ tx: built.tx, seal: built.seal, signature, publicKey }),
    });
    const payload = (await response.json().catch(() => null)) as (SuiTxStatus & { error?: string }) | null;
    if (payload?.status === "confirmed" && typeof payload.digest === "string") {
      return { ok: true, digest: payload.digest, href: payload.href ?? null };
    }
    return {
      ok: false,
      error: payload?.error ?? "Sui did not accept the transaction.",
      cancelled: false,
      digest: payload?.digest,
      href: payload?.href ?? null,
    };
  } catch {
    return {
      ok: false,
      error: "The network dropped before the transaction was confirmed. Check your wallet before trying again.",
      cancelled: false,
    };
  }
}
