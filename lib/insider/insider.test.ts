import { describe, expect, it } from "vitest";
import { notificationsFrom, type NotificationItem } from "@/lib/activity/notifications";
import {
  assess,
  candidatesFrom,
  cleanAddress,
  foundInTime,
  incomingFunding,
  INSIDER_RULES,
  leaderboardEntries,
  ledgerEntries,
  marketName,
  moveInFavour,
  notifies,
  openingBets,
  rangeTiming,
  walletState,
  type Candle,
  type Fill,
  type InsiderWallet,
  type LedgerEntry,
} from "@/lib/insider/analyze";
import { betHeadline, concentrationLine, fundingLine, leverageLine, setupLine, sinceLine, timingLine } from "@/lib/insider/words";

const WALLET = "0x9bbf17b0298ba2d8ac62c17530c92bd4577ae490";
const FUNDER = "0x6b9e773128f453f5c2c60935ee2de2cbc5390a24";
const T = Date.parse("2026-10-27T03:25:14.455Z");
const HOUR = 3_600_000;

function row(address: string, day: number, week: number, allTime: number) {
  return {
    ethAddress: address,
    accountValue: "100000",
    windowPerformances: [
      ["day", { vlm: String(day) }],
      ["week", { vlm: String(week) }],
      ["month", { vlm: String(allTime) }],
      ["allTime", { vlm: String(allTime) }],
    ],
  };
}

const address = (n: number) => `0x${n.toString(16).padStart(40, "0")}`;

/* Shaped like the wallet that started this: $3M sent from another account,
   a 200 BTC long 12 seconds later, $1M more five minutes after that. */
const ledger: LedgerEntry[] = ledgerEntries([
  { time: T, delta: { type: "send", user: FUNDER, destination: WALLET, token: "USDC", amount: "2999999.8", usdcValue: "2999999.8" } },
  { time: T + 320_000, delta: { type: "send", user: FUNDER, destination: WALLET, token: "USDC", amount: "999999.8", usdcValue: "999999.8" } },
  { time: T + 20 * 86_400_000, delta: { type: "send", user: FUNDER, destination: WALLET, token: "USDC", amount: "1052839.95", usdcValue: "1052839.95" } },
]);
const fills: Fill[] = [
  { coin: "BTC", px: 79706, sz: 120, dir: "Open Long", time: T + 12_000 },
  { coin: "BTC", px: 79745, sz: 80, dir: "Open Long", time: T + 16_000 },
];

describe("candidates", () => {
  it("reads the leaderboard's volumes and drops malformed rows", () => {
    const entries = leaderboardEntries({ leaderboardRows: [row(WALLET.toUpperCase().replace("0X", "0x"), 1, 2, 3), { ethAddress: "nope" }, { ethAddress: address(1) }] });
    expect(entries).toEqual([{ address: WALLET, accountValue: 100000, dayVolume: 1, weekVolume: 2, allTimeVolume: 3 }]);
    expect(leaderboardEntries(null)).toEqual([]);
  });

  it("takes accounts whose day holds their all-time volume first, then the week's, largest first, skipping known ones", () => {
    const entries = leaderboardEntries({
      leaderboardRows: [
        row(address(1), 2e6, 2e6, 2e6), // fresh today
        row(address(2), 30e6, 30e6, 30e6), // fresh today, larger
        row(address(3), 0, 50e6, 50e6), // fresh this week
        row(address(4), 5e6, 5e6, 90e6), // old account
        row(address(5), 9e5, 9e5, 9e5), // too small
        row(address(6), 4e6, 4e6, 4e6), // already read
      ],
    });
    const picked = candidatesFrom(entries, new Set([address(6)]));
    expect(picked.map((entry) => [entry.address, entry.window])).toEqual([
      [address(2), "day"],
      [address(1), "day"],
      [address(3), "week"],
    ]);
    expect(candidatesFrom(entries, new Set(), 1)).toHaveLength(1);
  });

  it("keeps addresses in one form", () => {
    expect(cleanAddress(` ${WALLET.toUpperCase().replace("0X", "0x")} `)).toBe(WALLET);
    expect(cleanAddress("0x123")).toBeNull();
    expect(cleanAddress(7)).toBeNull();
  });
});

describe("funding", () => {
  it("counts the bridge and transfers from other accounts, not the account's own moves", () => {
    const entries = ledgerEntries([
      { time: 3, delta: { type: "accountClassTransfer", usdc: "50", toPerp: true } },
      { time: 2, delta: { type: "send", user: WALLET, destination: WALLET, token: "USDC", amount: "10", usdcValue: "10" } },
      { time: 1, delta: { type: "deposit", usdc: "2500" } },
      { time: 4, delta: { type: "send", user: FUNDER, destination: WALLET, token: "USDC", amount: "100" } },
      { time: 5, delta: { type: "send", user: WALLET, destination: FUNDER, token: "USDC", amount: "100" } },
      { time: 6, delta: { type: "subAccountTransfer", usdc: "7", user: FUNDER, destination: WALLET } },
    ]);
    expect(incomingFunding(entries, WALLET).map((entry) => [entry.kind, entry.from, entry.usd])).toEqual([
      ["bridge", null, 2500],
      ["transfer", FUNDER, 100],
      ["sub_account", FUNDER, 7],
    ]);
  });
});

describe("the first bet", () => {
  it("groups the first hour's opening perp fills by market and side, largest first", () => {
    const { firstAt, bets } = openingBets([
      { coin: "@107", px: 40, sz: 1000, dir: "Buy", time: 0 },
      { coin: "ZEC", px: 700, sz: 1000, dir: "Open Short", time: 10 },
      { coin: "xyz:NVDA", px: 150, sz: 20_000, dir: "Open Short", time: 20 },
      { coin: "ZEC", px: 710, sz: 1000, dir: "Open Short", time: 30 },
      { coin: "ZEC", px: 700, sz: 500, dir: "Close Short", time: 40 },
      { coin: "BTC", px: 60_000, sz: 100, dir: "Open Long", time: 10 + 2 * HOUR },
    ]);
    expect(firstAt).toBe(10);
    expect(bets.map((bet) => [bet.coin, bet.side, Math.round(bet.notionalUsd), bet.fills])).toEqual([
      ["xyz:NVDA", "short", 3_000_000, 1],
      ["ZEC", "short", 1_410_000, 2],
    ]);
    expect(bets[1].entryPx).toBe(705);
  });

  it("has nothing to say without an opening perp fill", () => {
    expect(openingBets([{ coin: "@107", px: 40, sz: 10, dir: "Buy", time: 1 }])).toEqual({ firstAt: null, bets: [] });
  });
});

describe("timing", () => {
  const hourly = (prices: number[], start = 0): Candle[] => prices.map((price, index) => ({ t: start + index * HOUR, o: price, h: price * 1.01, l: price * 0.99, c: price }));

  it("places the entry in the range of the bars before it", () => {
    const candles = hourly(Array.from({ length: 48 }, (_, index) => 100 + index));
    const timing = rangeTiming(candles, 100);
    expect(timing?.position).toBeCloseTo((100 - 99) / (147 * 1.01 - 99), 6);
    expect(timing?.days).toBe(2);
  });

  it("reads a redenominated market only from after the jump", () => {
    const before = Array.from({ length: 30 }, () => 800);
    const after = Array.from({ length: 30 }, (_, index) => 80 + index);
    const timing = rangeTiming(hourly([...before, ...after]), 80);
    expect(timing?.low).toBeCloseTo(79.2);
    expect(timing?.days).toBeCloseTo(1.3, 1);
    /* Without the cut, an entry at 80 would have looked like the bottom of an 800 range. */
  });

  it("says nothing with under a day of bars, or an entry far outside the range", () => {
    expect(rangeTiming(hourly(Array.from({ length: 10 }, () => 100)), 100)).toBeNull();
    expect(rangeTiming(hourly(Array.from({ length: 48 }, (_, index) => 100 + index)), 500)).toBeNull();
  });
});

describe("assess", () => {
  it("flags a wallet funded seconds before a big first bet, with its funding and leverage", () => {
    const result = assess({ address: WALLET, ledger, fills, now: T + 2 * HOUR });
    expect(result.kind).toBe("flagged");
    if (result.kind !== "flagged") return;
    const finding = result.finding;
    expect(finding.setupMs).toBe(12_000);
    expect(finding.bet.coin).toBe("BTC");
    expect(finding.bet.side).toBe("long");
    expect(Math.round(finding.bet.notionalUsd)).toBe(120 * 79706 + 80 * 79745);
    /* Only the money in by the end of the first hour counts: the later top-up does not. */
    expect(finding.funding).toHaveLength(2);
    expect(finding.fundedUsd).toBeCloseTo(3_999_999.6, 1);
    expect(finding.leverage).toBeCloseTo(3.99, 2);
    expect(finding.concentration).toBe(1);
    expect(finding.windowComplete).toBe(true);
  });

  it("waits while the first hour is still running and the bet is still small", () => {
    const small: Fill[] = [{ coin: "BTC", px: 80_000, sz: 5, dir: "Open Long", time: T + 12_000 }];
    expect(assess({ address: WALLET, ledger, fills: small, now: T + 30 * 60_000 }).kind).toBe("later");
    expect(assess({ address: WALLET, ledger, fills: small, now: T + 2 * HOUR })).toEqual({ kind: "passed", reason: "small_bet" });
  });

  it("flags a big bet before its hour is over, marked as still open", () => {
    const result = assess({ address: WALLET, ledger, fills, now: T + 60_000 });
    expect(result.kind === "flagged" && result.finding.windowComplete).toBe(false);
  });

  it("passes an older wallet, a sub-account, and one that never traded a perp", () => {
    const old = ledgerEntries([{ time: T - 10 * 24 * HOUR, delta: { type: "deposit", usdc: "10" } }, ...ledger]);
    expect(assess({ address: WALLET, ledger: old, fills, now: T + 2 * HOUR })).toEqual({ kind: "passed", reason: "older_wallet" });
    const sub = ledgerEntries([{ time: T - 1000, delta: { type: "subAccountTransfer", usdc: "5000000", user: FUNDER, destination: WALLET } }]);
    expect(assess({ address: WALLET, ledger: sub, fills, now: T + 2 * HOUR })).toEqual({ kind: "passed", reason: "sub_account" });
    const spot: Fill[] = [{ coin: "@142", px: 60_000, sz: 30, dir: "Sell", time: T + 1000 }];
    expect(assess({ address: WALLET, ledger, fills: spot, now: T + HOUR }).kind).toBe("later");
    expect(assess({ address: WALLET, ledger, fills: spot, now: T + 30 * HOUR })).toEqual({ kind: "passed", reason: "no_perp_trade" });
  });
});

function walletFrom(now: number, detectedAt: string, extra: Partial<InsiderWallet> = {}): InsiderWallet {
  const result = assess({ address: WALLET, ledger, fills, now });
  if (result.kind !== "flagged") throw new Error("expected a flag");
  return { ...result.finding, detectedAt, markPx: 59_954, sinceEntryPct: moveInFavour("long", result.finding.bet.entryPx, 59_954), ...extra };
}

describe("notifications", () => {
  const wallet = walletFrom(T + 2 * HOUR, new Date(T + 10 * 60_000).toISOString());

  it("notifies a watch set before the wallet was found, at or above its size, found within a day", () => {
    expect(notifies(wallet, { minUsd: 1_000_000, since: new Date(T - HOUR).toISOString() })).toBe(true);
    expect(notifies(wallet, { minUsd: 25_000_000, since: new Date(T - HOUR).toISOString() })).toBe(false);
    expect(notifies(wallet, { minUsd: 1_000_000, since: new Date(T + HOUR).toISOString() })).toBe(false);
    expect(notifies(wallet, null)).toBe(false);
    const late = { ...wallet, detectedAt: new Date(T + (INSIDER_RULES.notifyWithinHours + 1) * HOUR).toISOString() };
    expect(foundInTime(late)).toBe(false);
    expect(notifies(late, { minUsd: 1_000_000, since: new Date(T - HOUR).toISOString() })).toBe(false);
  });

  it("merges into the bell's list by time", () => {
    const extra: NotificationItem[] = [
      { id: "insider:a", category: "insider", title: "Fresh wallet, big first trade", description: "", at: "2026-11-02T00:00:00.000Z", target: null },
    ];
    const events = [{ id: "alert:1", kind: "alert" as const, text: "SOL", at: "2026-11-01T00:00:00.000Z", status: "confirmed" as const, href: null, agent: false, attention: true }];
    expect(notificationsFrom(events, extra).map((item) => item.id)).toEqual(["insider:a", "alert:1"]);
    expect(notificationsFrom(events).map((item) => item.id)).toEqual(["alert:1"]);
  });
});

describe("words", () => {
  const wallet = walletFrom(T + 2 * HOUR, new Date(T + 10 * 60_000).toISOString(), {
    timing: { days: 7, low: 79_184, high: 84_850, position: 0.0948 },
  });

  it("says what the wallet did, in its own figures", () => {
    expect(betHeadline(wallet.bet)).toBe("Went long $15.9M of BTC");
    expect(setupLine(wallet.setupMs)).toBe("First trade 12 seconds after the wallet was funded.");
    expect(setupLine(1_000)).toBe("First trade 1 second after the wallet was funded.");
    expect(setupLine(11 * 60_000)).toBe("First trade 11 minutes after the wallet was funded.");
    expect(setupLine(66 * HOUR)).toBe("First trade 66 hours after the wallet was funded.");
    expect(fundingLine(wallet)).toBe("$4.00M was sent in before the bet, first from another Hyperliquid account, 0x6b9e…0a24.");
    expect(leverageLine(wallet)).toBe("The bet was 4.0× the money sent in.");
    expect(timingLine(wallet)).toBe("Bought within the lowest 9% of the previous 7 days' range.");
    expect(concentrationLine(wallet)).toBe("Nothing else was opened in its first hour.");
    expect(sinceLine(wallet)).toBe("BTC has fallen 24.8% since this long was opened.");
  });

  it("says a short's move the right way round", () => {
    const short = { ...wallet, bet: { ...wallet.bet, side: "short" as const, coin: "xyz:NVDA" }, sinceEntryPct: 1.1 };
    expect(sinceLine(short)).toBe("NVDA · trade[XYZ] has fallen 1.1% since this short was opened.");
    expect(timingLine({ ...short, timing: { days: 7, low: 100, high: 200, position: 1.1 } })).toBe("Sold above the high of the previous 7 days.");
    expect(marketName("km:GOLD")).toBe("GOLD · km");
  });
});

describe("the wallet now", () => {
  it("reads positions and the account value from clearinghouseState", () => {
    const state = walletState({
      marginSummary: { accountValue: "1667360.80" },
      assetPositions: [
        { position: { coin: "BTC", szi: "200.0", entryPx: "79721.1", positionValue: "11990800.0", unrealizedPnl: "-3953430.54", liquidationPx: "40247.78", leverage: { type: "cross", value: 20 } } },
        { position: { coin: "ETH", szi: "0" } },
        { position: { coin: "SOL", szi: "-10", entryPx: null, positionValue: "1500", unrealizedPnl: "12", liquidationPx: null } },
      ],
    });
    expect(state.accountValueUsd).toBeCloseTo(1_667_360.8);
    expect(state.positions).toEqual([
      { coin: "BTC", side: "long", size: 200, entryPx: 79721.1, valueUsd: 11_990_800, unrealizedUsd: -3_953_430.54, leverage: 20, liquidationPx: 40247.78 },
      { coin: "SOL", side: "short", size: 10, entryPx: null, valueUsd: 1500, unrealizedUsd: 12, leverage: null, liquidationPx: null },
    ]);
  });
});
