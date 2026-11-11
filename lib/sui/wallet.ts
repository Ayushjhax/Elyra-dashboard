import "server-only";

import { assetsBySymbols, pythConfigured } from "@/lib/market/pyth/catalog";
import { pricesForIds } from "@/lib/market/pyth/client";
import type { PythAsset } from "@/lib/market/pyth/types";
import type { SourceNote, SpotHolding, WalletScope } from "@/lib/portfolio/types";
import { normalizeCoinType, SUI_NAME, suiScopeId } from "@/lib/sui/chain";
import { suiClient } from "@/lib/sui/client";
import { suiWalletRows, type SuiBalanceRead } from "@/lib/sui/derive";
import { suiTokenByType } from "@/lib/sui/tokens";

/* ---------------------------------------------------------------------------
   The account's Sui wallet, read for the portfolio.

   The same contract as the Solana and EVM reads: holdings, the scope they
   belong to, and a note for anything that could not be read, so a total
   assembled without Sui says it is partial instead of passing for the whole.

   Sui's own index answers "every coin this address holds" in one paged
   query, so unlisted coins are found here without a separate indexer —
   shown with the symbol their metadata claims, flagged unverified, never
   priced or counted (lib/sui/tokens.ts). Listed coins are priced through
   Pyth, like everything else.
--------------------------------------------------------------------------- */

const MAX_PAGES = 3;
const MAX_UNLISTED = 10;

export interface SuiWalletRead {
  holdings: SpotHolding[];
  scope: WalletScope | null;
  notes: SourceNote[];
}

function message(error: unknown, fallback: string): string {
  return error instanceof Error && error.message.length > 0 ? error.message.split("\n")[0].slice(0, 200) : fallback;
}

export async function readSuiWallet(address: string): Promise<SuiWalletRead> {
  const owner = address.toLowerCase();
  const scopeId = suiScopeId(owner);
  const notes: SourceNote[] = [];
  const client = suiClient();

  const balances: { coinType: string; raw: bigint }[] = [];
  try {
    let cursor: string | null = null;
    for (let page = 0; page < MAX_PAGES; page += 1) {
      const result: { balances: { coinType: string; balance: string }[]; hasNextPage: boolean; cursor: string | null } =
        await client.listBalances({ owner, cursor } as never);
      for (const entry of result.balances) {
        const raw = BigInt(entry.balance);
        if (raw > BigInt(0)) balances.push({ coinType: normalizeCoinType(entry.coinType), raw });
      }
      if (!result.hasNextPage || result.cursor === null) break;
      cursor = result.cursor;
    }
  } catch (error: unknown) {
    return { holdings: [], scope: null, notes: [{ scope: "sui", reason: `Sui could not be read: ${message(error, "the node did not answer")}.`, kind: "failed" }] };
  }

  /* Unlisted coins: what their metadata claims, for display only. */
  const unlisted = balances.filter((entry) => suiTokenByType(entry.coinType) === null).slice(0, MAX_UNLISTED);
  const claimed = new Map<string, { symbol: string; name: string; decimals: number }>();
  await Promise.all(
    unlisted.map(async (entry) => {
      const meta = (await client.getCoinMetadata({ coinType: entry.coinType } as never).catch(() => null)) as {
        coinMetadata?: { symbol?: string; name?: string; decimals?: number } | null;
      } | null;
      const info = meta?.coinMetadata;
      if (info === undefined || info === null || typeof info.decimals !== "number") return;
      claimed.set(entry.coinType, {
        symbol: (info.symbol ?? "").slice(0, 16) || entry.coinType.split("::").pop() || "?",
        name: (info.name ?? "").slice(0, 64) || entry.coinType,
        decimals: info.decimals,
      });
    }),
  );

  /* Prices for listed coins, from Pyth's crypto feeds only. */
  const listed = balances.map((entry) => suiTokenByType(entry.coinType)).filter((token) => token !== null);
  const assetBySymbol = new Map<string, PythAsset>();
  const priceById = new Map<number, number>();
  if (!pythConfigured()) {
    notes.push({ scope: "pyth", reason: "PYTH_API_KEY is not set, so Sui balances are listed unpriced.", kind: "failed" });
  } else if (listed.length > 0) {
    try {
      const assets = await assetsBySymbols([...new Set(listed.map((token) => token.priceSymbol))]);
      for (const asset of assets) if (asset.assetType === "crypto") assetBySymbol.set(asset.symbol.toUpperCase(), asset);
      for (const row of await pricesForIds([...assetBySymbol.values()].map((asset) => asset.id))) {
        if (Number.isFinite(row.price) && row.price > 0) priceById.set(row.id, row.price);
      }
    } catch (error: unknown) {
      notes.push({ scope: "pyth", reason: `Prices for Sui could not be read (${message(error, "Pyth unavailable")}).`, kind: "failed" });
    }
  }

  const reads: SuiBalanceRead[] = [];
  for (const entry of balances) {
    const token = suiTokenByType(entry.coinType);
    if (token !== null) {
      const asset = assetBySymbol.get(token.priceSymbol.toUpperCase());
      reads.push({
        coinType: entry.coinType,
        raw: entry.raw,
        decimals: token.decimals,
        symbol: token.symbol,
        name: token.name,
        logo: asset?.logo ?? null,
        priceUsd: asset === undefined ? null : (priceById.get(asset.id) ?? null),
        verified: true,
        stable: token.stable,
      });
      continue;
    }
    const info = claimed.get(entry.coinType);
    if (info === undefined) continue;
    reads.push({
      coinType: entry.coinType,
      raw: entry.raw,
      decimals: info.decimals,
      symbol: info.symbol,
      name: info.name,
      logo: null,
      priceUsd: null,
      verified: false,
      stable: false,
    });
  }

  const rows = suiWalletRows({ scopeId, balances: reads });
  return {
    holdings: rows.holdings,
    scope: {
      id: scopeId,
      label: `${SUI_NAME} wallet`,
      address: owner,
      chain: SUI_NAME,
      venue: "wallet",
      valueUsd: rows.valueUsd,
      availableUsd: rows.valueUsd,
      unrealizedPnlUsd: null,
    },
    notes,
  };
}
