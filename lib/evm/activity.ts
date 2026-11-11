import "server-only";

import { optional } from "@/lib/env";
import { EVM_CHAINS, type EvmChainKey } from "@/lib/evm/chains";
import { unitsToNumber } from "@/lib/evm/derive";
import { evmActivity, type EvmMovement, type EvmTxHead } from "@/lib/evm/history";
import { RPC_ENV } from "@/lib/evm/rpc";
import { robinhoodStockTokens } from "@/lib/evm/stockTokens";
import { EVM_TOKENS } from "@/lib/evm/tokens";
import { cached } from "@/lib/market/cache";
import type { WalletActivity } from "@/lib/wallet/types";

/* ---------------------------------------------------------------------------
   Recent transactions for the session's EVM wallet, on one chain.

   A node cannot answer "what has this address done" — that takes an indexer.
   Two are used, in order:

     1. Alchemy's transfers API (`alchemy_getAssetTransfers`), when the
        chain's RPC URL is an Alchemy endpoint that serves it. Native,
        internal (Ethereum) and ERC-20 movements, in one place.
     2. Blockscout's public API, on Ethereum only. Robinhood Chain's
        Blockscout refuses server requests (it sits behind a browser
        challenge), and its public RPC caps log queries at a few hours of
        blocks — so without an Alchemy endpoint, Robinhood Chain history is
        reported as unavailable, with the setting that fixes it, rather than
        shown as an empty list that reads like "no transactions".

   Read-only, cached for thirty seconds — the activity poll is a minute.
--------------------------------------------------------------------------- */

const TTL_SECONDS = 30;
const TIMEOUT_MS = 15_000;

export interface EvmActivityRead {
  items: WalletActivity[];
  /** Why this chain's history is missing or partial. Null when it was read. */
  note: string | null;
}

type Raw = Record<string, unknown>;

function obj(value: unknown): Raw | null {
  return value !== null && typeof value === "object" && !Array.isArray(value) ? (value as Raw) : null;
}

function text(value: unknown): string | null {
  return typeof value === "string" && value.length > 0 ? value : null;
}

/** Contracts Elyra trusts on a chain, by lower-cased address, with their symbols. */
async function trusted(chain: EvmChainKey): Promise<Map<string, string>> {
  const map = new Map<string, string>();
  for (const token of EVM_TOKENS[chain]) map.set(token.address.toLowerCase(), token.symbol);
  if (chain === "robinhood") {
    for (const stock of await robinhoodStockTokens().catch(() => [])) map.set(stock.address.toLowerCase(), stock.symbol);
  }
  return map;
}

function decimalAmount(raw: unknown, decimals: number): number | null {
  if (typeof raw !== "string" || raw.length === 0) return null;
  try {
    const value = BigInt(raw);
    return unitsToNumber(value < BigInt(0) ? -value : value, decimals);
  } catch {
    return null;
  }
}

/* ---------------------------------------------------------------------------
   Alchemy
--------------------------------------------------------------------------- */

class Unsupported extends Error {}

async function alchemyRead(chain: EvmChainKey, owner: string, limit: number): Promise<{ heads: EvmTxHead[]; movements: EvmMovement[] }> {
  const url = optional(RPC_ENV[chain]);
  if (url === undefined) throw new Unsupported();
  const me = owner.toLowerCase();
  const tokens = await trusted(chain);
  const categories = chain === "ethereum" ? ["external", "internal", "erc20"] : ["external", "erc20"];

  const query = async (side: "fromAddress" | "toAddress") => {
    const response = await fetch(url, {
      method: "POST",
      headers: { "content-type": "application/json" },
      signal: AbortSignal.timeout(TIMEOUT_MS),
      cache: "no-store",
      body: JSON.stringify({
        jsonrpc: "2.0",
        id: 1,
        method: "alchemy_getAssetTransfers",
        params: [
          {
            fromBlock: "0x0",
            toBlock: "latest",
            [side]: owner,
            category: categories,
            withMetadata: true,
            excludeZeroValue: true,
            maxCount: `0x${Math.min(limit * 2, 100).toString(16)}`,
            order: "desc",
          },
        ],
      }),
    });
    const body = obj(await response.json().catch(() => null));
    const error = obj(body?.error);
    if (error !== null) {
      if (error.code === -32601 || /does not exist|not available|unsupported/i.test(String(error.message))) throw new Unsupported();
      throw new Error(String(error.message ?? "the indexer refused the query"));
    }
    const transfers = obj(body?.result)?.transfers;
    return Array.isArray(transfers) ? transfers : [];
  };

  const [sent, received] = await Promise.all([query("fromAddress"), query("toAddress")]);
  const heads: EvmTxHead[] = [];
  const movements: EvmMovement[] = [];

  for (const entry of [...sent, ...received]) {
    const row = obj(entry);
    const hash = text(row?.hash);
    const from = text(row?.from);
    if (row === null || hash === null || from === null) continue;
    const to = text(row.to);
    const contract = obj(row.rawContract);
    const category = text(row.category);
    const native = category === "external" || category === "internal";
    const address = native ? null : text(contract?.address);
    const decimals = native ? 18 : Number.parseInt(String(contract?.decimal ?? "0x12"), 16);
    const amount = decimalAmount(contract?.value as string, Number.isFinite(decimals) ? decimals : 18);
    const at = text(obj(row.metadata)?.blockTimestamp);
    const block = Number.parseInt(String(row.blockNum ?? "0x0"), 16);

    heads.push({ hash, at, block: Number.isFinite(block) ? block : 0, status: "confirmed", from, to, method: null });
    if (amount === null || amount === 0) continue;
    const incoming = to?.toLowerCase() === me;
    const outgoing = from.toLowerCase() === me;
    if (incoming === outgoing) continue;
    movements.push({
      hash,
      contract: address,
      symbol: address === null ? "ETH" : (tokens.get(address.toLowerCase()) ?? null),
      icon: null,
      amount: incoming ? amount : -amount,
      counterparty: incoming ? from : to,
    });
  }

  return { heads, movements };
}

/* ---------------------------------------------------------------------------
   Blockscout (Ethereum)
--------------------------------------------------------------------------- */

const BLOCKSCOUT: Partial<Record<EvmChainKey, string>> = {
  ethereum: "https://eth.blockscout.com/api/v2",
};

async function blockscoutRead(
  chain: EvmChainKey,
  owner: string,
): Promise<{ heads: EvmTxHead[]; movements: EvmMovement[]; partial: string | null }> {
  const base = BLOCKSCOUT[chain];
  if (base === undefined) throw new Unsupported();
  const me = owner.toLowerCase();
  const tokens = await trusted(chain);

  const get = async (path: string) => {
    const response = await fetch(`${base}${path}`, {
      headers: { accept: "application/json" },
      signal: AbortSignal.timeout(TIMEOUT_MS),
      cache: "no-store",
    });
    if (!response.ok) throw new Error(`the explorer returned ${response.status}`);
    const items = obj(await response.json().catch(() => null))?.items;
    return Array.isArray(items) ? items : [];
  };

  /* Either half is worth showing without the other: a busy wallet's token
     transfers can be slow to come back while its transactions are not. */
  const [txRead, transferRead] = await Promise.allSettled([
    get(`/addresses/${owner}/transactions`),
    get(`/addresses/${owner}/token-transfers?type=ERC-20`),
  ]);
  if (txRead.status === "rejected" && transferRead.status === "rejected") {
    throw txRead.reason instanceof Error ? txRead.reason : new Error("the explorer did not answer");
  }
  const txs = txRead.status === "fulfilled" ? txRead.value : [];
  const transfers = transferRead.status === "fulfilled" ? transferRead.value : [];
  const partial =
    txRead.status === "rejected"
      ? "Ethereum history shows token transfers only; the transaction list did not load in time."
      : transferRead.status === "rejected"
        ? "Ethereum history shows transactions only; token transfers did not load in time."
        : null;

  const heads: EvmTxHead[] = [];
  const movements: EvmMovement[] = [];

  for (const entry of txs) {
    const row = obj(entry);
    const hash = text(row?.hash);
    const from = text(obj(row?.from)?.hash);
    if (row === null || hash === null || from === null) continue;
    const to = text(obj(row.to)?.hash);
    const ok = row.status === "ok";
    heads.push({
      hash,
      at: text(row.timestamp),
      block: typeof row.block_number === "number" ? row.block_number : 0,
      status: ok ? "confirmed" : "failed",
      from,
      to,
      method: text(row.method),
    });
    const value = decimalAmount(row.value as string, 18);
    if (!ok || value === null || value === 0) continue;
    const incoming = to?.toLowerCase() === me;
    const outgoing = from.toLowerCase() === me;
    if (incoming === outgoing) continue;
    movements.push({ hash, contract: null, symbol: "ETH", icon: null, amount: incoming ? value : -value, counterparty: incoming ? from : to });
  }

  for (const entry of transfers) {
    const row = obj(entry);
    const hash = text(row?.transaction_hash);
    const token = obj(row?.token);
    const total = obj(row?.total);
    const from = text(obj(row?.from)?.hash);
    const to = text(obj(row?.to)?.hash);
    const address = text(token?.address_hash);
    if (row === null || hash === null || from === null || address === null) continue;
    const decimals = Number.parseInt(String(total?.decimals ?? token?.decimals ?? "18"), 10);
    const amount = decimalAmount(total?.value as string, Number.isFinite(decimals) ? decimals : 18);
    heads.push({
      hash,
      at: text(row.timestamp),
      block: typeof row.block_number === "number" ? row.block_number : 0,
      status: "confirmed",
      from,
      to: null,
      method: text(row.method),
    });
    if (amount === null || amount === 0) continue;
    const incoming = to?.toLowerCase() === me;
    const outgoing = from.toLowerCase() === me;
    if (incoming === outgoing) continue;
    const symbol = tokens.get(address.toLowerCase()) ?? null;
    movements.push({
      hash,
      contract: address,
      symbol,
      /* Only a trusted token's artwork: a lookalike must not wear USDC's. */
      icon: symbol === null ? null : text(token?.icon_url),
      amount: incoming ? amount : -amount,
      counterparty: incoming ? from : to,
    });
  }

  return { heads, movements, partial };
}

/* ---------------------------------------------------------------------------
   The read
--------------------------------------------------------------------------- */

export async function readEvmActivity(chain: EvmChainKey, owner: string, limit: number): Promise<EvmActivityRead> {
  const network = EVM_CHAINS[chain].name;
  const read = async (): Promise<EvmActivityRead> => {
    let source: { heads: EvmTxHead[]; movements: EvmMovement[]; partial?: string | null } | null = null;
    try {
      source = await alchemyRead(chain, owner, limit);
    } catch (error: unknown) {
      if (!(error instanceof Unsupported)) {
        return { items: [], note: `${network} history could not be read: ${error instanceof Error ? error.message : "indexer error"}.` };
      }
    }
    if (source === null) {
      try {
        source = await blockscoutRead(chain, owner);
      } catch (error: unknown) {
        if (error instanceof Unsupported) {
          return {
            items: [],
            note: `${network} history needs an indexer: set ${RPC_ENV[chain]} to an Alchemy endpoint. Balances are unaffected.`,
          };
        }
        return { items: [], note: `${network} history could not be read: ${error instanceof Error ? error.message : "explorer error"}.` };
      }
    }
    /* The wallet's own sends first among duplicates, so a head's `from` is
       the sender of the transaction rather than of one transfer inside it. */
    const me = owner.toLowerCase();
    const heads = [...source.heads].sort((a, b) => Number(b.from.toLowerCase() === me) - Number(a.from.toLowerCase() === me));
    return { items: evmActivity(chain, owner, heads, source.movements, limit), note: source.partial ?? null };
  };

  const result = await cached(`evm:activity:v1:${chain}:${owner.toLowerCase()}:${limit}`, TTL_SECONDS, read);
  return result.value;
}
