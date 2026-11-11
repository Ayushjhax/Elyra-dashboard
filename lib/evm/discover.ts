import "server-only";

import { erc20Abi, getAddress, type Address } from "viem";
import { optional } from "@/lib/env";
import type { EvmChainKey } from "@/lib/evm/chains";
import { evmClient, RPC_ENV } from "@/lib/evm/rpc";

/* ---------------------------------------------------------------------------
   Tokens the wallet holds that are on no list Elyra trusts.

   The balance read (lib/evm/wallet.ts) reads only listed contracts, which is
   what makes every counted holding verified by construction. That leaves
   anything else invisible — and a token someone actually bought that does
   not appear at all reads as "it's gone". This finds them, so they can be
   SHOWN the way the Solana side shows a mint Jupiter does not recognise:
   marked unverified, never priced, never counted.

   Discovery needs an indexer:

     - an Alchemy endpoint (`alchemy_getTokenBalances`) on either chain, when
       the chain's RPC URL is one;
     - otherwise Blockscout on Ethereum, keeping only tokens it reports a
       market rate for. Ethereum wallets collect airdropped spam by the
       hundred; a token no market trades is almost always that, and listing
       it would bury the real holdings under it.

   Best effort and bounded — a slow indexer (a wallet with thousands of
   tokens) is skipped rather than allowed to hold the balance read up.
--------------------------------------------------------------------------- */

const TIMEOUT_MS = 8_000;
const MAX_FOUND = 10;

export interface FoundToken {
  address: Address;
  /** The symbol the contract claims. Shown as unverified, never trusted. */
  symbol: string;
  name: string;
  decimals: number;
  raw: bigint;
}

type Raw = Record<string, unknown>;

async function viaAlchemy(chain: EvmChainKey, owner: Address, known: Set<string>): Promise<FoundToken[] | null> {
  const url = optional(RPC_ENV[chain]);
  if (url === undefined) return null;
  const response = await fetch(url, {
    method: "POST",
    headers: { "content-type": "application/json" },
    signal: AbortSignal.timeout(TIMEOUT_MS),
    cache: "no-store",
    body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "alchemy_getTokenBalances", params: [owner, "erc20"] }),
  });
  const body = (await response.json().catch(() => null)) as Raw | null;
  if (body === null || body.error !== undefined) return null;
  const balances = (body.result as Raw | undefined)?.tokenBalances;
  if (!Array.isArray(balances)) return null;

  const candidates: Array<{ address: Address; raw: bigint }> = [];
  for (const entry of balances as Raw[]) {
    const address = typeof entry.contractAddress === "string" ? entry.contractAddress : "";
    if (!/^0x[0-9a-fA-F]{40}$/.test(address) || known.has(address.toLowerCase())) continue;
    let raw: bigint;
    try {
      raw = BigInt(String(entry.tokenBalance ?? "0x0"));
    } catch {
      continue;
    }
    if (raw > BigInt(0)) candidates.push({ address: getAddress(address), raw });
  }
  const picked = candidates.slice(0, MAX_FOUND);
  if (picked.length === 0) return [];

  const meta = await evmClient(chain).multicall({
    allowFailure: true,
    contracts: picked.flatMap((entry) => [
      { address: entry.address, abi: erc20Abi, functionName: "symbol" as const },
      { address: entry.address, abi: erc20Abi, functionName: "decimals" as const },
      { address: entry.address, abi: erc20Abi, functionName: "name" as const },
    ]),
  });
  const found: FoundToken[] = [];
  picked.forEach((entry, index) => {
    const symbol = meta[index * 3];
    const decimals = meta[index * 3 + 1];
    const name = meta[index * 3 + 2];
    if (decimals?.status !== "success") return;
    const places = Number(decimals.result);
    if (!Number.isInteger(places) || places < 0 || places > 36) return;
    const claimed = symbol?.status === "success" && typeof symbol.result === "string" ? symbol.result.trim().slice(0, 16) : "";
    found.push({
      address: entry.address,
      symbol: claimed.length > 0 ? claimed : `${entry.address.slice(0, 6)}…`,
      name: name?.status === "success" && typeof name.result === "string" ? name.result.trim().slice(0, 64) : entry.address,
      decimals: places,
      raw: entry.raw,
    });
  });
  return found;
}

async function viaBlockscout(owner: Address, known: Set<string>): Promise<FoundToken[]> {
  const response = await fetch(`https://eth.blockscout.com/api/v2/addresses/${owner}/token-balances`, {
    headers: { accept: "application/json" },
    signal: AbortSignal.timeout(TIMEOUT_MS),
    cache: "no-store",
  });
  if (!response.ok) return [];
  const rows = (await response.json().catch(() => null)) as unknown;
  if (!Array.isArray(rows)) return [];

  const found: Array<FoundToken & { rank: number }> = [];
  for (const row of rows as Raw[]) {
    const token = row.token as Raw | undefined;
    const address = typeof token?.address_hash === "string" ? token.address_hash : "";
    if (token?.type !== "ERC-20" || !/^0x[0-9a-fA-F]{40}$/.test(address) || known.has(address.toLowerCase())) continue;
    /* A market rate is the line between a token and an airdrop. */
    const rate = Number(token.exchange_rate);
    if (!Number.isFinite(rate) || rate <= 0) continue;
    const places = Number.parseInt(String(token.decimals ?? ""), 10);
    if (!Number.isInteger(places) || places < 0 || places > 36) continue;
    let raw: bigint;
    try {
      raw = BigInt(String(row.value ?? "0"));
    } catch {
      continue;
    }
    if (raw <= BigInt(0)) continue;
    const symbol = typeof token.symbol === "string" ? token.symbol.trim().slice(0, 16) : "";
    found.push({
      address: getAddress(address),
      symbol: symbol.length > 0 ? symbol : `${address.slice(0, 6)}…`,
      name: typeof token.name === "string" && token.name.trim().length > 0 ? token.name.trim().slice(0, 64) : address,
      decimals: places,
      raw,
      /* Ranking only — Blockscout's rate never becomes a price here. */
      rank: (Number(raw) / 10 ** places) * rate,
    });
  }
  return found
    .sort((a, b) => b.rank - a.rank)
    .slice(0, MAX_FOUND)
    .map((token) => ({ address: token.address, symbol: token.symbol, name: token.name, decimals: token.decimals, raw: token.raw }));
}

/** Unlisted ERC-20s held by `owner` on `chain`. Empty when nothing can look. */
export async function discoverUnlisted(chain: EvmChainKey, owner: string, known: Set<string>): Promise<FoundToken[]> {
  const account = getAddress(owner);
  try {
    const alchemy = await viaAlchemy(chain, account, known);
    if (alchemy !== null) return alchemy;
    return chain === "ethereum" ? await viaBlockscout(account, known) : [];
  } catch {
    return [];
  }
}
