import { NextResponse } from "next/server";
import { evmTxUrl } from "@/lib/evm/chains";
import { startEvmRoute } from "@/lib/evm/route";
import { broadcast, firstLine, parseTxRequest, receiptStatus, verifySigned } from "@/lib/evm/tx";

/* ---------------------------------------------------------------------------
   Step two of an EVM send, approval or swap: check what the person signed,
   broadcast it, and stay long enough to find out whether it landed.

   Unlike the Solana routes, the signed transaction is DECODED here and held
   to the request this server built and sealed — signer, network, nonce,
   destination, value and calldata — before it is broadcast (lib/evm/tx.ts).
   Anything that does not match is refused, not "fixed": what reaches the
   chain is exactly what was built and exactly what the wallet signed.

   A broadcast is not an outcome. This route watches for the receipt for a
   few seconds — Robinhood Chain's ~100ms blocks land well inside that,
   Ethereum's twelve-second ones often do not — and otherwise answers
   "pending", 202, and `/api/evm/status` is where the browser keeps watching.
--------------------------------------------------------------------------- */

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const SERVER_POLL_BUDGET_MS = 8_000;
const POLL_INTERVAL_MS = 1_000;

function sleep(ms: number): Promise<void> {
  return new Promise((done) => setTimeout(done, ms));
}

export async function POST(request: Request) {
  const start = await startEvmRoute(request);
  if (!start.ok) return start.response;
  const { address, body } = start;

  const tx = parseTxRequest(body.tx);
  if (tx === null) return NextResponse.json({ error: "That is not a transaction Elyra built." }, { status: 400 });

  const verified = await verifySigned({
    tx,
    seal: typeof body.seal === "string" ? body.seal : "",
    signed: typeof body.signedTransaction === "string" ? body.signedTransaction : "",
    sessionAddress: address,
    now: Date.now(),
  });
  if (!verified.ok) return NextResponse.json({ status: "failed", error: verified.error }, { status: 400 });

  const href = evmTxUrl(tx.chain, verified.hash);

  try {
    await broadcast(tx.chain, verified.serialized);
  } catch (error: unknown) {
    const message = firstLine(error, "The network did not accept the transaction.");
    /* A node that already has it is not a failure — an earlier attempt got
       through. Anything else (insufficient funds, a used nonce) is the
       node's own refusal, passed through: nothing was sent. */
    if (!/already known|known transaction|already imported/i.test(message)) {
      return NextResponse.json({ status: "failed", hash: verified.hash, href, error: message }, { status: 502 });
    }
  }

  const deadline = Date.now() + SERVER_POLL_BUDGET_MS;
  while (Date.now() < deadline) {
    await sleep(POLL_INTERVAL_MS);
    const outcome = await receiptStatus(tx.chain, verified.hash).catch(() => null);
    if (outcome === null || outcome.status === "pending") continue;
    return NextResponse.json({ ...outcome, href }, { status: outcome.status === "failed" ? 502 : 200 });
  }

  /* Broadcast, not yet in a block. Not a failure and not a success. The
     signed bytes go back so the browser can re-broadcast while it waits. */
  return NextResponse.json(
    { status: "pending", hash: verified.hash, href, signedTransaction: verified.serialized },
    { status: 202 },
  );
}
