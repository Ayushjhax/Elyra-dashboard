import { msg } from "@/lib/i18n/translate";
import type { AutotradeInterval, Side } from "@/lib/autotrade/rules";

/* ---------------------------------------------------------------------------
   Elyra's own rule sets — leaders anyone can copy from the first day, before
   a single person has published one.

   They are real rules, not a record: each runs in the five-minute pass like
   any person's rule, on paper, against Hyperliquid's mainnet bars and mid,
   paying `PAPER_COSTS` on every fill. Their record is only the trades they
   have actually taken since they started, and the page labels them as
   Elyra's and as paper. Nothing here is a result.

   They are owned by a profile no one can sign in as: its `privy_did` is not
   a Privy DID (those begin "did:privy:"), so no session ever resolves to it.
   `ensureHouse` (lib/copy/store.ts) writes these rows from this file, so the
   code is the one source of what the house trades.

   The strategies were chosen for how often they trade and for covering
   majors, a fast mover and both directions — not for how they backtested.
   Five rules in all: the house account keeps Automation's limit of five
   open positions, so every rule can hold one at once.
--------------------------------------------------------------------------- */

export const HOUSE_USER_ID = "00000000-0000-4000-8000-0000000e1e7a";
export const HOUSE_DID = "elyra:house";

export interface HouseRule {
  id: string;
  name: string;
  coin: string;
  side: Side;
  strategyId: string;
  interval: AutotradeInterval;
  sizeUsd: number;
  leverage: number;
  takeProfitPct: number;
  stopLossPct: number;
}

export interface HouseSet {
  id: string;
  /** English; the page translates it. */
  name: string;
  description: string;
  rules: HouseRule[];
}

export const HOUSE_SETS: readonly HouseSet[] = [
  {
    id: "00000000-0000-4000-8000-00000000a001",
    name: msg("Elyra trend · majors"),
    description: msg("Follows BTC and ETH trends on four-hour bars: in on a MACD signal cross or a Parabolic SAR flip, out at the target, the stop or the reverse signal."),
    rules: [
      {
        id: "00000000-0000-4000-8000-00000000b001",
        name: "BTC trend · MACD 4h",
        coin: "BTC",
        side: "long",
        strategyId: "MACD_CROSS_V1",
        interval: "4h",
        sizeUsd: 100,
        leverage: 2,
        takeProfitPct: 6,
        stopLossPct: 3,
      },
      {
        id: "00000000-0000-4000-8000-00000000b002",
        name: "ETH trend · Parabolic SAR 4h",
        coin: "ETH",
        side: "long",
        strategyId: "PARABOLIC_SAR_V1",
        interval: "4h",
        sizeUsd: 100,
        leverage: 2,
        takeProfitPct: 7,
        stopLossPct: 3.5,
      },
    ],
  },
  {
    id: "00000000-0000-4000-8000-00000000a002",
    name: msg("Elyra momentum · SOL and HYPE"),
    description: msg("Hourly breakouts on SOL and HYPE: in when price closes outside its Bollinger Band or above its volume-weighted average, with a tighter target and stop."),
    rules: [
      {
        id: "00000000-0000-4000-8000-00000000b003",
        name: "SOL breakout · Bollinger 1h",
        coin: "SOL",
        side: "long",
        strategyId: "BOLLINGER_BREAKOUT_V1",
        interval: "1h",
        sizeUsd: 100,
        leverage: 2,
        takeProfitPct: 4,
        stopLossPct: 2,
      },
      {
        id: "00000000-0000-4000-8000-00000000b004",
        name: "HYPE momentum · VWMA 1h",
        coin: "HYPE",
        side: "long",
        strategyId: "VWMA_CROSS_V1",
        interval: "1h",
        sizeUsd: 100,
        leverage: 2,
        takeProfitPct: 5,
        stopLossPct: 2.5,
      },
    ],
  },
  {
    id: "00000000-0000-4000-8000-00000000a003",
    name: msg("Elyra fade · BTC short"),
    description: msg("Sells BTC short when its 15-minute RSI is stretched to the upside, and buys back at a small target or stop: the other side of a crowded move."),
    rules: [
      {
        id: "00000000-0000-4000-8000-00000000b005",
        name: "BTC fade · RSI 15m short",
        coin: "BTC",
        side: "short",
        strategyId: "RSI_12_MEAN_REVERSION_V1",
        interval: "15m",
        sizeUsd: 100,
        leverage: 2,
        takeProfitPct: 1.5,
        stopLossPct: 1,
      },
    ],
  },
];

export const HOUSE_SET_IDS: ReadonlySet<string> = new Set(HOUSE_SETS.map((set) => set.id));

export function houseSet(id: string): HouseSet | null {
  return HOUSE_SETS.find((set) => set.id === id) ?? null;
}
