import { NextResponse } from "next/server";
import { resolve } from "@/lib/personalized/session";
import {
  BASE_TRANSACTION_FEE_LAMPORTS,
  fromBaseUnits,
  leavesSendableBalance,
  readHolding,
} from "@/lib/solana/holdings";
import {
  buildSolTransfer,
  buildTokenTransfer,
  isValidRecipient,
} from "@/lib/solana/transfer";
import { resolveTokens } from "@/lib/solana/tokens";
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

   ── What the asset may be ──────────────────────────────────────────────

   This used to accept only a `symbol` from the trading allowlist, which is
   about twenty majors. That is the right rule for a SWAP, where a symbol is
   being resolved to a mint on the user's word and a lookalike is how someone
   trades their balance into a worthless token. It is the wrong rule for
   moving your own money out: a holding that is not on the trading allowlist
   was still stuck in an embedded wallet with no way to reach it, which is
   not a safety property, just a dead end.

   So a request may now name a MINT directly, and the check becomes narrower
   rather than looser: `readHolding` refuses any mint this wallet does not
   demonstrably hold. Nothing is resolved from a name, so nothing can resolve
   to the wrong thing. Decimals and the token program come back from the
   chain with the balance — never from the request, for the reason
   `transfer_checked` exists.

   `max: true` is the other half of being able to get out. Asking someone to
   type their exact balance to empty an account is asking them to leave dust
   behind on every attempt, and for native SOL the balance is never fully
   sendable anyway because the fee comes out of it. The server computes the
   exact amount that drains the account to zero and sends that.

   ── A rule this route learned the hard way ─────────────────────────────

   Draining to exactly zero is the ONE balance below rent-exemption Solana's
   runtime allows a system account to end a transaction holding. Anything
   else non-zero and short of the rent-exempt minimum — a few thousand
   lamports "held back" as fee headroom, or a partial send that leaves a
   small remainder — is REJECTED outright at simulation: not sent with rent
   then owed, refused, the whole transaction. `leavesSendableBalance` is the
   check for that, and it applies to the SENDER, not just the recipient — an
   earlier version of this route reserved a flat few thousand lamports for
   the fee and called that safe, which fails this exact way the moment the
   wallet's balance is small enough that the reserve itself is dust.
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
  const max = body.max === true;

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

  /* A mint names the asset directly. A symbol is only a way to name one, and
     is resolved through the same allowlist the trading paths use so that
     "USDC" cannot mean a lookalike mint here either. Native SOL is spelled
     "SOL" in both, and is the default when neither field is present. */
  let mint: string;
  if (typeof body.mint === "string" && body.mint.trim().length > 0) {
    mint = body.mint.trim();
  } else if (symbol === "" || symbol === "SOL") {
    mint = "SOL";
  } else {
    const asset = assetFor(symbol);
    if (asset === null) {
      return NextResponse.json(
        { error: `${symbol} is not a symbol I can resolve — send it by mint instead.` },
        { status: 400 },
      );
    }
    mint = asset.mint;
  }

  try {
    /* The authority for what is sendable, and the only thing that decides it.
       Not held means not sent, whatever the request says it is.

       Wrapped separately from the build step below because both talk to the
       RPC and can fail independently — `/api/wallet` only ever calls
       `getBalance`, so a provider that handles that fine and chokes on
       `getLatestBlockhash` (a different method, a different commitment
       level) shows a healthy balance right up until the moment a transfer
       is actually built. Naming which step failed is the difference between
       "the transfer could not be built" and something the operator can act
       on — checking the RPC provider's plan, in that case, rather than their
       own wallet. */
    const holding = await readHolding(from, mint).catch((cause: unknown) => {
      const message = cause instanceof Error ? cause.message : String(cause);
      console.error(`[transfer/build] Could not read the balance: ${message}`);
      throw new Error(`Could not read your balance: ${message}`);
    });

    if (holding === null) {
      return NextResponse.json(
        {
          error:
            mint === "SOL"
              ? "That balance could not be read."
              : "This wallet does not hold that token.",
        },
        { status: 400 },
      );
    }

    /* The ticker shown on the confirm screen is resolved HERE, from Jupiter's
       verified index, rather than taken from the request. The client knows a
       symbol — it read one out of the wallet snapshot — but a label on a
       confirm screen is the one thing the operator checks the transfer by,
       and it should not be echoed back from the same place the mint came
       from. An unverified mint resolves to nothing and is shown by address,
       which is the honest rendering: it is a token nobody has vouched for. */
    const ticker =
      mint === "SOL"
        ? "SOL"
        : ((await resolveTokens([mint])).get(mint)?.symbol ??
           `${mint.slice(0, 4)}…${mint.slice(-4)}`);

    if (BigInt(holding.sendable) <= BigInt(0)) {
      return NextResponse.json(
        {
          error:
            mint === "SOL"
              ? "There is not enough SOL here to cover the network fee, so nothing can be sent."
              : BigInt(holding.amount) > BigInt(0)
                ? `This wallet holds ${ticker}, but not in the account a transfer sends from. It cannot be moved from here.`
                : "That balance is zero.",
        },
        { status: 400 },
      );
    }

    /* Decimals from the CHAIN, never from the request — a wrong figure here
       is how a transfer moves a thousand times what was intended, and it is
       exactly what `transfer_checked` verifies against on-chain. */
    const baseUnits = max ? holding.sendable : toBaseUnits(amount, holding.decimals);

    if (baseUnits === null) {
      return NextResponse.json({ error: "That is not an amount I can send." }, { status: 400 });
    }

    if (BigInt(baseUnits) > BigInt(holding.sendable)) {
      const available = fromBaseUnits(holding.sendable, holding.decimals);
      return NextResponse.json(
        {
          error:
            mint === "SOL"
              ? `That is more than this wallet can send. ${available} SOL is available once the network fee is paid.`
              : `That is more than this wallet holds. ${available} ${ticker} is available.`,
        },
        { status: 400 },
      );
    }

    /* The check `sendable` cannot make: an amount that fits, but leaves this
       account holding a REMAINDER Solana's runtime will not allow — non-zero
       and short of the rent-exempt minimum. Only reachable for a partial SOL
       send; a full drain (`max`) always lands on exactly zero, which passes. */
    if (mint === "SOL" && !leavesSendableBalance(holding, baseUnits)) {
      const rentExempt = BigInt(holding.rentExemptLamports ?? "0");
      const headroom = BigInt(holding.sendable) - rentExempt;
      const ceiling = headroom > BigInt(0) ? fromBaseUnits(headroom.toString(), 9) : null;
      const floor = fromBaseUnits(rentExempt.toString(), 9);
      return NextResponse.json(
        {
          error:
            ceiling === null
              ? "This wallet's balance is too small to send part of it — Solana requires a wallet to end at exactly 0 or hold at least " +
                `${floor} SOL. Use Max to send everything instead.`
              : `Sending that would leave this wallet holding a balance Solana won't allow — a wallet must end at exactly 0 or at ` +
                `least ${floor} SOL. Send at most ${ceiling} SOL, or use Max to send everything.`,
        },
        { status: 400 },
      );
    }

    /* What is actually being sent, rendered from the base units that will go
       on-chain rather than from what was typed. With `max` they are not the
       same number, and the confirm screen must show the one that moves. */
    const sending = fromBaseUnits(baseUnits, holding.decimals);

    const built = await (mint === "SOL"
      ? buildSolTransfer({ from, to, lamports: baseUnits })
      : buildTokenTransfer({
          from,
          to,
          mint,
          amount: baseUnits,
          decimals: holding.decimals,
          tokenProgram: holding.tokenProgram ?? undefined,
        })
    ).catch((cause: unknown) => {
      const message = cause instanceof Error ? cause.message : String(cause);
      console.error(`[transfer/build] Could not build the transaction: ${message}`);
      throw new Error(`Could not prepare the transaction: ${message}`);
    });

    return NextResponse.json({
      unsignedTransaction: built.unsignedTransaction,
      summary: `Send ${sending} ${ticker}`,
      to,
      amount: sending,
      symbol: ticker,
      /* A max SOL send empties the wallet completely — nothing "stays
         behind" — so the confirm step names the network fee instead, which
         is the part of the balance that does not reach the recipient. */
      networkFee:
        mint === "SOL" && max
          ? fromBaseUnits(String(BASE_TRANSACTION_FEE_LAMPORTS), 9)
          : null,
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
