import "server-only";

import { EVM_CHAINS, isEvmAddress, type EvmChainKey } from "@/lib/evm/chains";
import { checkLifiQuote, type LifiQuote } from "@/lib/evm/swap";

/* ---------------------------------------------------------------------------
   LI.FI — swap routing on Ethereum and Robinhood Chain.

   LI.FI aggregates DEXs, RFQ makers and propAMMs behind one quote endpoint,
   and is one of the routes Robinhood's docs name for its chain. It quotes a
   swap and returns a ready transaction for the taker to sign. No API key is
   needed (requests are rate-limited without one), and it charges its own
   fixed fee, which the quote reports and the swap dialog states.

   Used for quoting only. The transaction it returns is re-estimated and
   re-fee'd by lib/evm/tx.ts — LI.FI's own gas figures are discarded — and
   is held by `checkLifiQuote` to the swap that was asked for before any of
   it reaches the person's wallet: same chain, same tokens, same amount, and
   the output paid to the session's own address.
--------------------------------------------------------------------------- */

const BASE_URL = "https://li.quest/v1";

export async function lifiQuote(input: {
  chain: EvmChainKey;
  fromToken: string;
  toToken: string;
  /** Base units of `fromToken`, as a decimal string. */
  fromAmount: string;
  /** The session's address: the taker and the recipient. */
  address: string;
  slippage: number;
}): Promise<{ ok: true; quote: LifiQuote } | { ok: false; error: string }> {
  if (!isEvmAddress(input.address)) return { ok: false, error: "No EVM wallet to quote for." };

  const params = new URLSearchParams({
    fromChain: String(EVM_CHAINS[input.chain].id),
    toChain: String(EVM_CHAINS[input.chain].id),
    fromToken: input.fromToken,
    toToken: input.toToken,
    fromAmount: input.fromAmount,
    fromAddress: input.address,
    toAddress: input.address,
    slippage: String(input.slippage),
    integrator: "elyra",
  });

  let response: Response;
  try {
    response = await fetch(`${BASE_URL}/quote?${params.toString()}`, {
      headers: { accept: "application/json" },
      signal: AbortSignal.timeout(15_000),
      cache: "no-store",
    });
  } catch {
    return { ok: false, error: "The swap router did not answer. Try again in a moment." };
  }

  const body: unknown = await response.json().catch(() => null);
  if (!response.ok) {
    const message =
      body !== null && typeof body === "object" && typeof (body as { message?: unknown }).message === "string"
        ? (body as { message: string }).message
        : `The swap router returned ${response.status}.`;
    return {
      ok: false,
      error: response.status === 404 || /no available quotes|no routes/i.test(message)
        ? "No route can make that swap right now. Try a different amount or pair."
        : response.status === 429
          ? "The swap router is rate-limiting requests. Try again in a minute."
          : message.slice(0, 240),
    };
  }

  return checkLifiQuote(body, {
    chainId: EVM_CHAINS[input.chain].id,
    fromToken: input.fromToken,
    toToken: input.toToken,
    fromAmount: input.fromAmount,
    address: input.address,
  });
}
