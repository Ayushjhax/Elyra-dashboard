import type { Rule } from "@/lib/types";
import { ago } from "@/lib/format";

/** Agent-owned rules. Every card carries the lime rail. */
export const RULES: Rule[] = [
  {
    id: "rule-1",
    name: "Funding drain guard",
    condition: "If SOL funding < -0.01% for 30m → close 25% of perp",
    status: "armed",
    enabled: true,
    lastRunAt: ago(18 * 60),
    symbol: "SOL",
  },
  {
    id: "rule-2",
    name: "HYPE short cover",
    condition: "If HYPE prints a 4H close above 41.20 → buy back the short",
    status: "armed",
    enabled: true,
    lastRunAt: ago(52 * 60),
    symbol: "HYPE",
  },
  {
    id: "rule-3",
    name: "DOGE drawdown stop",
    condition: "If DOGE perp PnL < -30% → close the position in full",
    status: "triggered",
    enabled: true,
    lastRunAt: ago(2 * 3_600 + 8 * 60),
    symbol: "DOGE",
  },
  {
    id: "rule-4",
    name: "BTC volatility ladder",
    condition: "If BTC 10d realised vol < 24% → ladder 3 buys 1.5% apart",
    status: "armed",
    enabled: true,
    lastRunAt: ago(5 * 3_600 + 34 * 60),
    symbol: "BTC",
  },
  {
    id: "rule-5",
    name: "JUP accumulation follow",
    condition: "If tagged wallets add > 1M JUP in 12h → alert, do not trade",
    status: "paused",
    enabled: false,
    lastRunAt: ago(29 * 3_600),
    symbol: "JUP",
  },
  {
    id: "rule-6",
    name: "Stablecoin sweep",
    condition: "If idle USDC > $5,000 at 00:00 UTC → supply to the top pool",
    status: "armed",
    enabled: true,
    lastRunAt: ago(14 * 3_600 + 30 * 60),
    symbol: "SOL",
  },
  {
    id: "rule-7",
    name: "ETF resolution watch",
    condition: "If the SOL ETF market moves > 8 points in 1h → flatten the leg",
    status: "paused",
    enabled: false,
    lastRunAt: null,
    symbol: "SOL",
  },
];
