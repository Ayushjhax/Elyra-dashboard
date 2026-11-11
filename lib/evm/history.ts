import { evmTxUrl, type EvmChainKey } from "@/lib/evm/chains";
import { formatAmount, shortAddress, assetName, type TxAmount, type TxKind, type TxSummary } from "@/lib/wallet/summarise";
import type { WalletActivity } from "@/lib/wallet/types";

/* ---------------------------------------------------------------------------
   An EVM wallet's recent transactions, as the same rows the Solana feed
   produces.

   Pure. The server reads what moved from an indexer (lib/evm/activity.ts —
   Blockscout on Ethereum, or an Alchemy endpoint on either chain) and hands
   it here as two lists: the transactions, and the value that moved in each.
   This folds them into `WalletActivity` with a `TxSummary`, under the Solana
   feed's rules —

     - a token not on a list Elyra trusts is named by its contract, never by
       the symbol it claims (`symbol: null`), and an incoming transfer of
       only such tokens is flagged `unverifiedOnly` — on Ethereum that is
       almost always an airdrop to ignore;
     - what moved is said in words only when it is known. A transaction that
       spent tokens and whose return the indexer did not show is named by
       the method it called, not guessed at as a send.
--------------------------------------------------------------------------- */

/** One transaction, as the indexer reports it. */
export interface EvmTxHead {
  hash: string;
  /** ISO. */
  at: string | null;
  block: number;
  status: "confirmed" | "failed";
  from: string;
  to: string | null;
  /** The called method's name, when the indexer could decode it. */
  method: string | null;
}

/** Value that moved into or out of the wallet in one transaction. */
export interface EvmMovement {
  hash: string;
  /** Null for native ETH. */
  contract: string | null;
  /** Null when the token is not on a trusted list. */
  symbol: string | null;
  icon: string | null;
  /** Signed, human units: positive came in. */
  amount: number;
  /** The other side of this movement. */
  counterparty: string | null;
}

/** Below this, an ETH movement is gas-sized noise, not a transfer. */
const ETH_DUST = 1e-9;

function label(entry: TxAmount): string {
  return `${formatAmount(entry.amount)} ${assetName(entry)}`;
}

/** A decoded method name as a person would read it: "swapExactTokensForETH" → "Swap exact tokens for ETH". */
function methodWords(method: string | null): string | null {
  if (method === null || method.length === 0 || method.startsWith("0x")) return null;
  const words = method.replace(/([a-z0-9])([A-Z])/g, "$1 $2").replace(/_/g, " ").trim().toLowerCase();
  return words.charAt(0).toUpperCase() + words.slice(1);
}

export function summariseEvmTx(owner: string, head: EvmTxHead, movements: EvmMovement[]): TxSummary {
  const me = owner.toLowerCase();

  /* Net per asset: a transaction can move the same token in and out. */
  const byAsset = new Map<string, TxAmount & { counterparty: string | null }>();
  for (const move of movements) {
    if (move.contract === null && Math.abs(move.amount) < ETH_DUST) continue;
    const key = move.contract?.toLowerCase() ?? "eth";
    const existing = byAsset.get(key);
    if (existing !== undefined) existing.amount += move.amount;
    else {
      byAsset.set(key, {
        /* The gas coin carries its own symbol (ETH, or BNB on BNB Chain). */
        symbol: move.contract === null ? (move.symbol ?? "ETH") : move.symbol,
        mint: move.contract,
        amount: move.amount,
        icon: move.icon,
        counterparty: move.counterparty,
      });
    }
  }
  const amounts = [...byAsset.values()].filter((entry) => entry.amount !== 0);
  const ins = amounts.filter((entry) => entry.amount > 0).sort((a, b) => b.amount - a.amount);
  const outs = amounts.filter((entry) => entry.amount < 0).sort((a, b) => a.amount - b.amount);
  const more = (list: TxAmount[]) => (list.length > 1 ? ` +${list.length - 1} more` : "");
  const unverifiedOnly = ins.length > 0 && outs.length === 0 && ins.every((entry) => entry.symbol === null);

  const words = methodWords(head.method);
  const sentByMe = head.from.toLowerCase() === me;
  /* A plain transfer: ETH straight to someone, or a token's own transfer(). */
  const plain = head.method === null || head.method === "transfer" || head.method === "0xa9059cbb";

  let kind: TxKind;
  let title: string;
  let counterparty: string | null = null;

  if (ins.length > 0 && outs.length > 0) {
    kind = "swap";
    title = `Swapped ${label({ ...outs[0], amount: -outs[0].amount })}${more(outs)} for ${label(ins[0])}${more(ins)}`;
  } else if (ins.length > 0) {
    kind = "receive";
    counterparty = ins[0].counterparty;
    title = unverifiedOnly ? "Received an unverified token" : `Received ${label(ins[0])}${more(ins)}`;
  } else if (outs.length > 0 && (plain || !sentByMe)) {
    kind = "send";
    counterparty = outs[0].counterparty;
    title = `Sent ${label({ ...outs[0], amount: -outs[0].amount })}${more(outs)}${counterparty ? ` to ${shortAddress(counterparty)}` : ""}`;
  } else if (outs.length > 0) {
    /* Spent through a contract, and what came back (if anything) is not in
       what the indexer showed — named by the call, not called a send. */
    kind = "other";
    title = `${words ?? "Contract call"} · ${label({ ...outs[0], amount: -outs[0].amount })}${more(outs)}`;
  } else if (head.method === "approve" || head.method === "0x095ea7b3") {
    kind = "account";
    title = "Approved a token for spending";
  } else {
    kind = "other";
    title = words ?? (head.to === null ? "Contract created" : "Contract interaction");
  }

  return {
    kind,
    title,
    amounts: amounts.map((entry) => ({ symbol: entry.symbol, mint: entry.mint, amount: entry.amount, icon: entry.icon })),
    counterparty,
    via: words,
    /* The fee is paid in ETH, not SOL; the field is Solana's and stays empty. */
    feeSol: null,
    unverifiedOnly,
  };
}

/** Transactions and their movements as feed rows, newest first. */
export function evmActivity(
  chain: EvmChainKey,
  owner: string,
  heads: EvmTxHead[],
  movements: EvmMovement[],
  limit: number,
): WalletActivity[] {
  const byHash = new Map<string, EvmMovement[]>();
  for (const move of movements) {
    const key = move.hash.toLowerCase();
    const list = byHash.get(key);
    if (list !== undefined) list.push(move);
    else byHash.set(key, [move]);
  }

  const seen = new Set<string>();
  const rows: WalletActivity[] = [];
  for (const head of heads) {
    const key = head.hash.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    rows.push({
      signature: head.hash,
      status: head.status,
      slot: head.block,
      at: head.at,
      memo: null,
      summary: summariseEvmTx(owner, head, byHash.get(key) ?? []),
      network: chain,
      href: evmTxUrl(chain, head.hash),
    });
  }

  return rows
    .sort((a, b) => (b.slot - a.slot) || (Date.parse(b.at ?? "") || 0) - (Date.parse(a.at ?? "") || 0))
    .slice(0, limit);
}
