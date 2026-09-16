import { NextResponse } from "next/server";
import { resolve } from "@/lib/personalized/session";
import {
  buildSolTransfer,
  buildTokenTransfer,
  isValidRecipient,
  solToLamports,
} from "@/lib/solana/transfer";
import { assetFor, toBaseUnits } from "@/lib/telegram/trade";

/* ---------------------------------------------------------------------------
   Step one of a transfer: build it, unsigned.

   The sender comes from the SESSION. The recipient comes from the request,
   because only the operator knows where they are sending — and that is the
   one field here with no safety net at all. A swap that goes wrong loses to
   slippage; a transfer to the wrong address is simply gone. So the address
   is validated before anything is built, and refused by shape rather than
   passed through to fail later as an opaque RPC error.

   SOL is not USDC-with-different-decimals. Native SOL moves through the
   system program; everything else moves through the token program with an
   associated account that may not exist yet. Sending native SOL down the SPL
   path would transfer WRAPPED SOL — a different asset, which most recipients
   are not set up to receive and which would look like a successful send.
--------------------------------------------------------------------------- */

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  const resolved = await resolve(request);
  if ("response" in resolved) return resolved.response;
  const { session } = resolved;

  const from = session.solanaAddress;
  if (from === null) {
    return NextResponse.json(
      { error: "No Solana wallet is connected to your account." },
      { status: 400 },
    );
  }

  let body: Record<string, unknown>;
  try {
    body = (await request.json()) as Record<string, unknown>;
  } catch {
    return NextResponse.json({ error: "Expected a JSON body" }, { status: 400 });
  }

  const to = typeof body.to === "string" ? body.to.trim() : "";
  const symbol = typeof body.symbol === "string" ? body.symbol.toUpperCase() : "";
  const amount = typeof body.amount === "string" ? body.amount : "";

  if (!isValidRecipient(to)) {
    return NextResponse.json(
      { error: "That is not a valid Solana address." },
      { status: 400 },
    );
  }

  if (to === from) {
    return NextResponse.json(
      { error: "That is your own address — nothing would move." },
      { status: 400 },
    );
  }

  try {
    if (symbol === "SOL") {
      const lamports = solToLamports(amount);
      if (lamports === null) {
        return NextResponse.json({ error: "That is not an amount I can send." }, { status: 400 });
      }

      const built = await buildSolTransfer({ from, to, lamports });
      return NextResponse.json({
        unsignedTransaction: built.unsignedTransaction,
        summary: `Send ${amount} SOL`,
        to,
      });
    }

    /* Decimals from the allowlist, never from the request — see the note in
       lib/solana/transfer.ts for why a caller-supplied figure is a way to
       move a thousand times the intended amount. */
    const asset = assetFor(symbol);
    if (asset === null) {
      return NextResponse.json(
        { error: `${symbol || "That token"} is not one I can send.` },
        { status: 400 },
      );
    }

    const baseUnits = toBaseUnits(amount, asset.decimals);
    if (baseUnits === null) {
      return NextResponse.json({ error: "That is not an amount I can send." }, { status: 400 });
    }

    const built = await buildTokenTransfer({
      from,
      to,
      mint: asset.mint,
      amount: baseUnits,
      decimals: asset.decimals,
    });

    return NextResponse.json({
      unsignedTransaction: built.unsignedTransaction,
      summary: `Send ${amount} ${symbol}`,
      to,
    });
  } catch (error: unknown) {
    /* Most often the RPC being unset or unreachable. Reported as 503 because
       nothing was wrong with the request. */
    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "The transfer could not be built.",
      },
      { status: 503 },
    );
  }
}
