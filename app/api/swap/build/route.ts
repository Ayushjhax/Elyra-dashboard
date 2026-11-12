import { NextResponse } from "next/server";
import { PassportError, assetPassport, readMint } from "@/lib/passport/server";
import { resolve } from "@/lib/personalized/session";
import { guardSwap } from "@/lib/solana/swapGuard";
import { isSolanaAddress, truncateAddress } from "@/lib/solana/address";
import { assetByMint, parseSwapCommand, previewSwap, type UnlistedMint } from "@/lib/trade";

/* ---------------------------------------------------------------------------
   Step one of a swap: quote it, and hand back something signable.

   The taker comes from the SESSION, never from the body. Jupiter builds the
   transaction around whoever it is told will sign, so taking that from the
   request would let a caller have a transaction built against an address
   that is not theirs. It would be unsignable by them and therefore harmless
   on-chain, but it would also let this endpoint be used to probe other
   people's balances — `order` returns 400 for a wallet that cannot afford
   the trade, which makes it an oracle.

   Nothing is persisted and nothing is sent. The response is a price and a
   pile of bytes; only the browser can turn it into a transaction, and only
   by signing it.

   ── Any token, by mint ──────────────────────────────────────────────────

   Either side may instead be named by MINT (`fromMint`, `toMint`), which is
   how a person buys or sells a token that is not on the allowlist. A mint
   that is on it is the listed asset, by address, with its listed symbol.
   Any other is read from the chain — decimals from the mint account itself
   (the Asset Passport's reader), never from the request — and is refused
   unless the request carries `acknowledgeUnverified`, which the dialog
   sends only once the person has ticked that they checked it. Its live
   mint controls (a freeze authority, a transfer fee…) become warnings on
   the quote, and it is labelled by its claimed symbol AND its address, so a
   lookalike "USDC" can never read as the real one.
--------------------------------------------------------------------------- */

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  const resolved = await resolve(request);
  if ("response" in resolved) return resolved.response;
  const { session } = resolved;

  let body: Record<string, unknown>;
  try {
    body = (await request.json()) as Record<string, unknown>;
  } catch {
    return NextResponse.json({ error: "Expected a JSON body" }, { status: 400 });
  }

  const amount = typeof body.amount === "string" ? body.amount : "";
  const acknowledged = body.acknowledgeUnverified === true;

  let sides: [Side, Side];
  try {
    sides = await Promise.all([
      sideOf(body.fromMint, body.fromSymbol, acknowledged),
      sideOf(body.toMint, body.toSymbol, acknowledged),
    ]);
  } catch (error: unknown) {
    const status = error instanceof PassportError ? error.status : 400;
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "That token could not be read." },
      { status: status >= 500 ? status : 400 },
    );
  }
  const [from, to] = sides;

  /* Parsed by the same function the chat command uses, so "1.5" is held to
     one definition of a valid amount rather than two that can drift. An
     unlisted side stands in as a placeholder for the parse and is named by
     its label after. */
  const parsed = parseSwapCommand(
    `${amount} ${from.unlisted === null ? from.symbol : "X"} to ${to.unlisted === null ? to.symbol : "Y"}`,
  );
  if (parsed === null) {
    return NextResponse.json(
      { error: "That is not a swap I can read." },
      { status: 400 },
    );
  }
  const swap = {
    ...parsed,
    fromSymbol: from.unlisted === null ? parsed.fromSymbol : from.symbol,
    toSymbol: to.unlisted === null ? parsed.toSymbol : to.symbol,
  };

  const preview = await previewSwap({
    request: swap,
    solanaAddress: session.solanaAddress,
    unlisted: {
      ...(from.unlisted === null ? {} : { from: from.unlisted }),
      ...(to.unlisted === null ? {} : { to: to.unlisted }),
    },
  });

  if ("error" in preview) {
    return NextResponse.json({ error: preview.error }, { status: 400 });
  }

  /* Before any bytes go to the wallet, the transaction is simulated against
     the person's own accounts and held to the swap they asked for
     (lib/solana/swapGuard.ts). A swap that fails the check — or cannot be
     checked — is shown with the reason and nothing to sign. */
  if (preview.unsignedTransaction !== undefined && preview.sell !== undefined && session.solanaAddress !== null) {
    const verdict = await guardSwap({
      owner: session.solanaAddress,
      transaction: preview.unsignedTransaction,
      sellMint: preview.sell.mint,
      sellAmount: preview.sell.amount,
      label: (mint) => (mint === preview.sell?.mint ? swap.fromSymbol : (assetByMint(mint)?.symbol ?? `${mint.slice(0, 4)}…${mint.slice(-4)}`)),
    });
    if (!verdict.ok) {
      return NextResponse.json({
        action: { ...preview.action, readiness: "unsupported", reason: verdict.error },
        note: "Nothing has been sent.",
        unsignedTransaction: null,
        quoteRef: null,
        signer: session.solanaAddress,
      });
    }
  }

  return NextResponse.json({
    action: preview.action,
    note: preview.note,
    unsignedTransaction: preview.unsignedTransaction ?? null,
    quoteRef: preview.quoteRef ?? null,
    /* The address the order was built for. A wallet holding a different
       address must refuse to sign: Jupiter would reject the bytes anyway,
       and a person with two wallets deserves to be told which one. */
    signer: session.solanaAddress,
  });
}

interface Side {
  /** The listed symbol, or the label an unlisted token is shown under. */
  symbol: string;
  unlisted: UnlistedMint | null;
}

/**
 * One side of the swap. A symbol is passed through to the allowlist as the
 * chat command's is; a mint on the allowlist becomes its symbol; any other
 * mint is read from the chain, and only once acknowledged.
 */
async function sideOf(mint: unknown, symbol: unknown, acknowledged: boolean): Promise<Side> {
  if (typeof mint !== "string" || mint.trim().length === 0) {
    return { symbol: typeof symbol === "string" ? symbol : "", unlisted: null };
  }
  const address = mint.trim();
  if (!isSolanaAddress(address)) throw new Error("That is not a Solana token mint address.");

  const listed = assetByMint(address);
  if (listed !== null) return { symbol: listed.symbol, unlisted: null };

  if (!acknowledged) {
    throw new Error(
      `${truncateAddress(address, 4, 4)} is not on Elyra's verified list. Check its Asset Passport, then confirm you have.`,
    );
  }

  const [account, passport] = await Promise.all([readMint(address), assetPassport(address).catch(() => null)]);
  const claimed = (passport?.symbol ?? "").replace(/[^\p{L}\p{N}$._-]/gu, "").slice(0, 12);
  const label = `${claimed.length > 0 ? claimed : "Token"} (${truncateAddress(address, 4, 4)})`;

  const live = (passport?.controls ?? []).filter((control) => control.live);
  return {
    symbol: label,
    unlisted: {
      mint: address,
      decimals: account.decimals,
      warnings: [
        `${label} is not on Elyra's verified list. It will show in your wallet unverified, and is never valued or counted.`,
        ...live.slice(0, 3).map((control) => `${label}: ${control.title}. ${control.detail}`),
      ],
    },
  };
}
