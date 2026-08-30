import type { Signal } from "@/lib/types";
import { ago } from "@/lib/format";

/**
 * Agent-generated. The voice rule applies hard here: these are observations
 * with a stated confidence, never predictions.
 */
export const SIGNALS: Signal[] = [
  {
    id: "sig-1",
    source: "momentum",
    createdAt: ago(4 * 60),
    symbol: "SOL",
    thesis: "SOL reclaimed the 4H range high on rising spot volume.",
    confidence: 0.72,
    setup:
      "Price closed three consecutive 4H candles above 181.40, which capped the range since Tuesday. Spot volume on the reclaim ran 1.7× the 20-period average while perp open interest stayed flat, so the move is being led by spot rather than leverage. Invalidation is a 4H close back under 178.05.",
  },
  {
    id: "sig-2",
    source: "funding",
    createdAt: ago(38 * 60),
    symbol: "HYPE",
    thesis: "Funding on HYPE perps has been negative for six straight hours.",
    confidence: 0.64,
    setup:
      "Funding sits at -0.0142% per 8h and has not printed positive since 08:20 UTC. Open interest rose 8.2% over the same window, so shorts are being added rather than covered. Crowded short positioning is a condition, not a signal — it matters only if price stops making lows.",
  },
  {
    id: "sig-3",
    source: "flow",
    createdAt: ago(2 * 3_600 + 12 * 60),
    symbol: "JUP",
    thesis: "Two wallets that front-ran the last JUP move are accumulating again.",
    confidence: 0.48,
    setup:
      "Two addresses tagged from the January move have added 1.84M JUP across eleven transactions in the past 14 hours, all through the same router. Their prior entry preceded a 22% move. Sample size is two wallets — treat the confidence accordingly.",
  },
  {
    id: "sig-4",
    source: "liquidity",
    createdAt: ago(3 * 3_600 + 48 * 60),
    symbol: "DOGE",
    thesis: "DOGE order book thinned 34% below 0.1800 overnight.",
    confidence: 0.55,
    setup:
      "Resting bid depth within 2% of mid fell from $8.4M to $5.5M between 02:00 and 06:00 UTC and has not been replaced. Thin books cut both ways: they make a flush cheaper to cause and cheaper to reverse. Your DOGE perp long is 26.98% down with liquidation at 0.1482.",
  },
  {
    id: "sig-5",
    source: "volatility",
    createdAt: ago(6 * 3_600 + 20 * 60),
    symbol: "BTC",
    thesis: "BTC realised volatility is at its lowest reading in 40 days.",
    confidence: 0.61,
    setup:
      "10-day realised volatility is 21.4% annualised against a 90-day mean of 38.6%. Compression of this depth has resolved into an expansion within nine days on the last four occurrences, though direction was split two and two. This is a sizing observation, not a directional one.",
  },
  {
    id: "sig-6",
    source: "onchain",
    createdAt: ago(9 * 3_600),
    symbol: "ETH",
    thesis: "ETH supplied to Kamino is earning below the pool's borrow rate spread.",
    confidence: 0.4,
    setup:
      "Your 1.86 ETH is earning 2.1% while utilisation sits at 46%. Two comparable pools are paying 3.4% and 3.8% at similar utilisation. The difference on this size is roughly $52 a year — below the cost of moving it if gas and slippage are counted.",
  },
];
