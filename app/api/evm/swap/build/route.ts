import { NextResponse } from "next/server";
import { encodeFunctionData, erc20Abi, getAddress, type Hex } from "viem";
import { readEvmAsset } from "@/lib/evm/assets";
import { EVM_CHAINS } from "@/lib/evm/chains";
import { evmClient } from "@/lib/evm/rpc";
import { badRequest, chainFrom, startEvmRoute } from "@/lib/evm/route";
import { EVM_SWAP_SLIPPAGE, routerAddress, swapTokenFor } from "@/lib/evm/swap";
import { firstLine, maxFeeWei, prepareTx, sealTx } from "@/lib/evm/tx";
import { lifiQuote } from "@/lib/providers/lifi";
import { fromBaseUnits, toBaseUnits } from "@/lib/solana/amount";

/* ---------------------------------------------------------------------------
   Step one of a swap on Ethereum or Robinhood Chain: quote it, and build the
   next transaction it needs.

   Both tokens are named by symbol and resolved to their canonical contracts
   (lib/evm/swap.ts) — never taken as addresses from the request — and the
   route's quote is held to the swap that was asked for, output paid to the
   session's own address, before anything is built from it.

   An ERC-20 sell needs the router to be allowed to move the tokens first.
   When the current allowance is short, this returns that APPROVAL as the
   step to sign — for exactly the amount being sold, never an unlimited
   allowance that would outlive this swap. Once it confirms, the client asks
   again and gets a fresh quote and the swap itself; quoting once and
   executing after an approval on Ethereum's twelve-second blocks would sign
   a quote that had already moved.

   The swap transaction is re-estimated here rather than trusting the
   router's gas figures, and the estimate is a simulation: a swap that would
   revert right now is refused before anyone is asked to sign it.

   Robinhood Stock Tokens are not swappable — see lib/evm/swap.ts for why.
--------------------------------------------------------------------------- */

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  const start = await startEvmRoute(request);
  if (!start.ok) return start.response;
  const { address: owner, body } = start;

  const chain = chainFrom(body.chain);
  if (chain === null) return badRequest("Choose Ethereum or Robinhood Chain.");
  const network = EVM_CHAINS[chain].name;

  const sell = swapTokenFor(chain, typeof body.fromSymbol === "string" ? body.fromSymbol : "");
  const buy = swapTokenFor(chain, typeof body.toSymbol === "string" ? body.toSymbol : "");
  if (sell === null || buy === null) {
    return badRequest(`Swaps on ${network} cover ETH and the listed crypto tokens. Stock tokens are not swappable in Elyra.`);
  }
  if (sell.address === buy.address) return badRequest("Choose two different tokens.");

  const amount = toBaseUnits(typeof body.amount === "string" ? body.amount : "", sell.decimals);
  if (amount === null) return badRequest("That is not an amount I can swap.");
  const sellAmount = BigInt(amount);

  try {
    const client = evmClient(chain);
    const held = await readEvmAsset(chain, owner, sell.address === "native" ? "native" : sell.address);
    if (held === null || held.balance < sellAmount) {
      return badRequest(
        `That is more ${sell.symbol} than this wallet holds on ${network}${held === null ? "" : ` (${fromBaseUnits(held.balance, sell.decimals)})`}.`,
      );
    }

    const quoted = await lifiQuote({
      chain,
      fromToken: routerAddress(sell),
      toToken: routerAddress(buy),
      fromAmount: amount,
      address: owner,
      slippage: EVM_SWAP_SLIPPAGE,
    });
    if (!quoted.ok) return NextResponse.json({ error: quoted.error }, { status: 502 });
    const quote = quoted.quote;

    const view = {
      sellSymbol: sell.symbol,
      buySymbol: buy.symbol,
      sellAmount: fromBaseUnits(sellAmount, sell.decimals),
      buyAmount: fromBaseUnits(BigInt(quote.toAmount), buy.decimals),
      buyAmountMin: fromBaseUnits(BigInt(quote.toAmountMin), buy.decimals),
      slippagePct: EVM_SWAP_SLIPPAGE * 100,
      route: quote.tool,
      routeFeeUsd: quote.feeUsd,
    };

    /* ---- The allowance, for a token sell ---- */
    if (sell.address !== "native") {
      const spender = getAddress(quote.approvalAddress);
      const token = getAddress(sell.address);
      const allowance = await client.readContract({
        address: token,
        abi: erc20Abi,
        functionName: "allowance",
        args: [owner, spender],
      });
      if (allowance < sellAmount) {
        /* USDT refuses to change a non-zero allowance to another non-zero
           one; it has to be cleared first. */
        const reset = allowance > BigInt(0) && sell.symbol === "USDT";
        const data: Hex = encodeFunctionData({
          abi: erc20Abi,
          functionName: "approve",
          args: [spender, reset ? BigInt(0) : sellAmount],
        });
        const tx = await prepareTx(chain, { from: owner, to: token, value: BigInt(0), data, purpose: "approve" });
        return NextResponse.json({
          step: "approve",
          tx,
          seal: sealTx(tx),
          signer: owner,
          chain,
          summary: reset
            ? `Clear the existing ${sell.symbol} allowance first`
            : `Allow the swap router to spend ${view.sellAmount} ${sell.symbol}`,
          networkFeeMax: fromBaseUnits(maxFeeWei(tx), 18),
          quote: view,
        });
      }
    }

    /* ---- The swap ---- */
    const tx = await prepareTx(chain, {
      from: owner,
      to: quote.to,
      value: BigInt(quote.value),
      data: quote.data as Hex,
      purpose: "swap",
    }).catch((cause: unknown) => {
      throw new Error(`This swap would fail on ${network} right now: ${firstLine(cause, "the simulation reverted")}`);
    });

    const ethNeeded = BigInt(tx.value) + maxFeeWei(tx);
    const ethBalance = sell.address === "native" ? held.balance : await client.getBalance({ address: owner });
    if (ethBalance < ethNeeded) {
      return badRequest(
        `This swap needs up to ${fromBaseUnits(ethNeeded, 18)} ETH on ${network}, including the network fee; the wallet holds ${fromBaseUnits(ethBalance, 18)}.`,
      );
    }

    return NextResponse.json({
      step: "swap",
      tx,
      seal: sealTx(tx),
      signer: owner,
      chain,
      summary: `Swap ${view.sellAmount} ${sell.symbol} for about ${view.buyAmount} ${buy.symbol} on ${network}`,
      networkFeeMax: fromBaseUnits(maxFeeWei(tx), 18),
      quote: view,
    });
  } catch (error: unknown) {
    return NextResponse.json({ error: firstLine(error, "The swap could not be prepared.") }, { status: 503 });
  }
}
