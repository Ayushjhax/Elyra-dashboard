"use client";

import { useState } from "react";
import { Megaphone, RefreshCw, Users, Zap } from "lucide-react";
import { SkeletonRows } from "@/components/portfolio/primitives";
import { DrawerCard } from "@/components/shell/RouteDrawer";
import { Button } from "@/components/ui/Button";
import { Notice, Segmented } from "@/components/scout/parts";
import { formatCompactUsd, formatRelativeTime } from "@/lib/format";
import { useT } from "@/lib/i18n/client";
import type { FlowWindow, SmartMoneyResponse } from "@/lib/scout/types";
import { useScoutFeed } from "@/lib/scout/useScout";
import { useMinute } from "@/lib/useClock";
import { cn } from "@/lib/utils";

/* ---------------------------------------------------------------------------
   Smart money: what Hyperliquid's most profitable traders just opened, what
   they hold, and the exchanges' own listing announcements — the signals an
   auto-buy can follow. Everything is public data, counted by code.
--------------------------------------------------------------------------- */

export function SmartMoneyTab() {
  const t = useT();
  const now = useMinute();
  const [window, setWindow] = useState<FlowWindow>("6h");
  const feed = useScoutFeed<SmartMoneyResponse>(`/api/scout/smart-money?window=${window}`, { pollMs: 120_000 });
  const board = feed.data;
  const hours = window === "1h" ? 1 : window === "6h" ? 6 : 24;
  /* When Hyperliquid could not be read, empty lists mean nothing: they say so instead of "no signal". */
  const unread = board !== null && board.error !== null;

  return (
    <>
      <div className="flex flex-wrap items-center justify-between gap-2 px-1">
        <Segmented
          label={t("Window")}
          value={window}
          onChange={setWindow}
          options={[
            ["1h", t("1 hour")],
            ["6h", t("6 hours")],
            ["24h", t("24 hours")],
          ]}
        />
        <Button size="sm" variant="ghost" onClick={() => void feed.refresh()} aria-label={t("Refresh")}>
          <RefreshCw size={13} aria-hidden /> {t("Refresh")}
        </Button>
      </div>

      {feed.error !== null && <Notice tone="negative">{feed.error}</Notice>}
      {board?.error && <Notice tone="caution">{board.error}</Notice>}

      <DrawerCard icon={Zap} title={t("Signals")}>
        <div className="flex flex-col gap-2">
          <p className="type-label text-text-secondary">
            {t("A market where at least three of the cohort opened the same side in the window, and few opened the other. Counted by wallet: one whale is one opinion.")}
          </p>
          {feed.loading && board === null ? (
            <SkeletonRows rows={3} />
          ) : unread ? (
            <p className="type-body-sm text-text-secondary">{t("Could not be read just now.")}</p>
          ) : (board?.signals ?? []).length === 0 ? (
            <p className="type-body-sm text-text-secondary">{t("No signal in the last {hours} h. Smart money is not crowding into one side of anything.", { hours })}</p>
          ) : (
            <ul className="flex flex-col divide-y divide-border-subtle">
              {board?.signals.map((signal) => (
                <li key={`${signal.coin}-${signal.side}`} className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-0.5 py-2 first:pt-0 last:pb-0">
                  <span className="flex items-baseline gap-2 whitespace-nowrap">
                    <span className="type-body-sm font-medium text-text-primary">{signal.coin}</span>
                    <span className={cn("type-label", signal.side === "long" ? "text-positive" : "text-negative")}>{signal.side === "long" ? t("Opening longs") : t("Opening shorts")}</span>
                  </span>
                  <span className="type-label whitespace-nowrap text-text-secondary">
                    {t("{wallets} wallets · {against} against · {usd}", { wallets: signal.wallets, against: signal.against, usd: formatCompactUsd(signal.usd) })}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </div>
      </DrawerCard>

      <DrawerCard icon={Users} title={t("What the cohort traded")}>
        <div className="flex flex-col gap-2">
          {board !== null && board.cohort.wallets > 0 && (
            <p className="type-label text-text-muted">
              {t("{read} of {wallets} wallets read", { read: board.cohort.read, wallets: board.cohort.wallets })}
              {board.cohort.at !== null && now !== null && ` · ${formatRelativeTime(board.cohort.at, now, t.locale)}`}
            </p>
          )}
          {feed.loading && board === null ? (
            <SkeletonRows rows={5} />
          ) : unread ? (
            <p className="type-body-sm text-text-secondary">{t("Could not be read just now.")}</p>
          ) : (board?.flows ?? []).length === 0 ? (
            <p className="type-body-sm text-text-secondary">{t("The cohort has not traded in this window.")}</p>
          ) : (
            <ul className="flex flex-col divide-y divide-border-subtle">
              {board?.flows.slice(0, 15).map((flow) => (
                <li key={flow.coin} className="flex flex-col gap-0.5 py-2 first:pt-0 last:pb-0">
                  <div className="flex items-baseline justify-between gap-2">
                    <span className="type-body-sm font-medium text-text-primary">{flow.coin}</span>
                    <span className="type-data-sm tabular-nums text-text-secondary">
                      <span className="text-positive">{formatCompactUsd(flow.boughtUsd)}</span>
                      {" / "}
                      <span className="text-negative">{formatCompactUsd(flow.soldUsd)}</span>
                    </span>
                  </div>
                  <span className="type-label text-text-muted">
                    {t("Opened: {long} long, {short} short · Closed: {closedLong} long, {closedShort} short", {
                      long: flow.openedLong,
                      short: flow.openedShort,
                      closedLong: flow.closedLong,
                      closedShort: flow.closedShort,
                    })}
                  </span>
                </li>
              ))}
            </ul>
          )}
          {(board?.holdings ?? []).length > 0 && (
            <div className="flex flex-col gap-1 border-t border-border-subtle pt-2">
              <h3 className="type-eyebrow text-text-muted">{t("What they hold now")}</h3>
              <ul className="flex flex-wrap gap-1.5">
                {board?.holdings.map((holding) => (
                  <li key={`${holding.coin}-${holding.side}`} className="type-label rounded-chip border border-border-subtle px-2 py-0.5 text-text-secondary">
                    <span className="text-text-primary">{holding.coin}</span>{" "}
                    <span className={holding.side === "LONG" ? "text-positive" : "text-negative"}>{holding.side === "LONG" ? t("long") : t("short")}</span> ·{" "}
                    {typeof holding.of === "number" ? t("{wallets} of {total} wallets", { wallets: holding.wallets, total: holding.of }) : t("{wallets} wallets", { wallets: holding.wallets })}
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>
      </DrawerCard>

      <DrawerCard icon={Megaphone} title={t("Official listing announcements")}>
        <div className="flex flex-col gap-2">
          <p className="type-label text-text-secondary">
            {t("From the exchanges' own feeds, not posts about them. A listing claim in a read is checked against these.")}
          </p>
          {(board?.feeds ?? []).length > 0 && (
            <p className="type-label text-text-muted">
              {board?.feeds.map((entry) => `${entry.exchange} ${entry.ok ? "✓" : "✕"}`).join(" · ")}
            </p>
          )}
          {feed.loading && board === null ? (
            <SkeletonRows rows={3} />
          ) : (board?.announcements ?? []).length === 0 ? (
            <p className="type-body-sm text-text-secondary">{t("No crypto listing announced in the last week.")}</p>
          ) : (
            <ul className="flex flex-col divide-y divide-border-subtle">
              {board?.announcements.map((entry) => (
                <li key={`${entry.exchange}-${entry.url}`} className="flex flex-col gap-0.5 py-2 first:pt-0 last:pb-0">
                  <div className="flex items-baseline justify-between gap-2">
                    <span className={cn("type-eyebrow", entry.kind === "listing" ? "text-positive" : "text-negative")}>
                      {entry.exchange} · {entry.kind === "listing" ? t("Listing") : t("Delisting")}
                    </span>
                    {now !== null && <span className="type-label shrink-0 text-text-muted">{formatRelativeTime(entry.at, now, t.locale)}</span>}
                  </div>
                  <a href={entry.url} target="_blank" rel="noreferrer noopener" className="type-label text-text-primary hover:underline pointer-coarse:-my-2 pointer-coarse:py-2">
                    {entry.title}
                  </a>
                  {entry.coins.length > 0 && <span className="type-label text-accent">{t("Trades on Hyperliquid: {coins}", { coins: entry.coins.join(", ") })}</span>}
                </li>
              ))}
            </ul>
          )}
        </div>
      </DrawerCard>

      {board !== null && (
        <p className="type-label px-1 text-text-muted">
          {t("What the most profitable Hyperliquid traders over 30 days opened, closed and hold, from Hyperliquid's public data. Counted by wallet, not by dollar. Observational, not financial advice.")}
        </p>
      )}
    </>
  );
}
