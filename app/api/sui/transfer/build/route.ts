import { NextResponse } from "next/server";
import { isSuiAddress, normalizeCoinType, SUI_COIN_TYPE } from "@/lib/sui/chain";
import { resolveSuiCoin, suiBalanceOf } from "@/lib/sui/coins";
import { startSuiRoute } from "@/lib/sui/route";
import { buildSuiTransfer, firstLine, sealSuiTx, simulateSui, suiSigningHash, toBase64, type SuiTxRequest } from "@/lib/sui/tx";
import { fromBaseUnits, toBaseUnits } from "@/lib/solana/amount";

/* ---------------------------------------------------------------------------
   Step one of a send on Sui: build it for the session's Sui wallet, simulate
   it, and return the hash the wallet will sign.

   The Solana and EVM send rules, kept: the recipient is refused by shape
   before anything is built and shown back in full on the confirm screen;
   what is sendable is what the chain says the wallet holds, decimals
   included; `max` sends it all — for SUI, the gas coin itself, so exactly
   the fee stays behind. Any coin the wallet holds can be sent; one on no
   trusted list is named as unverified.
--------------------------------------------------------------------------- */

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const bad = (error: string) => NextResponse.json({ error }, { status: 400 });

export async function POST(request: Request) {
  const start = await startSuiRoute(request);
  if (!start.ok) return start.response;
  const { address: sender, body } = start;

  const to = typeof body.to === "string" ? body.to.trim().toLowerCase() : "";
  if (!isSuiAddress(to)) return bad("That is not a valid Sui address — a Sui address is 0x followed by 64 hex characters.");
  if (to === sender.toLowerCase()) return bad("That is your own address — nothing would move.");

  const coin = await resolveSuiCoin(typeof body.coin === "string" && body.coin.trim().length > 0 ? body.coin : "SUI");
  if (coin === null) return bad("That is not a coin this wallet can send on Sui.");
  const max = body.max === true;

  try {
    const balance = await suiBalanceOf(sender, coin.coinType);
    if (balance <= BigInt(0)) return bad(`This wallet holds no ${coin.symbol} on Sui.`);
    const amount = max ? balance : (() => {
      const parsed = toBaseUnits(typeof body.amount === "string" ? body.amount : "", coin.decimals);
      return parsed === null ? null : BigInt(parsed);
    })();
    if (amount === null || amount <= BigInt(0)) return bad("That is not an amount I can send.");
    if (amount > balance) return bad(`That is more than this wallet holds. ${fromBaseUnits(balance, coin.decimals)} ${coin.symbol} is available.`);

    const bytes = await buildSuiTransfer({ sender, recipient: to, coinType: coin.coinType, amount, max });
    const simulation = await simulateSui(bytes);
    if (!simulation.success) {
      return bad(`Sui would reject this send: ${simulation.error ?? "the simulation failed"}. A send needs a little SUI for the network fee.`);
    }

    /* What actually moves, from the simulation rather than the request: for
       a max SUI send that is the balance less the fee. */
    const moved = simulation.changes
      .filter((change) => change.owner?.toLowerCase() === to && normalizeCoinType(change.coinType) === coin.coinType)
      .reduce((sum, change) => sum + BigInt(change.amount), BigInt(0));
    const sending = fromBaseUnits(moved > BigInt(0) ? moved : amount, coin.decimals);

    const tx: SuiTxRequest = { bytes: toBase64(bytes), sender, purpose: "transfer", builtAt: Date.now() };
    return NextResponse.json({
      tx,
      seal: sealSuiTx(tx),
      hash: suiSigningHash(bytes),
      summary: `Send ${sending} ${coin.symbol} on Sui`,
      networkFeeMax: fromBaseUnits(simulation.gasBudget, 9),
      to,
      amount: sending,
      symbol: coin.symbol,
      verified: coin.verified,
      native: coin.coinType === SUI_COIN_TYPE,
    });
  } catch (error: unknown) {
    return NextResponse.json({ error: firstLine(error, "The send could not be prepared.") }, { status: 503 });
  }
}
