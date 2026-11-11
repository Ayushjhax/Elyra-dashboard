import { normalizeCoinType } from "@/lib/sui/chain";

/* ---------------------------------------------------------------------------
   A LI.FI quote for a swap on Sui, held to the swap that was asked for.

   Pure, shared with the app. LI.FI returns a Sui swap as base64 BCS
   `TransactionData` in `transactionRequest.data`; this checks the quote's own
   claims — same chain, same coins, same amount, the session's address as
   both sender and recipient — before the server decodes the bytes, checks
   their sender and simulates them (lib/sui/derive.ts `checkSuiSwap`).
--------------------------------------------------------------------------- */

/** LI.FI's id for Sui mainnet. */
export const LIFI_SUI_CHAIN_ID = 9270000000000000;

export interface LifiSuiQuote {
  /** Base64 BCS TransactionData. */
  bytes: string;
  toAmount: string;
  toAmountMin: string;
  tool: string;
  feeUsd: number | null;
}

type Raw = Record<string, unknown>;
const obj = (value: unknown): Raw | null => (value !== null && typeof value === "object" && !Array.isArray(value) ? (value as Raw) : null);
const sameType = (a: unknown, b: string) => typeof a === "string" && normalizeCoinType(a) === normalizeCoinType(b);
const sameAddress = (a: unknown, b: string) => typeof a === "string" && a.toLowerCase() === b.toLowerCase();

export function checkLifiSuiQuote(
  body: unknown,
  want: { fromType: string; toType: string; fromAmount: string; address: string },
): { ok: true; quote: LifiSuiQuote } | { ok: false; error: string } {
  const quote = obj(body);
  const action = obj(quote?.action);
  const estimate = obj(quote?.estimate);
  const request = obj(quote?.transactionRequest);
  if (quote === null || action === null || estimate === null || request === null) {
    return { ok: false, error: "The swap router returned a quote that could not be read." };
  }
  const refuse = (what: string) => ({ ok: false as const, error: `The swap router's quote did not match the swap you asked for (${what}), so it was not used.` });
  if (action.fromChainId !== LIFI_SUI_CHAIN_ID || action.toChainId !== LIFI_SUI_CHAIN_ID) return refuse("network");
  if (!sameType(obj(action.fromToken)?.address, want.fromType)) return refuse("coin sold");
  if (!sameType(obj(action.toToken)?.address, want.toType)) return refuse("coin bought");
  if (String(action.fromAmount) !== want.fromAmount) return refuse("amount");
  if (!sameAddress(action.fromAddress, want.address)) return refuse("sender");
  if (!sameAddress(action.toAddress, want.address)) return refuse("recipient");
  if (typeof request.data !== "string" || !/^[A-Za-z0-9+/]+={0,2}$/.test(request.data)) return refuse("transaction");
  const toAmount = String(estimate.toAmount ?? "");
  const toAmountMin = String(estimate.toAmountMin ?? "");
  if (!/^\d+$/.test(toAmount) || !/^\d+$/.test(toAmountMin) || BigInt(toAmountMin) > BigInt(toAmount) || BigInt(toAmount) <= BigInt(0)) {
    return refuse("amount bought");
  }
  let feeUsd: number | null = null;
  if (Array.isArray(estimate.feeCosts)) {
    for (const fee of estimate.feeCosts) {
      const amount = Number(obj(fee)?.amountUSD);
      if (Number.isFinite(amount) && obj(fee)?.included !== false) feeUsd = (feeUsd ?? 0) + amount;
    }
  }
  return { ok: true, quote: { bytes: request.data, toAmount, toAmountMin, tool: typeof quote.tool === "string" ? quote.tool : "router", feeUsd } };
}
