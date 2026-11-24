import { formatCompactUsd } from "@/lib/format";
import { englishTranslator, type Translator } from "@/lib/i18n/translate";
import { marketName, nearFavouredEnd, shortWallet, type Bet, type InsiderFinding, type InsiderWallet } from "@/lib/insider/analyze";

/* ---------------------------------------------------------------------------
   Insider watch in words — the same sentences on the page, under the bell
   and in a desktop notice. Every figure in them is the finding's own; none
   says what the wallet knew, only what it did.
--------------------------------------------------------------------------- */

const SECOND = 1000;
const MINUTE = 60 * SECOND;
const HOUR = 60 * MINUTE;

/** "Went long $16.0M of BTC" */
export function betHeadline(bet: Bet, t: Translator = englishTranslator): string {
  const values = { amount: formatCompactUsd(bet.notionalUsd), market: marketName(bet.coin) };
  return bet.side === "long" ? t("Went long {amount} of {market}", values) : t("Went short {amount} of {market}", values);
}

/** "long $6.2M of NVDA" — for the list of a first hour's other bets. */
export function betPhrase(bet: Bet, t: Translator = englishTranslator): string {
  const values = { amount: formatCompactUsd(bet.notionalUsd), market: marketName(bet.coin) };
  return bet.side === "long" ? t("long {amount} of {market}", values) : t("short {amount} of {market}", values);
}

/** How long the wallet existed before its first trade. */
export function setupLine(setupMs: number, t: Translator = englishTranslator): string {
  if (setupMs < 2 * MINUTE) {
    const seconds = Math.max(1, Math.round(setupMs / SECOND));
    return seconds === 1 ? t("First trade 1 second after the wallet was funded.") : t("First trade {n} seconds after the wallet was funded.", { n: seconds });
  }
  if (setupMs < 2 * HOUR) return t("First trade {n} minutes after the wallet was funded.", { n: Math.round(setupMs / MINUTE) });
  return t("First trade {n} hours after the wallet was funded.", { n: Math.round(setupMs / HOUR) });
}

export function fundingLine(finding: InsiderFinding, t: Translator = englishTranslator): string | null {
  const first = finding.funding[0];
  if (first === undefined) return null;
  const amount = finding.fundedUsd === null ? null : formatCompactUsd(finding.fundedUsd);
  if (first.kind === "bridge") {
    return amount === null ? t("Funded through Hyperliquid's bridge.") : t("{amount} came in through Hyperliquid's bridge before the bet.", { amount });
  }
  const from = first.from === null ? "" : shortWallet(first.from);
  return amount === null
    ? t("Funded by a transfer from another Hyperliquid account, {from}.", { from })
    : t("{amount} was sent in before the bet, first from another Hyperliquid account, {from}.", { amount, from });
}

export function leverageLine(finding: InsiderFinding, t: Translator = englishTranslator): string | null {
  if (finding.leverage === null || finding.leverage < 1.05) return null;
  return t("The bet was {x}× the money sent in.", { x: finding.leverage < 10 ? finding.leverage.toFixed(1) : Math.round(finding.leverage) });
}

export function timingLine(finding: InsiderFinding, t: Translator = englishTranslator): string | null {
  const timing = finding.timing;
  if (timing === null) return null;
  const near = nearFavouredEnd(finding.bet.side, timing);
  const days = Math.round(timing.days);
  if (near < 0) {
    return finding.bet.side === "long" ? t("Bought below the low of the previous {days} days.", { days }) : t("Sold above the high of the previous {days} days.", { days });
  }
  const pct = Math.max(1, Math.round(near * 100));
  if (near <= 0.15) {
    return finding.bet.side === "long"
      ? t("Bought within the lowest {pct}% of the previous {days} days' range.", { pct, days })
      : t("Sold within the highest {pct}% of the previous {days} days' range.", { pct, days });
  }
  return t("Entry {pct}% of the way up the previous {days} days' range.", { pct: Math.round(timing.position * 100), days });
}

export function concentrationLine(finding: InsiderFinding, t: Translator = englishTranslator): string | null {
  if (finding.otherBets.length === 0) return t("Nothing else was opened in its first hour.");
  const separator = t.locale === "zh-CN" ? "、" : ", ";
  return t("Also in its first hour: {bets}.", { bets: finding.otherBets.map((bet) => betPhrase(bet, t)).join(separator) });
}

/** The live price against the entry, said plainly whichever way it went. */
export function sinceLine(wallet: InsiderWallet, t: Translator = englishTranslator): string | null {
  if (wallet.sinceEntryPct === null) return null;
  const market = marketName(wallet.bet.coin);
  const pct = Math.abs(wallet.sinceEntryPct).toFixed(1);
  const rose = wallet.bet.side === "long" ? wallet.sinceEntryPct >= 0 : wallet.sinceEntryPct < 0;
  if (wallet.bet.side === "long") {
    return rose ? t("{market} has risen {pct}% since this long was opened.", { market, pct }) : t("{market} has fallen {pct}% since this long was opened.", { market, pct });
  }
  return rose ? t("{market} has risen {pct}% since this short was opened.", { market, pct }) : t("{market} has fallen {pct}% since this short was opened.", { market, pct });
}

/** One line for the bell and a desktop notice: who, what, how fast. */
export function noticeText(wallet: InsiderWallet, t: Translator = englishTranslator): { title: string; body: string } {
  return {
    title: t("Fresh wallet, big first trade"),
    body: `${shortWallet(wallet.address)}: ${betHeadline(wallet.bet, t)}. ${setupLine(wallet.setupMs, t)}`,
  };
}
