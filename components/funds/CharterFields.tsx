"use client";

import { MARKET_GROUP_LABEL, PERP_MARKETS, type MarketGroup } from "@/lib/autotrade/rules";
import { field } from "@/components/funds/parts";
import { FUND_LIMITS } from "@/lib/funds/policy";
import type { FundCharter } from "@/lib/funds/types";
import { cn } from "@/lib/utils";

/* ---------------------------------------------------------------------------
   A charter, as the person writes it: the brief, the markets and the risk
   limits. Used to launch a fund and to change one. The numbers are typed as
   text and sent as numbers; the server's `validateCharter` is the judge,
   and its message is what the person sees.
--------------------------------------------------------------------------- */

export interface CharterDraft {
  name: string;
  objective: string;
  markets: string[];
  allowShorts: boolean;
  maxPositionPct: string;
  maxGrossExposure: string;
  maxLeverage: string;
  maxPositions: string;
  maxDrawdownPct: string;
  dailyLossPct: string;
}

export function draftOf(charter: Omit<FundCharter, "name" | "objective"> & { name?: string; objective?: string }): CharterDraft {
  return {
    name: charter.name ?? "",
    objective: charter.objective ?? "",
    markets: [...charter.markets],
    allowShorts: charter.allowShorts,
    maxPositionPct: String(charter.maxPositionPct),
    maxGrossExposure: String(charter.maxGrossExposure),
    maxLeverage: String(charter.maxLeverage),
    maxPositions: String(charter.maxPositions),
    maxDrawdownPct: String(charter.maxDrawdownPct),
    dailyLossPct: String(charter.dailyLossPct),
  };
}

export function charterBody(draft: CharterDraft): Record<string, unknown> {
  const number = (value: string) => Number(value.trim());
  return {
    name: draft.name,
    objective: draft.objective,
    markets: draft.markets,
    allowShorts: draft.allowShorts,
    maxPositionPct: number(draft.maxPositionPct),
    maxGrossExposure: number(draft.maxGrossExposure),
    maxLeverage: number(draft.maxLeverage),
    maxPositions: number(draft.maxPositions),
    maxDrawdownPct: number(draft.maxDrawdownPct),
    dailyLossPct: number(draft.dailyLossPct),
  };
}

const GROUPS: readonly MarketGroup[] = ["crypto", "meme", "nasdaq"];

function NumberField({ label, hint, value, onChange, suffix }: { label: string; hint: string; value: string; onChange: (value: string) => void; suffix: string }) {
  return (
    <label className="flex min-w-0 flex-col gap-1">
      <span className="type-label text-text-secondary">{label}</span>
      <span className="relative">
        <input inputMode="decimal" className={cn(field, "pr-9")} value={value} onChange={(event) => onChange(event.target.value)} />
        <span className="type-label pointer-events-none absolute inset-y-0 right-3 flex items-center text-text-muted">{suffix}</span>
      </span>
      <span className="type-label text-text-muted">{hint}</span>
    </label>
  );
}

export function CharterFields({ draft, onChange, withName = true }: { draft: CharterDraft; onChange: (draft: CharterDraft) => void; withName?: boolean }) {
  const set = <K extends keyof CharterDraft>(key: K, value: CharterDraft[K]) => onChange({ ...draft, [key]: value });
  const toggle = (coin: string) => set("markets", draft.markets.includes(coin) ? draft.markets.filter((entry) => entry !== coin) : [...draft.markets, coin]);

  return (
    <div className="flex flex-col gap-4">
      {withName && (
        <label className="flex flex-col gap-1">
          <span className="type-label text-text-secondary">Name</span>
          <input className={field} maxLength={FUND_LIMITS.maxNameChars} value={draft.name} onChange={(event) => set("name", event.target.value)} placeholder="Trend book" />
        </label>
      )}
      <label className="flex flex-col gap-1">
        <span className="type-label text-text-secondary">The manager&apos;s brief</span>
        <textarea
          className={cn(field, "h-auto min-h-24 py-2 leading-relaxed")}
          maxLength={FUND_LIMITS.maxObjectiveChars}
          value={draft.objective}
          onChange={(event) => set("objective", event.target.value)}
          placeholder="What the fund is for and how it should trade. For example: follow multi-day trends in BTC and ETH, long or short; never more than two positions; cut a loser at its stop rather than averaging down."
        />
        <span className="type-label text-text-muted">
          The AI manager reads this first, every time. {draft.objective.length}/{FUND_LIMITS.maxObjectiveChars.toLocaleString("en-US")}
        </span>
      </label>

      <fieldset className="flex flex-col gap-2">
        <legend className="type-label mb-1 text-text-secondary">Markets it may trade · {draft.markets.length} chosen</legend>
        {GROUPS.map((group) => (
          <div key={group} className="flex flex-col gap-1.5">
            <span className="type-eyebrow text-text-muted">{MARKET_GROUP_LABEL[group]}</span>
            <div className="flex flex-wrap gap-1.5">
              {PERP_MARKETS.filter((market) => market.group === group).map((market) => {
                const on = draft.markets.includes(market.coin);
                return (
                  <button
                    key={market.coin}
                    type="button"
                    aria-pressed={on}
                    onClick={() => toggle(market.coin)}
                    className={cn(
                      "type-data-sm h-8 rounded-chip border px-2.5 transition-colors",
                      on ? "border-border-accent bg-accent-quiet text-text-primary" : "border-border-subtle bg-surface-base text-text-secondary hover:bg-surface-hover",
                    )}
                  >
                    {market.coin.replace(/^xyz:/, "")}
                  </button>
                );
              })}
            </div>
          </div>
        ))}
      </fieldset>

      <label className="flex items-center gap-2.5">
        <input type="checkbox" className="size-4 accent-[var(--accent)]" checked={draft.allowShorts} onChange={(event) => set("allowShorts", event.target.checked)} />
        <span className="type-body-sm text-text-primary">May sell short</span>
        <span className="type-label text-text-muted">— a hedge fund&apos;s other half</span>
      </label>

      <div className="grid grid-cols-2 gap-3 @max-[380px]:grid-cols-1">
        <NumberField label="Largest position" hint={`of NAV · ${FUND_LIMITS.minPositionPct}–${FUND_LIMITS.maxPositionPct}%`} value={draft.maxPositionPct} onChange={(value) => set("maxPositionPct", value)} suffix="%" />
        <NumberField label="Gross exposure" hint={`all positions, × NAV · up to ${FUND_LIMITS.maxGrossExposure}×`} value={draft.maxGrossExposure} onChange={(value) => set("maxGrossExposure", value)} suffix="×" />
        <NumberField label="Leverage" hint={`per position · 1–${FUND_LIMITS.maxLeverage}x`} value={draft.maxLeverage} onChange={(value) => set("maxLeverage", value)} suffix="x" />
        <NumberField label="Open positions" hint={`at once · 1–${FUND_LIMITS.maxPositions}`} value={draft.maxPositions} onChange={(value) => set("maxPositions", value)} suffix="#" />
        <NumberField
          label="Halt at drawdown"
          hint={`from its high · ${FUND_LIMITS.minDrawdownPct}–${FUND_LIMITS.maxDrawdownPct}%. Elyra closes everything.`}
          value={draft.maxDrawdownPct}
          onChange={(value) => set("maxDrawdownPct", value)}
          suffix="%"
        />
        <NumberField
          label="Daily loss limit"
          hint={`nothing new until 00:00 UTC · ${FUND_LIMITS.minDailyLossPct}–${FUND_LIMITS.maxDailyLossPct}%`}
          value={draft.dailyLossPct}
          onChange={(value) => set("dailyLossPct", value)}
          suffix="%"
        />
      </div>
    </div>
  );
}
