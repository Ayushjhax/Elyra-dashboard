import "server-only";

import { buildPulse } from "@/lib/market/pulse";
import { hyperliquidMarkets } from "@/lib/providers/hyperliquid-public";
import { signalsFor } from "@/lib/research/signals";
import { kaminoYield } from "@/lib/research/yield";
import type { BriefingExtras, BriefingMover, BriefingSignal, BriefingYield } from "@/lib/briefing/types";

/* ---------------------------------------------------------------------------
   "And more", computed at publication and kept with the day's briefing — so
   the archive shows that morning's numbers, not today's:

   - trending token moves: Hyperliquid's biggest 24-hour risers and fallers
     among markets with over $1M of volume (lib/market/pulse.ts);
   - on-chain opportunities: the highest-yielding Kamino stablecoin vaults
     with at least $1M deposited — the rate as Kamino reports it, a rate and
     not a promise;
   - market signals: Elyra's own readings on BTC, ETH and SOL
     (lib/research/signals.ts), only those that crossed a threshold.

   No model touches these. Each part fails on its own, to an empty list.
--------------------------------------------------------------------------- */

const MOVERS = 3;
const YIELDS = 3;
const SIGNALS = 4;
const MIN_TVL_USD = 1_000_000;
const SIGNAL_ASSETS = ["BTC", "ETH", "SOL"] as const;

export async function briefingExtras(): Promise<{ extras: BriefingExtras; notes: string[] }> {
  const notes: string[] = [];
  const extras: BriefingExtras = { gainers: [], losers: [], yields: [], signals: [] };

  const [markets, vaults, ...readings] = await Promise.all([
    hyperliquidMarkets().catch(() => null),
    kaminoYield({ stablesOnly: true, limit: 25 }).catch(() => null),
    ...SIGNAL_ASSETS.map((asset) => signalsFor(asset).catch(() => null)),
  ]);

  if (markets?.ok && markets.data !== undefined) {
    const pulse = buildPulse(markets.data, MOVERS);
    const mover = (row: (typeof pulse.gainers)[number]): BriefingMover => ({
      symbol: row.symbol,
      changePct: Number((row.change24hPct ?? 0).toFixed(2)),
      priceUsd: row.markPrice,
    });
    extras.gainers = pulse.gainers.map(mover);
    extras.losers = pulse.losers.map(mover);
  } else {
    notes.push("movers: Hyperliquid did not answer");
  }

  if (vaults?.ok && vaults.data !== undefined) {
    extras.yields = vaults.data
      .filter((vault) => vault.apyPct !== null && (vault.tvlUsd ?? 0) >= MIN_TVL_USD)
      .sort((a, b) => (b.apyPct as number) - (a.apyPct as number))
      .slice(0, YIELDS)
      .map((vault): BriefingYield => ({
        name: vault.name,
        asset: vault.asset,
        apyPct: Number((vault.apyPct as number).toFixed(2)),
        tvlUsd: vault.tvlUsd,
      }));
  } else {
    notes.push("yields: Kamino did not answer");
  }

  for (const reading of readings) {
    if (reading === null || !reading.ok || reading.data === undefined) continue;
    for (const signal of reading.data) {
      if (extras.signals.length >= SIGNALS) break;
      extras.signals.push({
        symbol: signal.symbol,
        direction: signal.direction,
        title: signal.title,
        strength: signal.strength,
      } satisfies BriefingSignal);
    }
  }

  return { extras, notes };
}
