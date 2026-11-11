import { NextResponse } from "next/server";
import { fromBase64 } from "@mysten/sui/utils";
import { checkSuiSwap } from "@/lib/sui/derive";
import { resolveSuiCoin, suiBalanceOf } from "@/lib/sui/coins";
import { startSuiRoute } from "@/lib/sui/route";
import { checkLifiSuiQuote, LIFI_SUI_CHAIN_ID } from "@/lib/sui/swap";
import { firstLine, sealSuiTx, simulateSui, suiSigningHash, type SuiTxRequest } from "@/lib/sui/tx";
import { fromBaseUnits, toBaseUnits } from "@/lib/solana/amount";

/* ---------------------------------------------------------------------------
   Step one of a swap on Sui: quote it through LI.FI and check it three ways
   before the wallet is asked to sign anything —

     1. the quote's own claims: same coins, same amount, the session's
        address as sender and recipient (`checkLifiSuiQuote`);
     2. the transaction bytes' sender is the session's address;
     3. a simulation of those exact bytes: the person receives at least the
        quoted minimum, and pays no more than the amount sold plus gas
        (`checkSuiSwap`).

   Buying ANY coin is allowed by its full Move type. A coin on no trusted list
   is bought only when the request says, explicitly, that the person has seen
   it is unverified — a coin type can call itself anything.
--------------------------------------------------------------------------- */

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const SLIPPAGE = 0.005;
const bad = (error: string) => NextResponse.json({ error }, { status: 400 });

export async function POST(request: Request) {
  const start = await startSuiRoute(request);
  if (!start.ok) return start.response;
  const { address: owner, body } = start;

  const [sell, buy] = await Promise.all([
    resolveSuiCoin(typeof body.from === "string" ? body.from : ""),
    resolveSuiCoin(typeof body.to === "string" ? body.to : ""),
  ]);
  if (sell === null || buy === null) return bad("Name each coin by its symbol from the list, or by its full Move type (0x…::module::NAME).");
  if (sell.coinType === buy.coinType) return bad("Choose two different coins.");
  if (!buy.verified && body.acknowledgeUnverified !== true) {
    return bad(`${buy.symbol} is not on Elyra's verified list. Confirm you have checked its coin type before buying it.`);
  }

  const parsed = toBaseUnits(typeof body.amount === "string" ? body.amount : "", sell.decimals);
  if (parsed === null) return bad("That is not an amount I can swap.");
  const amount = BigInt(parsed);

  try {
    const balance = await suiBalanceOf(owner, sell.coinType);
    if (balance < amount) return bad(`That is more ${sell.symbol} than this wallet holds on Sui (${fromBaseUnits(balance, sell.decimals)}).`);

    const params = new URLSearchParams({
      fromChain: String(LIFI_SUI_CHAIN_ID),
      toChain: String(LIFI_SUI_CHAIN_ID),
      fromToken: sell.coinType,
      toToken: buy.coinType,
      fromAmount: amount.toString(),
      fromAddress: owner,
      toAddress: owner,
      slippage: String(SLIPPAGE),
      integrator: "elyra",
    });
    const response = await fetch(`https://li.quest/v1/quote?${params.toString()}`, {
      headers: { accept: "application/json" },
      signal: AbortSignal.timeout(15_000),
      cache: "no-store",
    });
    const quoteBody: unknown = await response.json().catch(() => null);
    if (!response.ok) {
      const message = (quoteBody as { message?: string } | null)?.message ?? `The swap router returned ${response.status}.`;
      return NextResponse.json(
        { error: /no available quotes|no routes|could successfully generate/i.test(message) ? "No route can make that swap right now. Try a different amount or pair." : message.slice(0, 240) },
        { status: 502 },
      );
    }
    const checked = checkLifiSuiQuote(quoteBody, { fromType: sell.coinType, toType: buy.coinType, fromAmount: amount.toString(), address: owner });
    if (!checked.ok) return NextResponse.json({ error: checked.error }, { status: 502 });

    const bytes = fromBase64(checked.quote.bytes);
    const simulation = await simulateSui(bytes);
    if (simulation.sender?.toLowerCase() !== owner.toLowerCase()) {
      return NextResponse.json({ error: "The routed transaction was built for a different sender, so it was not used." }, { status: 502 });
    }
    if (!simulation.success) {
      return bad(`This swap would fail on Sui right now: ${simulation.error ?? "the simulation failed"}.`);
    }
    const outcome = checkSuiSwap({
      owner,
      changes: simulation.changes,
      fromType: sell.coinType,
      fromAmount: amount,
      toType: buy.coinType,
      toAmountMin: BigInt(checked.quote.toAmountMin),
      gasBudget: simulation.gasBudget,
    });
    if (!outcome.ok) return NextResponse.json({ error: outcome.error }, { status: 502 });

    const tx: SuiTxRequest = { bytes: checked.quote.bytes, sender: owner, purpose: "swap", builtAt: Date.now() };
    const sellAmount = fromBaseUnits(amount, sell.decimals);
    const buyAmount = fromBaseUnits(BigInt(checked.quote.toAmount), buy.decimals);
    return NextResponse.json({
      tx,
      seal: sealSuiTx(tx),
      hash: suiSigningHash(bytes),
      summary: `Swap ${sellAmount} ${sell.symbol} for about ${buyAmount} ${buy.symbol} on Sui`,
      networkFeeMax: fromBaseUnits(simulation.gasBudget, 9),
      quote: {
        sellSymbol: sell.symbol,
        buySymbol: buy.symbol,
        sellAmount,
        buyAmount,
        buyAmountMin: fromBaseUnits(BigInt(checked.quote.toAmountMin), buy.decimals),
        slippagePct: SLIPPAGE * 100,
        route: checked.quote.tool,
        routeFeeUsd: checked.quote.feeUsd,
        buyVerified: buy.verified,
      },
    });
  } catch (error: unknown) {
    return NextResponse.json({ error: firstLine(error, "The swap could not be prepared.") }, { status: 503 });
  }
}
