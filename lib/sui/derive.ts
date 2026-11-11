import { unitsToNumber } from "@/lib/evm/derive";
import { summariseEvmTx, type EvmMovement, type EvmTxHead } from "@/lib/evm/history";
import { normalizeCoinType, SUI_COIN_TYPE, SUI_NAME, suiTxUrl } from "@/lib/sui/chain";
import type { SpotHolding } from "@/lib/portfolio/types";
import type { WalletActivity } from "@/lib/wallet/types";

/* ---------------------------------------------------------------------------
   The Sui wallet, as portfolio rows and feed rows — pure, so the rules are
   tested rather than trusted. The server reads balances, prices and history
   (lib/sui/wallet.ts, lib/sui/activity.ts) and hands them here.

   The portfolio's rules, carried over: a figure nobody could know is null,
   never zero; a coin on no trusted list is shown, flagged and never counted;
   dust below a cent is dropped once priced.
--------------------------------------------------------------------------- */

const DUST_USD = 0.01;

export interface SuiBalanceRead {
  coinType: string;
  raw: bigint;
  decimals: number;
  symbol: string;
  name: string;
  logo: string | null;
  /** Null when nothing prices it, or it is unverified. */
  priceUsd: number | null;
  verified: boolean;
  stable: boolean;
}

export interface SuiWalletRows {
  holdings: SpotHolding[];
  valueUsd: number;
  stableUsd: number;
}

export function suiWalletRows(input: { scopeId: string; balances: SuiBalanceRead[] }): SuiWalletRows {
  const holdings: SpotHolding[] = [];
  let valueUsd = 0;
  let stableUsd = 0;

  /* SUI first, then by value. */
  const ordered = [...input.balances].sort((a, b) =>
    normalizeCoinType(a.coinType) === SUI_COIN_TYPE ? -1 : normalizeCoinType(b.coinType) === SUI_COIN_TYPE ? 1 : 0,
  );

  for (const coin of ordered) {
    const quantity = unitsToNumber(coin.raw, coin.decimals);
    if (quantity <= 0) continue;
    const price = coin.verified ? coin.priceUsd : null;
    const value = price === null ? null : quantity * price;
    if (value !== null && value < DUST_USD) continue;
    const native = normalizeCoinType(coin.coinType) === SUI_COIN_TYPE;
    holdings.push({
      id: `${input.scopeId}:${normalizeCoinType(coin.coinType)}`,
      venue: "wallet",
      chain: SUI_NAME,
      scopeId: input.scopeId,
      /* The coin's Move type, the way an EVM holding carries its contract. */
      address: native ? null : normalizeCoinType(coin.coinType),
      symbol: coin.symbol,
      name: coin.name,
      logo: coin.verified ? coin.logo : null,
      quantity,
      decimals: coin.decimals,
      priceUsd: price,
      valueUsd: value,
      change24hPct: null,
      allocationPct: null,
      avgCostUsd: null,
      pnlUsd: null,
      pnlPct: null,
      verified: coin.verified,
      liquid: coin.verified && coin.stable,
      ...(coin.verified ? {} : { marketSymbol: null }),
    });
    if (value !== null) {
      valueUsd += value;
      if (coin.stable) stableUsd += value;
    }
  }

  return { holdings, valueUsd, stableUsd };
}

/* ---------------------------------------------------------------------------
   History
--------------------------------------------------------------------------- */

export interface SuiTxNode {
  digest: string;
  sender: string | null;
  /** ISO. */
  timestamp: string | null;
  success: boolean;
  /** Every balance change in the transaction, any owner. */
  changes: { owner: string | null; coinType: string; amount: string }[];
}

/** Below this much SUI, a change beside another coin's movement is the gas fee, not a transfer. */
const GAS_SIZED_SUI = 0.01;

export function suiActivityRows(
  owner: string,
  nodes: SuiTxNode[],
  coin: (coinType: string) => { symbol: string | null; decimals: number },
  limit: number,
): WalletActivity[] {
  const me = owner.toLowerCase();
  const rows: WalletActivity[] = [];
  const seen = new Set<string>();

  for (const node of nodes) {
    if (seen.has(node.digest)) continue;
    seen.add(node.digest);

    const mine = node.changes.filter((change) => change.owner?.toLowerCase() === me);
    let movements: EvmMovement[] = mine.map((change) => {
      const type = normalizeCoinType(change.coinType);
      const info = coin(type);
      const raw = BigInt(change.amount);
      const magnitude = unitsToNumber(raw < BigInt(0) ? -raw : raw, info.decimals);
      return {
        hash: node.digest,
        contract: type === SUI_COIN_TYPE ? null : type,
        symbol: type === SUI_COIN_TYPE ? "SUI" : info.symbol,
        icon: null,
        amount: raw < BigInt(0) ? -magnitude : magnitude,
        counterparty: null,
      };
    });
    /* Sending a token costs a little SUI in gas; that is not a SUI transfer. */
    if (movements.some((move) => move.contract !== null)) {
      movements = movements.filter((move) => move.contract !== null || Math.abs(move.amount) >= GAS_SIZED_SUI);
    }

    const head: EvmTxHead = {
      hash: node.digest,
      at: node.timestamp,
      block: 0,
      status: node.success ? "confirmed" : "failed",
      from: node.sender ?? "",
      to: null,
      method: null,
    };
    rows.push({
      signature: node.digest,
      status: head.status,
      slot: 0,
      at: node.timestamp,
      memo: null,
      summary: summariseEvmTx(owner, head, movements),
      network: "sui",
      href: suiTxUrl(node.digest),
    });
  }

  return rows.sort((a, b) => (Date.parse(b.at ?? "") || 0) - (Date.parse(a.at ?? "") || 0)).slice(0, limit);
}

/* ---------------------------------------------------------------------------
   A swap, held to what was asked of it
--------------------------------------------------------------------------- */

/**
 * The simulated balance changes of a routed Sui swap, checked before anyone
 * signs it: the owner receives at least the quoted minimum of the coin bought,
 * and pays no more than the amount sold — plus the gas budget, when SUI is
 * what is sold.
 *
 * A router that returned a transaction paying someone else, or taking more
 * than was asked, fails here, at simulation, with nothing signed.
 */
export function checkSuiSwap(input: {
  owner: string;
  changes: { owner: string | null; coinType: string; amount: string }[];
  fromType: string;
  fromAmount: bigint;
  toType: string;
  toAmountMin: bigint;
  gasBudget: bigint;
}): { ok: true } | { ok: false; error: string } {
  const me = input.owner.toLowerCase();
  const net = (type: string) =>
    input.changes
      .filter((change) => change.owner?.toLowerCase() === me && normalizeCoinType(change.coinType) === normalizeCoinType(type))
      .reduce((sum, change) => sum + BigInt(change.amount), BigInt(0));

  const received = net(input.toType);
  if (received < input.toAmountMin) {
    return { ok: false, error: "The routed swap would deliver less than its own quoted minimum, so it was not used." };
  }
  const paid = -net(input.fromType);
  const ceiling = input.fromAmount + (normalizeCoinType(input.fromType) === SUI_COIN_TYPE ? input.gasBudget : BigInt(0));
  if (paid > ceiling) {
    return { ok: false, error: "The routed swap would take more than the amount you asked to sell, so it was not used." };
  }
  return { ok: true };
}
