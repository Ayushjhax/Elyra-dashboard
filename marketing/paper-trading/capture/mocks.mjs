/* Stand-in API answers for the scratch site's demo account, in the app's own
   response shapes (lib/paper/types.ts, lib/autotrade/types.ts, lib/wallet,
   lib/portfolio). Prices come from Hyperliquid's live mids. */
import fs from "node:fs";

const STRATEGIES = JSON.parse(fs.readFileSync(new URL("./strategies.json", import.meta.url), "utf8"));

export async function liveMids() {
  const r = await fetch("https://api.hyperliquid.xyz/info", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ type: "allMids" }) });
  const mids = await r.json();
  const x = await fetch("https://api.hyperliquid.xyz/info", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ type: "allMids", dex: "xyz" }) });
  Object.assign(mids, await x.json());
  return Object.fromEntries(Object.entries(mids).map(([k, v]) => [k, Number(v)]));
}

const r2 = (v) => Math.round(v * 100) / 100;
const iso = (minutesAgo) => new Date(Date.now() - minutesAgo * 60_000).toISOString();
const sig = (n) => Number(n.toPrecision(6));

export function makeState(mids) {
  const SOL = mids.SOL, ETH = mids.ETH, BTC = mids.BTC, HYPE = mids.HYPE ?? 30;
  /* Open paper positions, entered a little away from the mid now. */
  const open = [
    { id: "p-sol", ruleId: null, ruleName: "Market order", coin: "SOL", side: "long", sizeUsd: 2500, lev: 3, entry: sig(SOL * 0.9935), tp: 4, sl: 2, at: 95, reason: "Market order from the chart" },
    { id: "p-eth", ruleId: "r-1", ruleName: "ETH trend, 1h", coin: "ETH", side: "short", sizeUsd: 1500, lev: 2, entry: sig(ETH * 1.0042), tp: 3, sl: 1.5, at: 240, reason: "EMA cross on the 1h close" },
    { id: "p-btc", ruleId: null, ruleName: "Limit order", coin: "BTC", side: "long", sizeUsd: 4000, lev: 2, entry: sig(BTC * 0.9978), tp: 3, sl: 1.5, at: 410, reason: "Limit order filled" },
  ].map((p) => {
    const size = p.sizeUsd / p.entry;
    const takeProfit = p.side === "long" ? p.entry * (1 + p.tp / 100) : p.entry * (1 - p.tp / 100);
    const stopLoss = p.side === "long" ? p.entry * (1 - p.sl / 100) : p.entry * (1 + p.sl / 100);
    return { ...p, size, takeProfit: sig(takeProfit), stopLoss: sig(stopLoss) };
  });
  /* Closed paper trades: results after fees. */
  const closed = JSON.parse(fs.readFileSync(new URL("./closed.json", import.meta.url), "utf8"));
  const ref = { SOL, ETH, BTC, HYPE, DOGE: mids.DOGE ?? 0.2, kPEPE: mids.kPEPE ?? 0.01, "xyz:NVDA": mids["xyz:NVDA"] ?? 150 };
  return { open, closed, ref, orderMargin: 750 };
}

export function funds(state, mids, starting = 100_000) {
  const realised = state.closed.reduce((s, c) => s + c.pnl, 0);
  let unrealised = 0, margin = 0;
  for (const p of state.open) {
    margin += (p.entry * p.size) / p.lev;
    const mark = mids[p.coin];
    unrealised += p.size * (p.side === "long" ? mark - p.entry : p.entry - mark);
  }
  margin += state.orderMargin ?? 0;
  const balance = starting + realised;
  const equity = balance + unrealised;
  return {
    startingUsd: starting,
    realisedUsd: r2(realised),
    balanceUsd: r2(balance),
    unrealisedUsd: r2(unrealised),
    equityUsd: r2(equity),
    marginUsd: r2(margin),
    availableUsd: r2(Math.max(0, equity - margin)),
    openPositions: state.open.length,
    restingOrders: state.orderMargin ? 1 : 0,
    unmarked: 0,
  };
}

export const freshFunds = () => ({ startingUsd: 100000, realisedUsd: 0, balanceUsd: 100000, unrealisedUsd: 0, equityUsd: 100000, marginUsd: 0, availableUsd: 100000, openPositions: 0, restingOrders: 0, unmarked: 0 });

export function paperBody(kind, state, mids, fresh = null) {
  const live = { enabled: false, network: "testnet" };
  if (kind === "none") return { account: null, live, error: null };
  const startedAt = kind === "fresh" ? new Date().toISOString() : iso(60 * 24 * 5);
  return { account: { startingUsd: 100000, startedAt, active: true, resets: 0, funds: kind === "fresh" ? (fresh ? funds(fresh, mids) : freshFunds()) : funds(state, mids) }, live, error: null };
}

export function tradeView(p, extra = {}) {
  return {
    id: p.id, ruleId: p.ruleId, ruleName: p.ruleName, mode: "paper", network: null, side: p.side, coin: p.coin, size: p.size,
    entryPrice: p.entry, takeProfit: p.takeProfit, stopLoss: p.stopLoss, status: "open", entryReason: p.reason, exitPrice: null, exitReason: null,
    realisedPnlUsd: null, error: null, openedAt: iso(p.at), closedAt: null, expectedPrice: sig(p.entry / (1 + (p.side === "long" ? 1 : -1) * 0.0005)), slippageBps: 5.0, originalSize: p.size, partialCloses: [], realisedPartialUsd: 0, ...extra,
  };
}

function closedView(c, ref) {
  const dir = c.side === "long" ? 1 : -1;
  const entry = sig(ref[c.coin] * (1 - 0.02 + (c.at % 7) * 0.004));
  const tp = sig(entry * (1 + dir * 0.04)), sl = sig(entry * (1 - dir * 0.02));
  const exit = c.exit === "take_profit" ? tp : c.exit === "stop_loss" ? sl : sig(entry * (1 + dir * (c.pnl > 0 ? 0.025 : -0.012)));
  const size = c.pnl / (dir * (exit - entry) - (entry + exit) * 0.00045);
  return {
    id: c.id, ruleId: c.exit === "exit_rule" ? "r-2" : null, ruleName: c.exit === "exit_rule" ? "SOL mean reversion, 15m" : "Market order", mode: "paper", network: null, side: c.side, coin: c.coin, size,
    entryPrice: entry, takeProfit: tp, stopLoss: sl, status: "closed",
    entryReason: "Market order from the chart", exitPrice: exit, exitReason: c.exit, realisedPnlUsd: c.pnl, error: null, openedAt: iso(c.at + c.hold), closedAt: iso(c.at),
    expectedPrice: sig(entry / (1 + dir * 0.0005)), slippageBps: 5.0, originalSize: size, partialCloses: [], realisedPartialUsd: 0,
  };
}

function group(key, label, list) {
  const wins = list.filter((c) => c.pnl > 0).length;
  const net = r2(list.reduce((s, c) => s + c.pnl, 0));
  return { key, label, trades: list.length, wins, winRate: list.length ? (wins / list.length) * 100 : null, netPnlUsd: net, avgPnlUsd: list.length ? net / list.length : null };
}
function by(list, keyOf, labelOf) {
  const m = new Map();
  for (const c of list) { const k = keyOf(c); m.set(k, [...(m.get(k) ?? []), c]); }
  return [...m].map(([k, v]) => group(k, labelOf(k), v));
}

export function automationBody(state, mids, extraOpen = [], empty = false) {
  if (empty) return { settings: { paused: false, dailyLossLimitUsd: 1000, maxOpenPositions: 5 }, agent: null, live: { enabled: false, network: "testnet" }, accountAddress: "0x7a3c9e2b41d05f8e6a91c4b27d3e58f0a6b21c94", rules: [], trades: extraOpen, orders: [], analysis: null, strategies: STRATEGIES, error: null };
  const closed = state.closed;
  const analysis = JSON.parse(fs.readFileSync(new URL("./analysis.json", import.meta.url), "utf8"));
  const rules = [
    { id: "r-1", name: "ETH trend, 1h", side: "short", coin: "ETH", strategyId: "MACD_CROSS_V1", params: {}, interval: "1h", sizeUsd: 1500, leverage: 2, takeProfitPct: 3, stopLossPct: 1.5, mode: "paper", enabled: true, lastSignalAt: iso(240), lastCheckedAt: iso(3), lastNote: "No new signal on the last close." },
    { id: "r-2", name: "SOL mean reversion, 15m", side: "long", coin: "SOL", strategyId: "RSI_12_MEAN_REVERSION_V1", params: {}, interval: "15m", sizeUsd: 1000, leverage: 2, takeProfitPct: 2, stopLossPct: 1, mode: "paper", enabled: true, lastSignalAt: iso(5300), lastCheckedAt: iso(3), lastNote: "RSI 47.2: waiting for it to fall below 30." },
  ].map((r) => ({ ...r, params: Object.fromEntries((STRATEGIES.find((s) => s.id === r.strategyId)?.parameters ?? []).map((p) => [p.key, p.default])) }));
  const order = { id: "o-1", mode: "paper", network: null, coin: "SOL", side: "long", price: sig(mids.SOL * 0.975), sizeUsd: 1500, leverage: 2, takeProfit: sig(mids.SOL * 0.975 * 1.04), stopLoss: sig(mids.SOL * 0.975 * 0.98), status: "open", error: null, createdAt: iso(50), filledAt: null, cancelledAt: null };
  return {
    settings: { paused: false, dailyLossLimitUsd: 1000, maxOpenPositions: 5 },
    agent: null,
    live: { enabled: false, network: "testnet" },
    accountAddress: "0x7a3c9e2b41d05f8e6a91c4b27d3e58f0a6b21c94",
    rules,
    trades: [...extraOpen, ...state.open.map((p) => tradeView(p)), ...closed.map((c) => closedView(c, state.ref))],
    orders: [order],
    analysis,
    strategies: STRATEGIES,
    error: null,
  };
}

export function walletBody(mids) {
  const sol = 4.82;
  return {
    wallet: {
      address: "7xKXtg2CW87d97TXJSDpbD5jBkheTqA83TZRuJosgAsU", cluster: "mainnet-beta", sol, lamports: sol * 1e9, solUsd: mids.SOL,
      tokens: [{ mint: "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v", symbol: "USDC", name: "USD Coin", amount: 640.5, decimals: 6, usdValue: 640.5, icon: null, verified: true }],
      tokenCount: 1, usdValue: r2(sol * mids.SOL + 640.5), uncounted: { unpriced: 0, unverified: 0 }, slot: 389_412_000, fetchedAt: new Date().toISOString(),
    },
    error: null, unconfigured: false, latencyMs: 180,
  };
}

export function portfolioBody(mids) {
  const sol = 4.82;
  const total = r2(sol * mids.SOL + 640.5);
  return {
    portfolio: {
      asOf: new Date().toISOString(),
      summary: { totalValueUsd: total, availableCapitalUsd: 640.5, unrealizedPnlUsd: 0, pnl24hUsd: null, pnl24hPct: null, agentManagedValueUsd: null, agentManagedPct: null },
      scopes: [], spot: [], perps: [], defi: [], orders: [], activity: [], history: [],
      prediction: { connected: false, valueUsd: null, costBasisUsd: null, unrealisedPnlUsd: null, capitalAtRiskUsd: null, maxPayoutUsd: null, activeMarkets: null, resolvingWithin24h: null, resolvingWithin7d: null, claimableCount: null, claimableValueUsd: null, unavailableReason: "Not connected" },
      notes: [], partial: false,
    },
    error: null, unconfigured: false,
  };
}
