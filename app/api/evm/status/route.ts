import { NextResponse } from "next/server";
import { parseTransaction, recoverTransactionAddress, type Hex } from "viem";
import { EVM_CHAINS, evmTxUrl } from "@/lib/evm/chains";
import { badRequest, chainFrom, startEvmRoute } from "@/lib/evm/route";
import { broadcast, receiptStatus } from "@/lib/evm/tx";

/* ---------------------------------------------------------------------------
   Watching an EVM transaction `/api/evm/submit` handed back as pending.

   Called on an interval by the send and swap dialogs. Each call
   re-broadcasts the signed bytes when they are supplied — a no-op for a node
   that already has them, a second chance for one that dropped them — and
   reports the receipt.

   A transaction never seen whose nonce this wallet has since used was
   replaced by another of its transactions, and will never land; that is
   reported as such rather than as pending forever (lib/evm/tx.ts).

   Only the session's own signed transactions are re-broadcast: this route is
   not a relay for anyone else's.
--------------------------------------------------------------------------- */

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  const start = await startEvmRoute(request);
  if (!start.ok) return start.response;
  const { address, body } = start;

  const chain = chainFrom(body.chain);
  if (chain === null) return badRequest("Choose Ethereum or Robinhood Chain.");
  const hash = typeof body.hash === "string" && /^0x[0-9a-fA-F]{64}$/.test(body.hash) ? (body.hash as Hex) : null;
  if (hash === null) return badRequest("A transaction hash is required.");

  let nonce: number | undefined;
  const signed = typeof body.signedTransaction === "string" ? body.signedTransaction : "";
  if (/^0x[0-9a-fA-F]+$/.test(signed) && signed.length <= 80_000) {
    try {
      const parsed = parseTransaction(signed as Hex);
      const signer = await recoverTransactionAddress({
        serializedTransaction: signed as Parameters<typeof recoverTransactionAddress>[0]["serializedTransaction"],
      });
      if (signer.toLowerCase() === address.toLowerCase() && parsed.chainId === EVM_CHAINS[chain].id) {
        nonce = parsed.nonce;
        await broadcast(chain, signed as Hex).catch(() => {});
      }
    } catch {
      /* Unreadable bytes are simply not re-broadcast; the status still answers. */
    }
  }

  try {
    const outcome = await receiptStatus(chain, hash, nonce === undefined ? undefined : { from: address, nonce });
    return NextResponse.json({ ...outcome, href: evmTxUrl(chain, hash) }, { status: outcome.status === "failed" ? 502 : 200 });
  } catch {
    /* An RPC blip while checking is not the transaction failing. */
    return NextResponse.json({ status: "pending", hash, href: evmTxUrl(chain, hash) });
  }
}
