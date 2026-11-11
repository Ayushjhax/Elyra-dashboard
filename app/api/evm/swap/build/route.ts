import { NextResponse } from "next/server";
import { encodeFunctionData, erc20Abi, getAddress, type Address, type Hex } from "viem";
import { readEvmAsset, type EvmAsset } from "@/lib/evm/assets";
import { EVM_CHAINS, type EvmChainKey } from "@/lib/evm/chains";
import { evmClient } from "@/lib/evm/rpc";
import { badRequest, chainFrom, startEvmRoute } from "@/lib/evm/route";
import { EVM_SWAP_SLIPPAGE, routerAddress, swapTokenFor, type SwapToken } from "@/lib/evm/swap";
import { firstLine, maxFeeWei, prepareTx, sealTx } from "@/lib/evm/tx";
import { lifiQuote } from "@/lib/providers/lifi";
import { fromBaseUnits, toBaseUnits } from "@/lib/solana/amount";

/* ---------------------------------------------------------------------------
   Step one of a swap on an EVM network: quote it, and build the next
   transaction it needs.

   A listed token is named by symbol and resolved to its canonical contract
   (lib/evm/swap.ts), never taken as an address from the request — that is
   how a balance is kept out of a lookalike. Any other token may be named by
   its contract, on both sides: buying or selling it is the person's call,
   so it is read from the chain (decimals and symbol from the contract, by
   `readEvmAsset`), shown as unverified, and refused unless the request
   carries `acknowledgeUnverified` — the box the person ticks after checking
   the contract. A Robinhood Stock Token is refused by contract as by symbol.
   Either way the route's quote is held to the swap that was asked for,
   output paid to the session's own address, before anything is built.

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
  if (chain === null) return badRequest("Choose an EVM network.");
  const network = EVM_CHAINS[chain].name;

  const acknowledged = body.acknowledgeUnverified === true;

  try {
    const [sell, buy] = await Promise.all([
      swapSide(chain, owner, body.fromSymbol ?? body.fromToken),
      swapSide(chain, owner, body.toSymbol ?? body.toToken),
    ]);
    for (const side of [sell, buy]) {
      if (side.kind === "stock") {
        return badRequest(`${side.symbol} is a Robinhood Stock Token, and stock tokens are not swappable in Elyra.`);
      }
      if (side.kind === "unknown") {
        return badRequest(`Name a listed token on ${network}, or a token's contract address (0x followed by 40 hex characters).`);
      }
    }
    if (sell.kind !== "token" || buy.kind !== "token") return badRequest("That swap could not be read.");
    if (sell.token.address.toLowerCase() === buy.token.address.toLowerCase()) return badRequest("Choose two different tokens.");
    const unverified = [sell, buy].filter((side) => !side.verified);
    if (unverified.length > 0 && !acknowledged) {
      return badRequest(
        `${unverified.map((side) => side.token.symbol).join(" and ")} ${unverified.length === 1 ? "is" : "are"} not on Elyra's verified list. Check the contract, then confirm you have.`,
      );
    }

    const amount = toBaseUnits(typeof body.amount === "string" ? body.amount : "", sell.token.decimals);
    if (amount === null) return badRequest("That is not an amount I can swap.");
    const sellAmount = BigInt(amount);

    return await quoteAndBuild({ chain, owner, sell, buy, amount, sellAmount });
  } catch (error: unknown) {
    return NextResponse.json({ error: firstLine(error, "The swap could not be prepared.") }, { status: 503 });
  }
}

type Side =
  | { kind: "token"; token: SwapToken; verified: boolean; held: EvmAsset | null }
  | { kind: "stock"; symbol: string }
  | { kind: "unknown" };

/**
 * One side of a swap: a listed symbol, resolved to its canonical contract,
 * or a contract read from the chain. The owner's balance of it comes along,
 * which is what the sell side is held to.
 */
async function swapSide(chain: EvmChainKey, owner: Address, named: unknown): Promise<Side> {
  if (typeof named !== "string" || named.trim().length === 0) return { kind: "unknown" };
  const listed = swapTokenFor(chain, named);
  const asset = await readEvmAsset(chain, owner, listed === null ? named.trim() : listed.address);
  if (listed !== null) return { kind: "token", token: listed, verified: true, held: asset };
  if (asset === null || asset.address === "native") return { kind: "unknown" };
  if (asset.stockToken) return { kind: "stock", symbol: asset.symbol };
  return {
    kind: "token",
    token: { symbol: asset.symbol, name: asset.name, address: asset.address, decimals: asset.decimals },
    verified: asset.verified,
    held: asset,
  };
}

async function quoteAndBuild({
  chain,
  owner,
  sell: sellSide,
  buy: buySide,
  amount,
  sellAmount,
}: {
  chain: EvmChainKey;
  owner: Address;
  sell: Extract<Side, { kind: "token" }>;
  buy: Extract<Side, { kind: "token" }>;
  amount: string;
  sellAmount: bigint;
}): Promise<NextResponse> {
  const network = EVM_CHAINS[chain].name;
  const sell = sellSide.token;
  const buy = buySide.token;
  const client = evmClient(chain);
  const held = sellSide.held;
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
    sellVerified: sellSide.verified,
    buyVerified: buySide.verified,
    buyAddress: buy.address,
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
      `This swap needs up to ${fromBaseUnits(ethNeeded, 18)} ${EVM_CHAINS[chain].nativeSymbol} on ${network}, including the network fee; the wallet holds ${fromBaseUnits(ethBalance, 18)}.`,
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
}
