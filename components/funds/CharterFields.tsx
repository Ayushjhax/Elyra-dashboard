"use client";

import { useId } from "react";
import { Check } from "lucide-react";
import { MARKET_GROUP_LABEL, PERP_MARKETS, type MarketGroup } from "@/lib/autotrade/rules";
import { field } from "@/components/funds/parts";
import type { CharterDraft, DraftProblems } from "@/lib/funds/draft";
import { FUND_LIMITS } from "@/lib/funds/policy";
import { cn } from "@/lib/utils";
import { useT } from "@/lib/i18n/client";

/* ---------------------------------------------------------------------------
   A charter, as the person writes it, in two parts: what the fund is for
   (name, brief, markets) and how far it may go (shorts, size, exposure,
   leverage, positions, and its two loss limits). Launching a fund takes them
   one step at a time; changing a fund's charter shows both (`CharterFields`).

   `problems` comes from lib/funds/draft.ts, which asks `validateCharter` —
   the server's own judge — about each field. A field with a problem says so
   under itself and is marked invalid; its hint stays, so the range is never
   hidden by the error.
--------------------------------------------------------------------------- */

const GROUPS: readonly MarketGroup[] = ["crypto", "meme", "nasdaq"];

/** The words under a field: its hint, then its problem if it has one. */
function Under({ hintId, hint, errorId, error }: { hintId?: string; hint?: string; errorId: string; error?: string }) {
  return (
    <>
      {hint !== undefined && (
        <span id={hintId} className="type-label text-text-muted">
          {hint}
        </span>
      )}
      {error !== undefined && (
        <span id={errorId} className="type-label text-negative">
          {error}
        </span>
      )}
    </>
  );
}

const described = (...ids: (string | false | undefined)[]) => ids.filter(Boolean).join(" ") || undefined;

function NumberField({
  label,
  hint,
  value,
  onChange,
  suffix,
  error,
  whole = false,
}: {
  label: string;
  hint: string;
  value: string;
  onChange: (value: string) => void;
  suffix: string;
  error?: string;
  whole?: boolean;
}) {
  const id = useId();
  return (
    <div className="flex min-w-0 flex-col gap-1">
      <label htmlFor={id} className="type-label text-text-secondary">
        {label}
      </label>
      <span className="relative">
        <input
          id={id}
          inputMode={whole ? "numeric" : "decimal"}
          autoComplete="off"
          className={cn(field, "pr-9", error !== undefined && "border-negative/60")}
          value={value}
          aria-invalid={error !== undefined ? true : undefined}
          aria-describedby={described(`${id}-hint`, error !== undefined && `${id}-error`)}
          onChange={(event) => onChange(event.target.value)}
        />
        <span aria-hidden className="type-data-sm pointer-events-none absolute inset-y-0 right-3 flex items-center text-text-muted">
          {suffix}
        </span>
      </span>
      <Under hintId={`${id}-hint`} hint={hint} errorId={`${id}-error`} error={error} />
    </div>
  );
}

/** What the fund is for: its name, the manager's brief and the markets it may trade. */
export function CharterBasics({
  draft,
  onChange,
  problems = {},
  withName = true,
}: {
  draft: CharterDraft;
  onChange: (draft: CharterDraft) => void;
  problems?: DraftProblems;
  withName?: boolean;
}) {
  const t = useT();
  const id = useId();
  const set = <K extends keyof CharterDraft>(key: K, value: CharterDraft[K]) => onChange({ ...draft, [key]: value });
  const toggle = (coin: string) => set("markets", draft.markets.includes(coin) ? draft.markets.filter((entry) => entry !== coin) : [...draft.markets, coin]);
  const max = FUND_LIMITS.maxObjectiveChars;
  const used = draft.objective.length;
  const left = max - used;

  return (
    <div className="flex flex-col gap-5">
      {withName && (
        <div className="flex flex-col gap-1">
          <label htmlFor={`${id}-name`} className="type-label text-text-secondary">
            {t("Name")}
          </label>
          <input
            id={`${id}-name`}
            className={cn(field, problems.name !== undefined && "border-negative/60")}
            maxLength={FUND_LIMITS.maxNameChars}
            autoComplete="off"
            value={draft.name}
            aria-invalid={problems.name !== undefined ? true : undefined}
            aria-describedby={problems.name !== undefined ? `${id}-name-error` : undefined}
            onChange={(event) => set("name", event.target.value)}
            placeholder={t("Trend book")}
          />
          <Under errorId={`${id}-name-error`} error={problems.name} />
        </div>
      )}

      <div className="flex flex-col gap-1">
        <label htmlFor={`${id}-brief`} className="type-label text-text-secondary">
          {t("The manager's brief")}
        </label>
        <textarea
          id={`${id}-brief`}
          className={cn(field, "h-auto min-h-32 resize-y py-2 leading-relaxed", problems.objective !== undefined && "border-negative/60")}
          maxLength={max}
          value={draft.objective}
          aria-invalid={problems.objective !== undefined ? true : undefined}
          aria-describedby={described(`${id}-brief-hint`, `${id}-brief-count`, problems.objective !== undefined && `${id}-brief-error`)}
          onChange={(event) => set("objective", event.target.value)}
          placeholder={t("What the fund is for and how it should trade. For example: follow multi-day trends in BTC and ETH, long or short; never more than two positions; cut a loser at its stop rather than averaging down.")}
        />
        <div className="flex items-baseline justify-between gap-3">
          <span id={`${id}-brief-hint`} className="type-label text-text-muted">
            {t("The AI manager reads this first, every time.")}
          </span>
          <span id={`${id}-brief-count`} className={cn("type-data-sm shrink-0", left <= max / 10 ? "text-text-primary" : "text-text-muted")}>
            <span className="sr-only">{t("Characters used")} </span>
            {used.toLocaleString("en-US")}/{max.toLocaleString("en-US")}
          </span>
        </div>
        {/* Said aloud only near the end: every keystroke would be noise. */}
        <span aria-live="polite" className="sr-only">
          {left <= 100 ? t("{count} characters left", { count: left }) : ""}
        </span>
        <Under errorId={`${id}-brief-error`} error={problems.objective} />
      </div>

      <fieldset className="flex flex-col gap-3" data-invalid={problems.markets !== undefined ? true : undefined} aria-describedby={problems.markets !== undefined ? `${id}-markets-error` : undefined}>
        <legend className="type-panel-title mb-1 text-text-primary">
          {t("Markets it may trade · {count} chosen", { count: draft.markets.length })}
        </legend>
        {problems.markets !== undefined && (
          <span id={`${id}-markets-error`} className="type-label -mt-2 text-negative">
            {problems.markets}
          </span>
        )}
        {GROUPS.map((group) => (
          <div key={group} role="group" aria-labelledby={`${id}-group-${group}`} className="flex flex-col gap-2">
            <span id={`${id}-group-${group}`} className="type-eyebrow text-text-muted">
              {t(MARKET_GROUP_LABEL[group])}
            </span>
            <div className="flex flex-wrap gap-2">
              {PERP_MARKETS.filter((market) => market.group === group).map((market) => {
                const on = draft.markets.includes(market.coin);
                const short = market.coin.replace(/^xyz:/, "");
                return (
                  <button
                    key={market.coin}
                    type="button"
                    aria-pressed={on}
                    title={market.label === short ? undefined : market.label}
                    onClick={() => toggle(market.coin)}
                    className={cn(
                      "type-data-sm inline-flex h-9 items-center gap-1.5 rounded-control border px-3 pointer-coarse:h-10",
                      "transition-colors duration-[var(--dur-fast)] ease-brand",
                      on
                        ? "border-border-accent bg-accent-quiet text-text-primary hover:border-accent"
                        : "border-border-strong bg-surface-base text-text-secondary hover:bg-surface-hover hover:text-text-primary",
                    )}
                  >
                    {on && <Check size={13} strokeWidth={2} aria-hidden className="-ml-0.5" />}
                    {short}
                  </button>
                );
              })}
            </div>
          </div>
        ))}
      </fieldset>
    </div>
  );
}

/** How far the fund may go: shorts, size, exposure, leverage, positions, and the two loss limits. */
export function RiskFields({ draft, onChange, problems = {} }: { draft: CharterDraft; onChange: (draft: CharterDraft) => void; problems?: DraftProblems }) {
  const t = useT();
  const shortsId = useId();
  const set = <K extends keyof CharterDraft>(key: K, value: CharterDraft[K]) => onChange({ ...draft, [key]: value });

  return (
    <div className="flex flex-col gap-5">
      <div className="flex items-start gap-3">
        <input
          id={shortsId}
          type="checkbox"
          className="mt-0.5 size-5 shrink-0 accent-[var(--accent)]"
          checked={draft.allowShorts}
          onChange={(event) => set("allowShorts", event.target.checked)}
        />
        <label htmlFor={shortsId} className="flex min-w-0 flex-wrap items-baseline gap-x-2">
          <span className="type-body text-text-primary">{t("May sell short")}</span>
          <span className="type-label text-text-muted">{t("— a hedge fund's other half")}</span>
        </label>
      </div>

      <div className="grid grid-cols-2 gap-x-3 gap-y-4 @max-[340px]:grid-cols-1">
        <NumberField
          label={t("Largest position")}
          hint={t("of NAV · {minPositionPct}–{maxPositionPct}%", { minPositionPct: FUND_LIMITS.minPositionPct, maxPositionPct: FUND_LIMITS.maxPositionPct })}
          value={draft.maxPositionPct}
          onChange={(value) => set("maxPositionPct", value)}
          suffix="%"
          error={problems.maxPositionPct}
        />
        <NumberField
          label={t("Gross exposure")}
          hint={t("all positions, × NAV · up to {maxGrossExposure}×", { maxGrossExposure: FUND_LIMITS.maxGrossExposure })}
          value={draft.maxGrossExposure}
          onChange={(value) => set("maxGrossExposure", value)}
          suffix="×"
          error={problems.maxGrossExposure}
        />
        <NumberField
          label={t("Leverage")}
          hint={t("per position · whole number, 1–{maxLeverage}×", { maxLeverage: FUND_LIMITS.maxLeverage })}
          value={draft.maxLeverage}
          onChange={(value) => set("maxLeverage", value)}
          suffix="×"
          error={problems.maxLeverage}
          whole
        />
        <NumberField
          label={t("Open positions")}
          hint={t("at once · 1–{maxPositions}", { maxPositions: FUND_LIMITS.maxPositions })}
          value={draft.maxPositions}
          onChange={(value) => set("maxPositions", value)}
          suffix="#"
          error={problems.maxPositions}
          whole
        />
      </div>

      <fieldset className="flex flex-col gap-3 rounded-card border border-border-subtle bg-surface-raised p-3">
        <legend className="type-panel-title px-1 text-text-primary">{t("Loss limits")}</legend>
        <div className="grid grid-cols-2 gap-x-3 gap-y-4 @max-[340px]:grid-cols-1">
          <NumberField
            label={t("Halt at drawdown")}
            hint={t("From its high · {min}–{max}%. Elyra halts the fund and closes every position.", { min: FUND_LIMITS.minDrawdownPct, max: FUND_LIMITS.maxDrawdownPct })}
            value={draft.maxDrawdownPct}
            onChange={(value) => set("maxDrawdownPct", value)}
            suffix="%"
            error={problems.maxDrawdownPct}
          />
          <NumberField
            label={t("Daily loss limit")}
            hint={t("In one UTC day · {min}–{max}%. Nothing new opens until 00:00 UTC; open positions stay.", { min: FUND_LIMITS.minDailyLossPct, max: FUND_LIMITS.maxDailyLossPct })}
            value={draft.dailyLossPct}
            onChange={(value) => set("dailyLossPct", value)}
            suffix="%"
            error={problems.dailyLossPct}
          />
        </div>
      </fieldset>
    </div>
  );
}

/** The whole charter at once — changing a running fund's charter. */
export function CharterFields({ draft, onChange, withName = true }: { draft: CharterDraft; onChange: (draft: CharterDraft) => void; withName?: boolean }) {
  return (
    <div className="flex flex-col gap-6">
      <CharterBasics draft={draft} onChange={onChange} withName={withName} />
      <RiskFields draft={draft} onChange={onChange} />
    </div>
  );
}
