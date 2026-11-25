"use client";

import { useEffect, useState, useSyncExternalStore } from "react";
import { useSearchParams } from "next/navigation";
import { Bell, BellOff, Check, Copy, ExternalLink, Monitor, Radar, RefreshCw } from "lucide-react";
import { Choices, Problem, SignIn } from "@/components/research/shared";
import { useCopy } from "@/lib/clipboard";
import { formatCompactUsd, formatPriceUsd, formatRelativeTime } from "@/lib/format";
import { useT } from "@/lib/i18n/client";
import { intlLocale } from "@/lib/i18n/locales";
import type { Translator } from "@/lib/i18n/translate";
import { desktopState, disableDesktop, enableDesktop, subscribeDesktop, type DesktopState } from "@/lib/insider/desktop";
import { EXPLORER, foundInTime, INSIDER_RULES, marketName, shortWallet, WATCH_MINIMUMS, type InsiderWallet, type WalletNow, type WalletPosition } from "@/lib/insider/analyze";
import { useInsider, type InsiderStore } from "@/lib/insider/useInsider";
import { betHeadline, concentrationLine, fundingLine, leverageLine, setupLine, sinceLine, timingLine } from "@/lib/insider/words";
import { useMinute } from "@/lib/useClock";
import { cn } from "@/lib/utils";

/* ---------------------------------------------------------------------------
   Insider watch: fresh Hyperliquid wallets whose first trade was big — a
   wallet funded and, within hours or seconds, holding a seven- or
   eight-figure position. Found by the five-minute scan (lib/insider), each
   described by code from Hyperliquid's own records, and shown with how the
   bet has gone since, whichever way it went.

   A person can ask to be told: the bell shows each new one at or above the
   size they chose, on the website only, and a desktop notice too if they
   allow it in this browser. It is a pattern, not proof, and the page says
   so before anything else. Nothing here trades.
--------------------------------------------------------------------------- */

const HOUR = 3_600_000;

function WatchCard({ feed }: { feed: InsiderStore }) {
  const t = useT();
  const watch = feed.data?.watch ?? null;
  /* With a watch on, the size shown is the saved one; before, the one picked. */
  const [picked, setPicked] = useState<number>(WATCH_MINIMUMS[0]);
  const size = watch?.minUsd ?? picked;
  const [busy, setBusy] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);
  const desktop = useSyncExternalStore<DesktopState>(subscribeDesktop, desktopState, () => "unsupported");

  if (!feed.signedIn) return <SignIn>{t("Sign in to be told when Elyra flags one.")}</SignIn>;

  const save = async (minUsd: number | null) => {
    setBusy(true);
    setProblem(null);
    const result = await feed.setWatch(minUsd);
    setBusy(false);
    if (result.error !== null) setProblem(result.error);
  };
  const options = WATCH_MINIMUMS.map((value) => ({ value, label: formatCompactUsd(value) }));

  return (
    <section aria-labelledby="insider-watch" className="flex flex-col gap-3 rounded-card border border-border-subtle bg-surface-raised p-4">
      {/* Research's h2 carries a bottom margin meant for section titles; a card's title has none. */}
      <h2 id="insider-watch" className="type-h2 flex items-center gap-2 text-text-primary" style={{ marginBottom: 0 }}>
        {watch === null ? <BellOff size={16} strokeWidth={1.5} aria-hidden className="text-text-muted" /> : <Bell size={16} strokeWidth={1.5} aria-hidden className="text-accent" />}
        {watch === null ? t("Notify me") : t("Notifications are on")}
      </h2>
      <p className="type-body-sm text-text-secondary">
        {watch === null
          ? t("Get a notification under the bell when Elyra flags a fresh wallet whose first bet is at least:")
          : t("Each new wallet whose first bet is at least {amount} appears under the bell, on this website.", { amount: formatCompactUsd(watch.minUsd) })}
      </p>
      <div className="flex flex-wrap items-center gap-2">
        <Choices
          label={t("Smallest first bet")}
          value={size}
          options={options}
          onChange={(value) => {
            setPicked(value);
            if (watch !== null) void save(value);
          }}
        />
        {watch === null ? (
          <button type="button" className="r-button r-primary" disabled={busy || feed.data === null} onClick={() => void save(size)}>
            <Bell size={14} strokeWidth={1.5} aria-hidden /> {t("Turn on")}
          </button>
        ) : (
          <button type="button" className="r-button" disabled={busy} onClick={() => void save(null)}>
            <BellOff size={14} strokeWidth={1.5} aria-hidden /> {t("Turn off")}
          </button>
        )}
      </div>
      {watch !== null && desktop !== "unsupported" && (
        <div className="flex flex-wrap items-center gap-2 border-t border-border-subtle pt-3">
          <Monitor size={14} strokeWidth={1.5} aria-hidden className="text-text-muted" />
          {desktop === "denied" ? (
            <span className="type-label text-text-secondary">{t("This browser blocks notifications from Elyra. Allow them in its site settings to get desktop notices.")}</span>
          ) : desktop === "on" ? (
            <>
              <span className="type-label text-text-secondary">{t("Desktop notices are on in this browser while Elyra is open.")}</span>
              <button type="button" className="r-button" onClick={() => disableDesktop()}>
                {t("Turn off desktop notices")}
              </button>
            </>
          ) : (
            <>
              <span className="type-label text-text-secondary">{t("Also show a desktop notice while Elyra is open in this browser.")}</span>
              <button type="button" className="r-button" onClick={() => void enableDesktop()}>
                {t("Turn on desktop notices")}
              </button>
            </>
          )}
        </div>
      )}
      {problem !== null && (
        <p role="alert" className="type-label text-negative">
          {t(problem)}
        </p>
      )}
    </section>
  );
}

function positionLine(position: WalletPosition, t: Translator): string {
  const size = position.size.toLocaleString(intlLocale(t.locale), { maximumFractionDigits: 4 });
  const market = marketName(position.coin);
  const parts = [position.side === "long" ? t("Long {size} {market}", { size, market }) : t("Short {size} {market}", { size, market })];
  if (position.entryPx !== null) parts.push(t("entry {price}", { price: formatPriceUsd(position.entryPx) }));
  parts.push(t("worth {value}", { value: formatCompactUsd(position.valueUsd) }));
  parts.push(t("{pnl} unrealised", { pnl: `${position.unrealizedUsd >= 0 ? "+" : ""}${formatCompactUsd(position.unrealizedUsd)}` }));
  if (position.liquidationPx !== null) parts.push(t("liquidation at {price}", { price: formatPriceUsd(position.liquidationPx) }));
  return parts.join(" · ");
}

function PositionsNow({ address }: { address: string }) {
  const t = useT();
  const [state, setState] = useState<{ now: WalletNow | null; error: string | null; loading: boolean }>({ now: null, error: null, loading: true });
  const [attempt, setAttempt] = useState(0);
  useEffect(() => {
    let cancelled = false;
    fetch(`/api/insider/${address}`, { cache: "no-store" })
      .then(async (response) => {
        const body = (await response.json()) as { now?: WalletNow; error?: string };
        if (cancelled) return;
        setState(response.ok && body.now !== undefined ? { now: body.now, error: null, loading: false } : { now: null, error: body.error ?? "Hyperliquid did not answer. Try again.", loading: false });
      })
      .catch(() => !cancelled && setState({ now: null, error: "Hyperliquid did not answer. Try again.", loading: false }));
    return () => {
      cancelled = true;
    };
  }, [address, attempt]);

  if (state.loading) return <p className="type-label text-text-muted">{t("Reading Hyperliquid…")}</p>;
  if (state.error !== null || state.now === null) {
    return (
      <Problem
        retry={() => {
          setState({ now: null, error: null, loading: true });
          setAttempt((value) => value + 1);
        }}
      >
        {state.error ?? ""}
      </Problem>
    );
  }
  const now = state.now;
  return (
    <div className="flex flex-col gap-1">
      <p className="type-label text-text-secondary">{t("Account value now: {value}.", { value: formatCompactUsd(now.accountValueUsd) })}</p>
      {now.positions.length === 0 ? (
        <p className="type-label text-text-secondary">{t("No open positions now.")}</p>
      ) : (
        <ul className="flex flex-col gap-0.5">
          {now.positions.slice(0, 8).map((position) => (
            <li key={`${position.coin}:${position.side}`} className={cn("type-data-sm", position.unrealizedUsd >= 0 ? "text-text-primary" : "text-text-secondary")}>
              {positionLine(position, t)}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function WalletCard({ wallet, now, highlighted }: { wallet: InsiderWallet; now: number | null; highlighted: boolean }) {
  const t = useT();
  const { state: copied, copy } = useCopy();
  const [open, setOpen] = useState(false);
  const facts = [setupLine(wallet.setupMs, t), fundingLine(wallet, t), leverageLine(wallet, t), timingLine(wallet, t), concentrationLine(wallet, t)].filter((line): line is string => line !== null);
  const since = sinceLine(wallet, t);
  const lateHours = Math.round((Date.parse(wallet.detectedAt) - Date.parse(wallet.firstTradeAt)) / HOUR);

  return (
    <li id={`insider-${wallet.address}`} className={cn("flex flex-col gap-2 rounded-card border bg-surface-raised p-4", highlighted ? "border-accent" : "border-border-subtle")}>
      <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
        <span className="type-eyebrow uppercase text-text-muted">
          {wallet.bet.side === "long" ? t("Long") : t("Short")} · {marketName(wallet.bet.coin)}
        </span>
        {now !== null && (
          <time dateTime={wallet.firstTradeAt} className="type-label tabular-nums text-text-muted">
            {t("First trade {when}", { when: formatRelativeTime(wallet.firstTradeAt, now, t.locale) })}
          </time>
        )}
      </div>
      <h3 className="type-h2 text-text-primary">{betHeadline(wallet.bet, t)}</h3>
      <p className="type-label text-text-secondary">
        {t("Average entry {price} over {fills} fills.", { price: formatPriceUsd(wallet.bet.entryPx), fills: wallet.bet.fills })}
      </p>
      <div className="flex flex-wrap items-center gap-2">
        <span className="type-data-sm text-text-primary" title={wallet.address}>
          {shortWallet(wallet.address)}
        </span>
        <button type="button" className="r-button" onClick={() => void copy(wallet.address)} aria-label={t("Copy the wallet's address")}>
          {copied === "copied" ? <Check size={14} strokeWidth={1.5} aria-hidden /> : <Copy size={14} strokeWidth={1.5} aria-hidden />}
          {copied === "copied" ? t("Copied") : t("Copy")}
        </button>
        <a className="r-button" href={`${EXPLORER}${wallet.address}`} target="_blank" rel="noopener noreferrer">
          <ExternalLink size={14} strokeWidth={1.5} aria-hidden />
          {t("Open on Hyperliquid")}
        </a>
      </div>
      <ul className="flex list-disc flex-col gap-1 pl-5">
        {facts.map((fact) => (
          <li key={fact} className="type-body-sm text-text-secondary">
            {fact}
          </li>
        ))}
      </ul>
      {since !== null && (
        <p className={cn("type-body-sm", (wallet.sinceEntryPct ?? 0) >= 0 ? "text-positive" : "text-negative")}>
          {since}
        </p>
      )}
      {!foundInTime(wallet) && (
        <p className="type-label text-text-muted">{t("Found {hours} hours after its first trade, so it was listed without a notification.", { hours: lateHours })}</p>
      )}
      <details
        onToggle={(event) => setOpen((event.currentTarget as HTMLDetailsElement).open)}
        className="border-t border-border-subtle pt-2"
      >
        <summary className="type-label cursor-pointer text-text-muted hover:text-text-primary">{t("Positions now")}</summary>
        <div className="mt-2">{open && <PositionsNow address={wallet.address} />}</div>
      </details>
    </li>
  );
}

export function InsiderTab({ active }: { active: boolean }) {
  const t = useT();
  const feed = useInsider({ poll: active });
  const now = useMinute();
  const params = useSearchParams();
  const highlighted = params.get("wallet")?.toLowerCase() ?? null;
  const wallets = feed.data?.wallets ?? [];
  const scan = feed.data?.scan ?? null;
  const ready = feed.data !== null;

  /* Opened from the bell: bring that wallet into view once it is on the page. */
  useEffect(() => {
    if (!active || highlighted === null || !ready) return;
    document.getElementById(`insider-${highlighted}`)?.scrollIntoView({ block: "center" });
  }, [active, highlighted, ready]);

  return (
    <div className="flex flex-col gap-4">
      <div className="r-toolbar">
        <p className="type-body-sm min-w-0 flex-1 text-text-secondary">
          {t("New Hyperliquid wallets whose first trade was big: funded, then holding at least {amount} within the hour. Elyra checks Hyperliquid's public records every five minutes.", {
            amount: formatCompactUsd(INSIDER_RULES.minBetUsd),
          })}
        </p>
        <button type="button" className="r-button" onClick={() => void feed.refresh()} disabled={feed.loading}>
          <RefreshCw size={14} strokeWidth={1.5} aria-hidden className={cn(feed.loading && "motion-safe:animate-spin")} />
          {t("Refresh")}
        </button>
      </div>

      <p className="type-label rounded-card border border-border-subtle bg-surface-base px-3 py-2 text-caution">
        {t("A pattern, not proof. A fresh wallet with a big first trade can be a trader's new account, a fund, a hedge or luck. Nobody here is accused of anything, and none of this is advice.")}
      </p>

      <WatchCard feed={feed} />

      {feed.error !== null && <Problem retry={() => void feed.refresh()}>{feed.error}</Problem>}
      {feed.data?.error && <Problem>{feed.data.error}</Problem>}

      {now !== null && ready && (
        <p className="type-label text-text-muted">
          {scan === null
            ? t("No scan has run yet. The first runs on the next five-minute tick.")
            : t("Last checked {when}: {checked} new wallets read, {flagged} flagged.", { when: formatRelativeTime(scan.at, now, t.locale), checked: scan.checked, flagged: scan.flagged })}
        </p>
      )}

      {!ready && feed.loading ? (
        <p className="type-body-sm text-text-muted">{t("Loading insider watch…")}</p>
      ) : wallets.length === 0 && feed.data?.error == null ? (
        <div className="r-empty">
          <Radar size={22} strokeWidth={1.5} aria-hidden />
          <h3>{t("No fresh wallet has matched in the last 30 days")}</h3>
          <p className="type-body-sm text-text-secondary">{t("When one does, it appears here first.")}</p>
        </div>
      ) : (
        <ul className="flex flex-col gap-3">
          {wallets.map((wallet) => (
            <WalletCard key={wallet.address} wallet={wallet} now={now} highlighted={wallet.address === highlighted} />
          ))}
        </ul>
      )}

      <p className="type-label text-text-muted">
        {t("Flagged when the wallet's first activity is at most {hours} hours before its first perp trade and its largest bet in that first hour is at least {amount}. Where the entry sat is read from Hyperliquid's hourly candles for the week before. The move since uses the live price.", {
          hours: INSIDER_RULES.maxSetupHours,
          amount: formatCompactUsd(INSIDER_RULES.minBetUsd),
        })}
      </p>
    </div>
  );
}
