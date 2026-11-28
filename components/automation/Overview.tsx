"use client";

import { useState } from "react";
import { Bot, Pause, Play } from "lucide-react";
import { Divider, Field, Pair, Problem, Subhead, field } from "@/components/automation/parts";
import { DrawerCard, StatusDot } from "@/components/shell/RouteDrawer";
import { Button } from "@/components/ui/Button";
import { LIMITS } from "@/lib/autotrade/rules";
import type { AutomationResponse } from "@/lib/autotrade/types";
import type { AutomationFeed } from "@/lib/autotrade/useAutomation";
import { useT } from "@/lib/i18n/client";

/* ---------------------------------------------------------------------------
   Automation overview: what the engine is doing and what it may do.

   Two statuses that are independent of each other, side by side: the
   engine — running or paused, the person's switch — and execution — what
   this server can send, paper only or live on a network. Under them, the
   check interval and what is open, then the entry controls grouped: pause,
   the day's loss limit and the open-position cap, saved together.

   The limits are checked here as the server checks them (/api/automation),
   so a value it would refuse is said before it is sent; the server's word is
   still final, and its refusal is shown as it gives it.
--------------------------------------------------------------------------- */

/** The server's own bounds, said before the request rather than after it. */
function limitProblems(limit: string, maxOpen: string, t: ReturnType<typeof useT>) {
  const loss = Number(limit);
  const open = Number(maxOpen);
  return {
    limit:
      limit.trim() === "" || !(loss >= 1 && loss <= LIMITS.maxDailyLossUsd)
        ? t("Enter an amount from $1 to ${max}.", { max: LIMITS.maxDailyLossUsd.toLocaleString("en-US") })
        : null,
    maxOpen:
      maxOpen.trim() === "" || !(Number.isInteger(open) && open >= 1 && open <= LIMITS.maxOpenPositions)
        ? t("Enter a whole number from 1 to {max}.", { max: LIMITS.maxOpenPositions })
        : null,
  };
}

export function Overview({ data, feed }: { data: AutomationResponse; feed: AutomationFeed }) {
  const t = useT();
  const [busy, setBusy] = useState<"pause" | "limits" | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  const [limit, setLimit] = useState(String(data.settings.dailyLossLimitUsd));
  const [maxOpen, setMaxOpen] = useState(String(data.settings.maxOpenPositions));
  /* Problems show once the person has tried to save, then follow their typing. */
  const [checked, setChecked] = useState(false);
  const problems = limitProblems(limit, maxOpen, t);
  const open = data.trades.filter((trade) => trade.status === "open" || trade.status === "opening").length;
  const paused = data.settings.paused;

  const save = async (kind: "pause" | "limits", body: Record<string, unknown>) => {
    setBusy(kind);
    setSaved(false);
    const result = await feed.write("/api/automation", "POST", body);
    setError(result.error);
    if (kind === "limits" && result.error === null) setSaved(true);
    setBusy(null);
  };

  return (
    <DrawerCard icon={Bot} title={t("Overview")}>
      <div className="flex flex-col gap-4">
        <dl className="grid grid-cols-2 gap-3">
          <div className="flex min-w-0 flex-col gap-1 rounded-card border border-border-subtle bg-surface-base px-3 py-2.5">
            <dt className="type-label text-text-muted">{t("Engine")}</dt>
            <dd>{paused ? <StatusDot tone="caution">{t("Paused")}</StatusDot> : <StatusDot tone="positive">{t("Running")}</StatusDot>}</dd>
          </div>
          <div className="flex min-w-0 flex-col gap-1 rounded-card border border-border-subtle bg-surface-base px-3 py-2.5">
            <dt className="type-label text-text-muted">{t("Execution")}</dt>
            <dd>
              {data.live.enabled ? (
                <StatusDot tone="accent">{t("Live on Hyperliquid {network}", { network: data.live.network })}</StatusDot>
              ) : (
                <StatusDot tone="muted">{t("Paper only")}</StatusDot>
              )}
            </dd>
          </div>
        </dl>

        <div className="flex flex-col gap-1">
          <p className="type-body-sm text-text-secondary">
            {data.live.enabled
              ? t("Live rules trade on Hyperliquid {network}. Paper rules trade nothing and record what would have happened.", { network: data.live.network })
              : t("This server sends no live orders: every rule runs on paper and records what would have happened.")}
          </p>
          <p className="type-label tabular-nums text-text-muted">
            {t("Checked every five minutes")} · {open === 1 ? t("1 position open") : t("{count} positions open", { count: open })}
          </p>
        </div>

        <section aria-labelledby="automation-entries" className="flex flex-col gap-3 rounded-card border border-border-subtle bg-surface-base p-3">
          <Subhead id="automation-entries" title={t("Entries and limits")} />
          <div className="flex flex-col gap-1.5">
            <div>
              <Button
                size="sm"
                variant={paused ? "accent" : "danger"}
                disabled={busy !== null}
                aria-pressed={paused}
                onClick={() => void save("pause", { paused: !paused })}
              >
                {paused ? <Play size={14} aria-hidden /> : <Pause size={14} aria-hidden />}
                {busy === "pause" ? t("Saving…") : paused ? t("Resume entries") : t("Pause all entries")}
              </Button>
            </div>
            <p className="type-label text-text-secondary">
              {t("Pausing stops every new entry: rules at their next check, and Trade now and new limit orders at once. Open positions keep their take-profit, stop-loss and exit rule, and you can still close them by hand. Orders already resting — live on Hyperliquid or on paper — can still fill; cancel them under Order entry.")}
            </p>
          </div>

          <Divider />

          <form
            noValidate
            className="flex flex-col gap-3"
            onSubmit={(event) => {
              event.preventDefault();
              setChecked(true);
              if (problems.limit !== null || problems.maxOpen !== null) return;
              void save("limits", { dailyLossLimitUsd: Number(limit), maxOpenPositions: Number(maxOpen) });
            }}
          >
            <Pair>
              <Field id="auto-loss" label={t("Daily loss limit ($)")} problem={checked ? problems.limit : null}>
                <input
                  id="auto-loss"
                  inputMode="decimal"
                  className={field}
                  value={limit}
                  aria-invalid={checked && problems.limit !== null}
                  aria-describedby={checked && problems.limit !== null ? "auto-loss-problem" : undefined}
                  onChange={(event) => {
                    setLimit(event.target.value);
                    setSaved(false);
                  }}
                />
              </Field>
              <Field id="auto-open" label={t("Max open positions")} problem={checked ? problems.maxOpen : null}>
                <input
                  id="auto-open"
                  inputMode="numeric"
                  className={field}
                  value={maxOpen}
                  aria-invalid={checked && problems.maxOpen !== null}
                  aria-describedby={checked && problems.maxOpen !== null ? "auto-open-problem" : undefined}
                  onChange={(event) => {
                    setMaxOpen(event.target.value);
                    setSaved(false);
                  }}
                />
              </Field>
            </Pair>
            <p className="type-label text-text-muted">{t("Past the day's loss limit no rule enters again until 00:00 UTC.")}</p>
            <div className="flex flex-wrap items-center gap-3">
              <Button size="sm" type="submit" disabled={busy !== null}>
                {busy === "limits" ? t("Saving…") : t("Save limits")}
              </Button>
              {saved && (
                <span role="status" className="type-label text-positive">
                  {t("Limits saved.")}
                </span>
              )}
            </div>
          </form>
          <Problem text={error} />
        </section>

        <p className="type-label text-text-muted">
          {t("Every entry, exit and failure is sent to your notifications, your phone and your linked Telegram chat, whatever your alert settings.")}
        </p>
      </div>
    </DrawerCard>
  );
}
