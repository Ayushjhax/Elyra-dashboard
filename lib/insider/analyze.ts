/* ---------------------------------------------------------------------------
   Insider watch: the rules, as pure functions.

   The pattern is the one traders call "insider" trading on Hyperliquid — a
   wallet that did not exist the day before is funded, and almost at once
   opens one large position. Elyra flags the pattern from what Hyperliquid
   publishes for anyone:

     1. Candidates come from the public leaderboard: an account whose
        all-time volume is (almost) all inside the last day — or, to catch
        up after a gap, the last week — has only just started trading.
     2. Its ledger (`userNonFundingLedgerUpdates`) says when it was first
        funded, and from where; its fills say what it did first.
     3. Its first bet is the opening fills in its first hour of perp
        trading, by market and side. It is flagged when the wallet's first
        activity is at most `INSIDER_RULES.maxSetupHours` before that first
        trade and the largest bet is at least `INSIDER_RULES.minBetUsd`.
     4. Where the entry sat in the past week's range is read from
        Hyperliquid's own hourly candles — the "relative low" in the story —
        and is a fact shown beside the finding, never a gate or a score.

   A flag is a pattern, not proof. A fresh wallet with a big first trade can
   be a trader's new account, a desk, a hedge or luck, and the page and every
   notification say so. Nothing here predicts anything, and nothing trades:
   how the bet has gone since is shown from the live price, whichever way it
   went. The limits are constants, not settings.
--------------------------------------------------------------------------- */

export const INSIDER_RULES = {
  /** The largest opening bet in the first hour, in dollars of notional. */
  minBetUsd: 1_000_000,
  /** A candidate's window volume over its all-time volume. */
  freshShare: 0.98,
  /** First activity (funding, or a fill) to first perp trade, at most. */
  maxSetupHours: 72,
  /** How long after the first trade its opening fills count as the first bet. */
  betWindowMinutes: 60,
  /** A wallet found later than this after its first trade is listed, never notified. */
  notifyWithinHours: 24,
  /** The range the entry is placed in. */
  rangeDays: 7,
  /** Wallets read per scan — each is two or three requests to Hyperliquid. */
  candidateCap: 10,
} as const;

/** The notification thresholds a person can pick. */
export const WATCH_MINIMUMS = [1_000_000, 5_000_000, 10_000_000, 25_000_000] as const;

const HOUR = 3_600_000;
const MINUTE = 60_000;

export function num(value: unknown): number {
  const parsed = typeof value === "number" ? value : Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

const ADDRESS = /^0x[0-9a-f]{40}$/;

/** A Hyperliquid address in its one stored form, or null. */
export function cleanAddress(raw: unknown): string | null {
  const address = typeof raw === "string" ? raw.trim().toLowerCase() : "";
  return ADDRESS.test(address) ? address : null;
}

/* --- candidates ----------------------------------------------------------- */

export interface LeaderboardEntry {
  address: string;
  accountValue: number;
  dayVolume: number;
  weekVolume: number;
  allTimeVolume: number;
}

export interface Candidate {
  address: string;
  allTimeVolume: number;
  /** Which window holds (almost) all of its volume. */
  window: "day" | "week";
}

interface WireLeaderboardRow {
  ethAddress?: unknown;
  accountValue?: unknown;
  windowPerformances?: Array<[string, { vlm?: unknown }]>;
}

/** The leaderboard's rows, as the volumes this needs. Malformed rows are dropped. */
export function leaderboardEntries(body: unknown): LeaderboardEntry[] {
  const rows = (body as { leaderboardRows?: WireLeaderboardRow[] } | null)?.leaderboardRows;
  if (!Array.isArray(rows)) return [];
  const entries: LeaderboardEntry[] = [];
  for (const row of rows) {
    const address = cleanAddress(row.ethAddress);
    if (address === null || !Array.isArray(row.windowPerformances)) continue;
    const windows = new Map(row.windowPerformances);
    entries.push({
      address,
      accountValue: num(row.accountValue),
      dayVolume: num(windows.get("day")?.vlm),
      weekVolume: num(windows.get("week")?.vlm),
      allTimeVolume: num(windows.get("allTime")?.vlm),
    });
  }
  return entries;
}

/**
 * Accounts that have only just started trading, newest first: every account
 * whose day holds its all-time volume, largest first, then the week's, up
 * to `cap`. Addresses already read are skipped.
 */
export function candidatesFrom(entries: readonly LeaderboardEntry[], known: ReadonlySet<string>, cap: number = INSIDER_RULES.candidateCap): Candidate[] {
  const fresh = (volume: number, allTime: number) => allTime >= INSIDER_RULES.minBetUsd && volume >= INSIDER_RULES.freshShare * allTime;
  const day: Candidate[] = [];
  const week: Candidate[] = [];
  for (const entry of entries) {
    if (known.has(entry.address)) continue;
    if (fresh(entry.dayVolume, entry.allTimeVolume)) day.push({ address: entry.address, allTimeVolume: entry.allTimeVolume, window: "day" });
    else if (fresh(entry.weekVolume, entry.allTimeVolume)) week.push({ address: entry.address, allTimeVolume: entry.allTimeVolume, window: "week" });
  }
  const largest = (a: Candidate, b: Candidate) => b.allTimeVolume - a.allTimeVolume;
  return [...day.sort(largest), ...week.sort(largest)].slice(0, cap);
}

/* --- funding -------------------------------------------------------------- */

export interface LedgerEntry {
  time: number;
  delta: Record<string, unknown>;
}

export type FundingKind = "bridge" | "transfer" | "sub_account";

export interface Funding {
  at: string;
  kind: FundingKind;
  /** The sending Hyperliquid account, for a transfer; null for the bridge. */
  from: string | null;
  usd: number | null;
}

export function ledgerEntries(body: unknown): LedgerEntry[] {
  if (!Array.isArray(body)) return [];
  return body
    .filter((entry): entry is { time: unknown; delta: Record<string, unknown> } => typeof entry === "object" && entry !== null && typeof (entry as { delta?: unknown }).delta === "object")
    .map((entry) => ({ time: num(entry.time), delta: entry.delta }))
    .filter((entry) => entry.time > 0)
    .sort((a, b) => a.time - b.time);
}

/**
 * Money that came in from outside the account, oldest first: the bridge's
 * deposits, and transfers from another Hyperliquid account (a `send`, a spot
 * or internal transfer, or a master account funding its sub-account). A
 * transfer between the account's own spot and perp balances is not funding.
 */
export function incomingFunding(ledger: readonly LedgerEntry[], address: string): Funding[] {
  const funding: Funding[] = [];
  for (const entry of ledger) {
    const delta = entry.delta;
    const type = delta.type;
    const at = new Date(entry.time).toISOString();
    if (type === "deposit") {
      funding.push({ at, kind: "bridge", from: null, usd: num(delta.usdc) || null });
      continue;
    }
    if (type !== "send" && type !== "spotTransfer" && type !== "internalTransfer" && type !== "subAccountTransfer") continue;
    const to = cleanAddress(delta.destination);
    const from = cleanAddress(delta.user);
    if (to !== address || from === null || from === address) continue;
    const usd = num(delta.usdcValue) || num(delta.usdc) || (delta.token === "USDC" ? num(delta.amount) : 0);
    funding.push({ at, kind: type === "subAccountTransfer" ? "sub_account" : "transfer", from, usd: usd > 0 ? usd : null });
  }
  return funding;
}

/* --- the first bet -------------------------------------------------------- */

export interface Fill {
  coin: string;
  px: number;
  sz: number;
  dir: string;
  time: number;
}

export type Side = "long" | "short";

export interface Bet {
  coin: string;
  side: Side;
  notionalUsd: number;
  size: number;
  /** Size-weighted average fill price. */
  entryPx: number;
  firstAt: string;
  fills: number;
}

export function fillEntries(body: unknown): Fill[] {
  if (!Array.isArray(body)) return [];
  const fills: Fill[] = [];
  for (const raw of body as Array<Record<string, unknown>>) {
    if (typeof raw !== "object" || raw === null || typeof raw.coin !== "string" || typeof raw.dir !== "string") continue;
    const px = num(raw.px);
    const sz = num(raw.sz);
    const time = num(raw.time);
    if (px <= 0 || sz <= 0 || time <= 0) continue;
    fills.push({ coin: raw.coin, px, sz, dir: raw.dir, time });
  }
  return fills.sort((a, b) => a.time - b.time);
}

const OPENS: Record<string, Side> = { "Open Long": "long", "Open Short": "short" };

/**
 * The opening perp fills of the first `windowMs` after the first one, by
 * market and side, largest first. Spot fills and closes are not bets.
 */
export function openingBets(fills: readonly Fill[], windowMs: number = INSIDER_RULES.betWindowMinutes * MINUTE): { firstAt: number | null; bets: Bet[] } {
  const opens = fills.filter((fill) => OPENS[fill.dir] !== undefined);
  if (opens.length === 0) return { firstAt: null, bets: [] };
  const firstAt = opens[0].time;
  const groups = new Map<string, { coin: string; side: Side; notional: number; size: number; firstAt: number; fills: number }>();
  for (const fill of opens) {
    if (fill.time > firstAt + windowMs) break;
    const side = OPENS[fill.dir];
    const key = `${fill.coin}:${side}`;
    const group = groups.get(key) ?? { coin: fill.coin, side, notional: 0, size: 0, firstAt: fill.time, fills: 0 };
    group.notional += fill.px * fill.sz;
    group.size += fill.sz;
    group.fills += 1;
    groups.set(key, group);
  }
  const bets = [...groups.values()]
    .map((group) => ({
      coin: group.coin,
      side: group.side,
      notionalUsd: group.notional,
      size: group.size,
      entryPx: group.notional / group.size,
      firstAt: new Date(group.firstAt).toISOString(),
      fills: group.fills,
    }))
    .sort((a, b) => b.notionalUsd - a.notionalUsd);
  return { firstAt, bets };
}

/* --- timing --------------------------------------------------------------- */

export interface Candle {
  t: number;
  o: number;
  h: number;
  l: number;
  c: number;
}

export interface RangeTiming {
  /** Days of candles the range covers. */
  days: number;
  low: number;
  high: number;
  /** Where the entry sat: 0 at the range's low, 1 at its high; beyond either end is outside the range. */
  position: number;
}

export function candleEntries(body: unknown): Candle[] {
  if (!Array.isArray(body)) return [];
  return (body as Array<Record<string, unknown>>)
    .map((raw) => ({ t: num(raw.t), o: num(raw.o), h: num(raw.h), l: num(raw.l), c: num(raw.c) }))
    .filter((candle) => candle.t > 0 && candle.o > 0 && candle.h > 0 && candle.l > 0 && candle.c > 0)
    .sort((a, b) => a.t - b.t);
}

/** A jump between one bar's close and the next bar's open larger than this is a redenomination, not a move. */
const DISCONTINUITY = 0.3;

/**
 * Where `entry` sat in the range of the candles before it. A market that was
 * redenominated inside the window (an hourly open 30% away from the last
 * close) is read only from after the jump; fewer than a day of bars, or an
 * entry far outside the range, says nothing and is null.
 */
export function rangeTiming(candles: readonly Candle[], entry: number): RangeTiming | null {
  if (entry <= 0) return null;
  let start = 0;
  for (let index = 1; index < candles.length; index += 1) {
    if (Math.abs(candles[index].o / candles[index - 1].c - 1) > DISCONTINUITY) start = index;
  }
  const window = candles.slice(start);
  if (window.length < 24) return null;
  const low = Math.min(...window.map((candle) => candle.l));
  const high = Math.max(...window.map((candle) => candle.h));
  if (!(high > low)) return null;
  const position = (entry - low) / (high - low);
  if (position < -0.5 || position > 1.5) return null;
  const days = (window[window.length - 1].t - window[0].t + HOUR) / (24 * HOUR);
  return { days: Math.round(days * 10) / 10, low, high, position };
}

/** How near the entry was to the end of the range a bet on this side would want: 0 at the low for a long, at the high for a short. */
export function nearFavouredEnd(side: Side, timing: RangeTiming): number {
  return side === "long" ? timing.position : 1 - timing.position;
}

/* --- the finding ---------------------------------------------------------- */

export interface InsiderFinding {
  address: string;
  /** The wallet's first activity: its first funding or fill, whichever came first. */
  firstSeenAt: string;
  firstTradeAt: string;
  /** First activity to first trade. */
  setupMs: number;
  /** Money in from outside by the end of the first bet's window, oldest first (at most five). */
  funding: Funding[];
  fundedUsd: number | null;
  bet: Bet;
  /** The first hour's other bets, largest first (at most four). */
  otherBets: Bet[];
  windowNotionalUsd: number;
  /** The bet's share of the first hour's opening notional. */
  concentration: number;
  /** The bet's notional over the money sent in by then. */
  leverage: number | null;
  timing: RangeTiming | null;
  /** False while the first hour is still running; the scan reads it again. */
  windowComplete: boolean;
}

export type PassReason = "older_wallet" | "sub_account" | "small_bet" | "no_perp_trade";

export type Assessment = { kind: "flagged"; finding: InsiderFinding } | { kind: "passed"; reason: PassReason } | { kind: "later" };

/**
 * Whether a candidate matches the pattern. "later" means it might yet — its
 * first hour is still running, or it has not traded a perp — and it is read
 * again on the next scan rather than recorded.
 */
export function assess(input: { address: string; ledger: readonly LedgerEntry[]; fills: readonly Fill[]; now: number }): Assessment {
  const { address, ledger, fills, now } = input;
  const firstActivity = Math.min(ledger[0]?.time ?? Infinity, fills[0]?.time ?? Infinity);
  if (!Number.isFinite(firstActivity)) return { kind: "later" };

  const allFunding = incomingFunding(ledger, address);
  /* A sub-account is a trader's existing account under another name. */
  if (allFunding[0]?.kind === "sub_account") return { kind: "passed", reason: "sub_account" };

  const windowMs = INSIDER_RULES.betWindowMinutes * MINUTE;
  const { firstAt, bets } = openingBets(fills, windowMs);
  if (firstAt === null) return now - firstActivity < 24 * HOUR ? { kind: "later" } : { kind: "passed", reason: "no_perp_trade" };
  if (firstAt - firstActivity > INSIDER_RULES.maxSetupHours * HOUR) return { kind: "passed", reason: "older_wallet" };

  const windowComplete = now >= firstAt + windowMs;
  const bet = bets[0];
  if (bet.notionalUsd < INSIDER_RULES.minBetUsd) return windowComplete ? { kind: "passed", reason: "small_bet" } : { kind: "later" };

  const windowEnd = firstAt + windowMs;
  const funded = allFunding.filter((entry) => Date.parse(entry.at) <= windowEnd);
  const fundedUsd = funded.reduce((sum, entry) => sum + (entry.usd ?? 0), 0);
  const windowNotionalUsd = bets.reduce((sum, entry) => sum + entry.notionalUsd, 0);
  return {
    kind: "flagged",
    finding: {
      address,
      firstSeenAt: new Date(firstActivity).toISOString(),
      firstTradeAt: new Date(firstAt).toISOString(),
      setupMs: firstAt - firstActivity,
      funding: funded.slice(0, 5),
      fundedUsd: fundedUsd > 0 ? fundedUsd : null,
      bet,
      otherBets: bets.slice(1, 5),
      windowNotionalUsd,
      concentration: windowNotionalUsd > 0 ? bet.notionalUsd / windowNotionalUsd : 1,
      leverage: fundedUsd > 0 ? bet.notionalUsd / fundedUsd : null,
      timing: null,
      windowComplete,
    },
  };
}

/* --- what the page and the bell read -------------------------------------- */

/** A flagged wallet as the API returns it, with the live price beside it. */
export interface InsiderWallet extends InsiderFinding {
  detectedAt: string;
  /** The bet's market price now, and its move since the entry, in the bet's favour (negative: against it). */
  markPx: number | null;
  sinceEntryPct: number | null;
}

export interface InsiderWatch {
  minUsd: number;
  /** When the watch was turned on: nothing found before it is a notification. */
  since: string;
}

export interface InsiderScanState {
  at: string;
  checked: number;
  flagged: number;
  error: string | null;
}

export interface InsiderFeed {
  wallets: InsiderWallet[];
  scan: InsiderScanState | null;
  watch: InsiderWatch | null;
  error: string | null;
}

/** Whether a finding was found soon enough after its first trade to be news. */
export function foundInTime(wallet: Pick<InsiderWallet, "detectedAt" | "firstTradeAt">): boolean {
  return Date.parse(wallet.detectedAt) - Date.parse(wallet.firstTradeAt) <= INSIDER_RULES.notifyWithinHours * HOUR;
}

/** Whether a wallet is a notification for this watch: found after it was set, found in time, and at least its size. */
export function notifies(wallet: InsiderWallet, watch: InsiderWatch | null): boolean {
  if (watch === null) return false;
  return Date.parse(wallet.detectedAt) >= Date.parse(watch.since) && foundInTime(wallet) && wallet.bet.notionalUsd >= watch.minUsd;
}

/** The move since the entry, in the bet's favour, as a percentage. */
export function moveInFavour(side: Side, entry: number, mark: number): number | null {
  if (entry <= 0 || mark <= 0) return null;
  const move = ((mark - entry) / entry) * 100;
  return side === "long" ? move : -move;
}

/* --- names ---------------------------------------------------------------- */

/** "BTC", or "NVDA" with its builder exchange for a HIP-3 market ("xyz:NVDA"). */
export function marketParts(coin: string): { ticker: string; dex: string | null } {
  const colon = coin.indexOf(":");
  return colon === -1 ? { ticker: coin, dex: null } : { ticker: coin.slice(colon + 1), dex: coin.slice(0, colon) };
}

const DEX_NAMES: Record<string, string> = { xyz: "trade[XYZ]" };

export function marketName(coin: string): string {
  const { ticker, dex } = marketParts(coin);
  return dex === null ? ticker : `${ticker} · ${DEX_NAMES[dex] ?? dex}`;
}

export function shortWallet(address: string): string {
  return `${address.slice(0, 6)}…${address.slice(-4)}`;
}

export const EXPLORER = "https://app.hyperliquid.xyz/explorer/address/";

/* --- the wallet now ------------------------------------------------------- */

export interface WalletPosition {
  coin: string;
  side: Side;
  size: number;
  entryPx: number | null;
  valueUsd: number;
  unrealizedUsd: number;
  leverage: number | null;
  liquidationPx: number | null;
}

export interface WalletNow {
  accountValueUsd: number;
  positions: WalletPosition[];
  at: string;
}

/** One exchange's `clearinghouseState`, as positions and an account value. */
export function walletState(body: unknown): { accountValueUsd: number; positions: WalletPosition[] } {
  const state = body as { marginSummary?: { accountValue?: unknown }; assetPositions?: Array<{ position?: Record<string, unknown> }> } | null;
  const positions: WalletPosition[] = [];
  for (const entry of state?.assetPositions ?? []) {
    const position = entry.position;
    if (position === undefined || typeof position.coin !== "string") continue;
    const size = num(position.szi);
    if (size === 0) continue;
    const leverage = num((position.leverage as { value?: unknown } | undefined)?.value);
    const entryPx = num(position.entryPx);
    const liquidationPx = num(position.liquidationPx);
    positions.push({
      coin: position.coin,
      side: size > 0 ? "long" : "short",
      size: Math.abs(size),
      entryPx: entryPx > 0 ? entryPx : null,
      valueUsd: Math.abs(num(position.positionValue)),
      unrealizedUsd: num(position.unrealizedPnl),
      leverage: leverage > 0 ? leverage : null,
      liquidationPx: liquidationPx > 0 ? liquidationPx : null,
    });
  }
  return { accountValueUsd: num(state?.marginSummary?.accountValue), positions };
}
