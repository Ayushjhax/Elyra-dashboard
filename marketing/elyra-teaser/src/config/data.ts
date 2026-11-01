/* ---------------------------------------------------------------------------
   ILLUSTRATIVE DATA — one consistent, invented account used by every
   reconstructed screen. None of it was captured from a live account, none of
   it is a performance claim, and the film labels it on screen. Change a
   value here and every scene that shows it follows.

   SOL's mark ($94.20) matches the real asset capture (07-sol-asset.png).
--------------------------------------------------------------------------- */

export const ACCOUNT = {
  total: 48260,
  solMark: 94.2,
  /** The preference saved to memory — the README's own example. */
  capPct: 25,
  venues: [
    { key: "wallet", name: "Solana wallet", detail: "92.4 SOL · JUP · USDC", value: 21140 },
    { key: "hyperliquid", name: "Hyperliquid", detail: "SOL-PERP long 3×", value: 14720 },
    { key: "binance", name: "Binance", detail: "BTC · ETH spot", value: 8150 },
    { key: "defi", name: "Kamino", detail: "USDC deposit", value: 4250 },
  ],
  allocation: [
    { sym: "SOL", pct: 41 },
    { sym: "BTC", pct: 18 },
    { sym: "USDC", pct: 17 },
    { sym: "ETH", pct: 14 },
    { sym: "Other", pct: 10 },
  ],
  perp: {
    market: "SOL-PERP",
    side: "Long 3×",
    mark: 94.2,
    liq: 77.3,
    /** (mark − liq) / mark, rounded — 17.9%. */
    headroomPct: 18,
  },
  catalyst: { title: "JUP unlock in 3 days", detail: "You hold 1,240 JUP" },
} as const;

/** The swap Elyra prepares in scene 6 — trims SOL toward the 25% cap. */
export const SWAP = {
  payAmount: "80",
  paySym: "SOL",
  payUsd: "$7,536.80",
  receiveAmount: "7,536.8",
  receiveSym: "USDC",
  route: "Jupiter",
  impact: "0.04%",
  minReceived: "7,499.1 USDC",
  slippage: "0.5%",
} as const;

/** The product-vision strategy (scene 6, second bar). A concept, not a feature. */
export const STRATEGY = {
  goal: "Keep my allocation balanced",
  condition: "Any asset above 30% of capital",
  trigger: "SOL is at 41%",
  rows: [
    { sym: "SOL", now: 41, after: 25 },
    { sym: "BTC", now: 18, after: 22 },
    { sym: "USDC", now: 17, after: 24 },
    { sym: "ETH", now: 14, after: 18 },
    { sym: "Other", now: 10, after: 11 },
  ],
  summary: "Rebalance · 4 swaps · simulated",
} as const;

export const usd = (n: number) => `$${n.toLocaleString("en-US")}`;
