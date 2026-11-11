import { NextResponse } from "next/server";
import { suiTxUrl } from "@/lib/sui/chain";
import { startSuiRoute } from "@/lib/sui/route";
import { parseSuiTxRequest, verifyAndExecuteSui } from "@/lib/sui/tx";

/* ---------------------------------------------------------------------------
   Step two of a Sui send or swap: attach the wallet's signature to the bytes
   this server built and sealed, check it, and execute.

   Refused unless the seal is this server's and fresh, the sender is the
   session's Sui address, the public key derives to that address, and the
   signature verifies over the sealed bytes (lib/sui/tx.ts). Sui finalises in
   well under a second, so the outcome comes back in this response — there is
   no pending state to watch.
--------------------------------------------------------------------------- */

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  const start = await startSuiRoute(request);
  if (!start.ok) return start.response;
  const { address, publicKey, body } = start;

  const tx = parseSuiTxRequest(body.tx);
  if (tx === null) return NextResponse.json({ status: "failed", error: "That is not a transaction Elyra built." }, { status: 400 });

  const result = await verifyAndExecuteSui({
    tx,
    seal: typeof body.seal === "string" ? body.seal : "",
    signature: typeof body.signature === "string" ? body.signature : "",
    /* Privy's own record first; the client's copy only ever passes if it
       derives to the session's address. */
    publicKeys: [publicKey, typeof body.publicKey === "string" ? body.publicKey : null],
    sessionAddress: address,
    now: Date.now(),
  });

  if (result.ok) {
    return NextResponse.json({ status: "confirmed", digest: result.digest, href: suiTxUrl(result.digest) });
  }
  return NextResponse.json(
    { status: "failed", error: result.error, ...(result.digest ? { digest: result.digest, href: suiTxUrl(result.digest) } : {}) },
    { status: result.digest ? 502 : 400 },
  );
}
