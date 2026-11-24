"use client";

import { useMemo, useState } from "react";
import { Card, CardHead, useBalancesHidden } from "@/components/portfolio/primitives";
import { InfoTip } from "@/components/shell/RouteDrawer";
import { formatUsd } from "@/lib/format";
import { useT } from "@/lib/i18n/client";
import { calendar, intensity, type CalendarDay, type CurrentReading, type OverviewResponse } from "@/lib/portfolio/performance";
import { cn } from "@/lib/utils";

/* ---------------------------------------------------------------------------
   Daily PnL: the last 90 UTC days, one square each, by week.

   A square is coloured by the day's PnL net of deposits and withdrawals —
   Sage for a gain and Clay for a loss, deeper the larger against the
   period's biggest move — and left plain when it cannot be known (no close
   recorded that day or the day before, or flows that could not be read).
   Unknown is never painted as flat.

   Each square is a button: hovering, focusing or tapping it sets the line
   above the grid, so a day's figure is reachable on a phone, where a
   tooltip never opens.
--------------------------------------------------------------------------- */

const MASK = "••••••";

const POSITIVE = ["", "bg-positive/20", "bg-positive/40", "bg-positive/65", "bg-positive"] as const;
const NEGATIVE = ["", "bg-negative/20", "bg-negative/40", "bg-negative/65", "bg-negative"] as const;

function dayLabel(day: string, locale: string): string {
  return new Date(`${day}T00:00:00Z`).toLocaleDateString(locale === "zh-CN" ? "zh-CN" : "en-US", { month: "short", day: "numeric", timeZone: "UTC" });
}

export function PnlCalendar({
  data,
  current,
  now,
}: {
  data: OverviewResponse | null;
  current: CurrentReading | null;
  now: number | null;
}) {
  const t = useT();
  const hidden = useBalancesHidden();
  const [focused, setFocused] = useState<CalendarDay | null>(null);

  const view = useMemo(() => (data === null || now === null ? null : calendar(data, current, now, 91)), [data, current, now]);
  const usd = (value: number) => (hidden ? MASK : formatUsd(value, { sign: true }));

  const largest = view === null ? 0 : Math.max(0, ...view.days.map((day) => Math.abs(day.pnlUsd ?? 0)));
  /* Monday-first weeks; the first column is padded so weekdays line up. */
  const lead = view === null ? 0 : (new Date(`${view.days[0].day}T00:00:00Z`).getUTCDay() + 6) % 7;
  const summary = view?.summary ?? null;
  const shown = focused ?? view?.days.at(-1) ?? null;

  return (
    <Card className="gap-3 p-4">
      <CardHead
        title={t("Daily PnL")}
        sub={t("Last 90 days, UTC")}
        right={<InfoTip text={t("Each day's change in equity less the money moved in or out that day. A plain square means the day could not be measured: no close was recorded, or its deposits and withdrawals could not be read.")} />}
      />

      <p className="type-data-sm min-h-5 text-text-secondary" aria-live="polite">
        {shown === null
          ? " "
          : shown.pnlUsd === null
            ? t("{day}: not measured", { day: dayLabel(shown.day, t.locale) })
            : shown.provisional
              ? t("{day} so far: {value}", { day: dayLabel(shown.day, t.locale), value: usd(shown.pnlUsd) })
              : t("{day}: {value}", { day: dayLabel(shown.day, t.locale), value: usd(shown.pnlUsd) })}
      </p>

      {view === null ? (
        <div aria-busy="true" aria-label={t("Reading your daily PnL")} className="h-28 animate-pulse rounded-card bg-surface-panel" />
      ) : (
        <div role="group" aria-label={t("Daily PnL calendar")} className="grid grid-flow-col grid-rows-7 justify-start gap-1">
          {Array.from({ length: lead }, (_, index) => (
            <span key={`pad-${index}`} aria-hidden className="size-3.5" />
          ))}
          {view.days.map((day) => {
            const level = intensity(day.pnlUsd, largest);
            const tone = day.pnlUsd === null || level === 0 ? "bg-surface-hover" : day.pnlUsd > 0 ? POSITIVE[level] : NEGATIVE[level];
            return (
              <button
                key={day.day}
                type="button"
                onMouseEnter={() => setFocused(day)}
                onFocus={() => setFocused(day)}
                onClick={() => setFocused(day)}
                aria-label={
                  day.pnlUsd === null
                    ? t("{day}: not measured", { day: dayLabel(day.day, t.locale) })
                    : t("{day}: {value}", { day: dayLabel(day.day, t.locale), value: usd(day.pnlUsd) })
                }
                className={cn(
                  "relative size-3.5 outline-offset-1 after:absolute after:-inset-0.5",
                  tone,
                  day.pnlUsd === null && "border border-dashed border-border-subtle bg-transparent",
                  day.provisional && "ring-1 ring-border-strong",
                )}
              />
            );
          })}
        </div>
      )}

      {summary !== null && (
        <dl className="grid grid-cols-2 gap-x-3 gap-y-2 border-t border-border-subtle pt-3">
          <div>
            <dt className="type-label text-text-muted">{t("Profitable days")}</dt>
            <dd className="type-data-sm text-text-primary">{summary.profitableDays}</dd>
          </div>
          <div>
            <dt className="type-label text-text-muted">{t("Losing days")}</dt>
            <dd className="type-data-sm text-text-primary">{summary.losingDays}</dd>
          </div>
          <div>
            <dt className="type-label text-text-muted">{t("Best day")}</dt>
            <dd className="type-data-sm text-positive">
              {summary.best === null || summary.best.pnlUsd === null ? (
                <span className="text-text-muted">—</span>
              ) : (
                <>
                  {usd(summary.best.pnlUsd)} <span className="type-label text-text-muted">{dayLabel(summary.best.day, t.locale)}</span>
                </>
              )}
            </dd>
          </div>
          <div>
            <dt className="type-label text-text-muted">{t("Worst day")}</dt>
            <dd className="type-data-sm text-negative">
              {summary.worst === null || summary.worst.pnlUsd === null ? (
                <span className="text-text-muted">—</span>
              ) : (
                <>
                  {usd(summary.worst.pnlUsd)} <span className="type-label text-text-muted">{dayLabel(summary.worst.day, t.locale)}</span>
                </>
              )}
            </dd>
          </div>
          {summary.unknownDays > 0 && (
            <p className="type-label col-span-2 text-text-muted">
              {summary.unknownDays === 1 ? t("1 day could not be measured.") : t("{count} days could not be measured.", { count: summary.unknownDays })}
            </p>
          )}
        </dl>
      )}
    </Card>
  );
}
