"use client";

import { useId, useState } from "react";
import Link from "next/link";
import { Button } from "@/components/ui/Button";
import { LIMITS, type RuleMode } from "@/lib/autotrade/rules";
import { formatUsd } from "@/lib/format";
import { COPY_LIMITS, COPY_PRESETS, validateFollow, validateSet } from "@/lib/copy/rules";
import type { CopyResponse, FollowView, MyRuleView, MySetView } from "@/lib/copy/types";
import type { CopyFeed } from "@/lib/copy/useCopy";
import { useT } from "@/lib/i18n/client";
import { cn } from "@/lib/utils";

/* ---------------------------------------------------------------------------
   The two forms copy trading needs: the terms a person copies a set on, and
   a rule set of their own. Both are checked here by the same functions the
   routes use (lib/copy/rules.ts), so what the form accepts the server does.
--------------------------------------------------------------------------- */

const field = cn(
  "type-data h-[var(--control-h)] w-full min-w-0 rounded-control border border-border-subtle bg-surface-base px-3",
  "text-text-primary outline-none placeholder:text-text-muted focus-visible:ring-2 focus-visible:ring-focus-ring",
);

function Label({ htmlFor, children }: { htmlFor: string; children: React.ReactNode }) {
  return (
    <label htmlFor={htmlFor} className="type-label text-text-secondary">
      {children}
    </label>
  );
}

export function Problem({ text }: { text: string | null }) {
  if (text === null) return null;
  return (
    <p role="alert" className="type-label rounded-card border border-negative/40 bg-negative-bg px-3 py-2 text-negative">
      {text}
    </p>
  );
}

/** Paper or live, as two buttons; live only where the server sends live orders. */
function ModeChoice({ mode, onChange, liveEnabled }: { mode: RuleMode; onChange: (mode: RuleMode) => void; liveEnabled: boolean }) {
  const t = useT();
  return (
    <div role="radiogroup" aria-label={t("Mode")} className="grid grid-cols-2 gap-1 rounded-control border border-border-subtle bg-surface-base p-1">
      {(["paper", "live"] as const).map((value) => (
        <button
          key={value}
          type="button"
          role="radio"
          aria-checked={mode === value}
          disabled={value === "live" && !liveEnabled}
          onClick={() => onChange(value)}
          className={cn(
            "type-label h-7 rounded-chip transition-colors duration-[var(--dur-fast)] ease-brand disabled:cursor-not-allowed disabled:opacity-50",
            mode === value ? "bg-surface-active text-text-primary" : "text-text-secondary hover:bg-surface-hover hover:text-text-primary",
          )}
        >
          {value === "paper" ? t("Paper") : t("Live")}
        </button>
      ))}
    </div>
  );
}

export function FollowForm({
  leaderId,
  leaderName,
  live,
  initial = null,
  feed,
  onDone,
}: {
  leaderId: string;
  leaderName: string;
  live: CopyResponse["live"];
  /** Editing an existing copy; null to start one. */
  initial?: FollowView | null;
  feed: CopyFeed<CopyResponse>;
  onDone: () => void;
}) {
  const t = useT();
  const id = useId();
  const standard = COPY_PRESETS[1];
  const [sizeUsd, setSizeUsd] = useState(String(initial?.sizeUsd ?? standard.sizeUsd));
  const [maxLeverage, setMaxLeverage] = useState(String(initial?.maxLeverage ?? standard.maxLeverage));
  const [maxDriftPct, setMaxDriftPct] = useState(String(initial?.maxDriftPct ?? standard.maxDriftPct));
  const [mode, setMode] = useState<RuleMode>(initial?.mode ?? "paper");
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const preset = COPY_PRESETS.find(
    (entry) => String(entry.sizeUsd) === sizeUsd && String(entry.maxLeverage) === maxLeverage && String(entry.maxDriftPct) === maxDriftPct,
  );

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    const checked = validateFollow({ sizeUsd: Number(sizeUsd), maxLeverage: Number(maxLeverage), maxDriftPct: Number(maxDriftPct), mode });
    if ("error" in checked) {
      setError(checked.error);
      return;
    }
    setSaving(true);
    const result =
      initial === null
        ? await feed.write("/api/copy/follows", "POST", { leaderId, ...checked.terms })
        : await feed.write(`/api/copy/follows/${initial.id}`, "PATCH", checked.terms);
    setSaving(false);
    if (result.error !== null) setError(result.error);
    else onDone();
  };

  return (
    <form onSubmit={submit} className="flex flex-col gap-3 rounded-card border border-border-subtle bg-surface-base p-3">
      <p className="type-body-sm text-text-primary">{initial === null ? t("Copy {name}", { name: leaderName }) : t("Change how you copy {name}", { name: leaderName })}</p>
      <div className="flex flex-col gap-1.5">
        <span className="type-label text-text-secondary">{t("Start from")}</span>
        <div className="flex flex-wrap gap-1.5">
          {COPY_PRESETS.map((entry) => (
            <button
              key={entry.id}
              type="button"
              aria-pressed={preset?.id === entry.id}
              onClick={() => {
                setSizeUsd(String(entry.sizeUsd));
                setMaxLeverage(String(entry.maxLeverage));
                setMaxDriftPct(String(entry.maxDriftPct));
                setError(null);
              }}
              className={cn(
                "type-label flex flex-col items-start rounded-control border px-2.5 py-1.5 text-left transition-colors duration-[var(--dur-fast)] ease-brand",
                preset?.id === entry.id ? "border-accent-quiet bg-surface-active text-text-primary" : "border-border-subtle text-text-secondary hover:bg-surface-hover hover:text-text-primary",
              )}
            >
              <span>{t(entry.label)}</span>
              <span className="type-data-sm text-text-muted">{t("{size} · {maxLeverage}x", { size: formatUsd(entry.sizeUsd, { decimals: 0 }), maxLeverage: entry.maxLeverage })}</span>
            </button>
          ))}
        </div>
      </div>
      <div className="grid grid-cols-3 gap-2 @max-[340px]:grid-cols-1">
        <div className="flex min-w-0 flex-col gap-1">
          <Label htmlFor={`${id}-size`}>{t("Per trade ($)")}</Label>
          <input id={`${id}-size`} inputMode="decimal" className={field} value={sizeUsd} onChange={(event) => setSizeUsd(event.target.value)} />
        </div>
        <div className="flex min-w-0 flex-col gap-1">
          <Label htmlFor={`${id}-leverage`}>{t("Leverage up to")}</Label>
          <select id={`${id}-leverage`} className={field} value={maxLeverage} onChange={(event) => setMaxLeverage(event.target.value)}>
            {Array.from({ length: LIMITS.maxLeverage }, (_, index) => index + 1).map((value) => (
              <option key={value} value={value}>
                {value}x
              </option>
            ))}
          </select>
        </div>
        <div className="flex min-w-0 flex-col gap-1">
          <Label htmlFor={`${id}-drift`}>{t("Allowance (%)")}</Label>
          <input id={`${id}-drift`} inputMode="decimal" className={field} value={maxDriftPct} onChange={(event) => setMaxDriftPct(event.target.value)} />
        </div>
      </div>
      <ModeChoice mode={mode} onChange={setMode} liveEnabled={live.enabled} />
      <p className="type-label text-text-muted">
        {t(
          "Each copy opens at your size, at the leader's leverage up to yours, with the leader's take-profit and stop-loss, and closes when the leader closes. It is skipped if the price is already more than your allowance past the leader's entry, between {min}% and {max}%.",
          { min: COPY_LIMITS.minDriftPct, max: COPY_LIMITS.maxDriftPct },
        )}
      </p>
      {mode === "live" && (
        <p className="type-label rounded-card border border-border-accent px-3 py-2 text-text-secondary">
          {t("Live copies are real orders on Hyperliquid {network}, sent through the trading key you approved. They can lose money quickly.", { network: live.network })}
        </p>
      )}
      {!live.enabled && <p className="type-label text-text-muted">{t("This server trades paper only, so copies run on paper.")}</p>}
      <Problem text={error} />
      <div className="flex justify-end gap-2">
        <Button size="sm" variant="ghost" onClick={onDone}>
          {t("Cancel")}
        </Button>
        <Button size="sm" variant="accent" type="submit" disabled={saving}>
          {saving ? t("Saving…") : initial === null ? t("Start copying") : t("Save changes")}
        </Button>
      </div>
    </form>
  );
}

export function SetEditor({
  rules,
  sets,
  handle,
  initial = null,
  feed,
  onDone,
}: {
  rules: MyRuleView[];
  sets: MySetView[];
  handle: string | null;
  initial?: MySetView | null;
  feed: CopyFeed<CopyResponse>;
  onDone: () => void;
}) {
  const t = useT();
  const id = useId();
  const [name, setName] = useState(initial?.name ?? "");
  const [description, setDescription] = useState(initial?.description ?? "");
  const [ruleIds, setRuleIds] = useState<string[]>(initial?.ruleIds ?? []);
  const [published, setPublished] = useState(initial?.published ?? false);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const nameOfSet = (setId: string | null) => sets.find((set) => set.id === setId)?.name ?? null;

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    const checked = validateSet({ name, description, ruleIds, published });
    if ("error" in checked) {
      setError(checked.error);
      return;
    }
    setSaving(true);
    const result =
      initial === null ? await feed.write("/api/copy/sets", "POST", checked.set) : await feed.write(`/api/copy/sets/${initial.id}`, "PATCH", checked.set);
    setSaving(false);
    if (result.error !== null) setError(result.error);
    else onDone();
  };

  return (
    <form onSubmit={submit} className="flex flex-col gap-3 rounded-card border border-border-subtle bg-surface-base p-3">
      <div className="flex flex-col gap-1">
        <Label htmlFor={`${id}-name`}>{t("Name")}</Label>
        <input id={`${id}-name`} className={field} maxLength={COPY_LIMITS.nameMax} value={name} onChange={(event) => setName(event.target.value)} placeholder={t("Majors on the four-hour")} />
      </div>
      <div className="flex flex-col gap-1">
        <Label htmlFor={`${id}-description`}>{t("What it does")}</Label>
        <textarea
          id={`${id}-description`}
          rows={3}
          maxLength={COPY_LIMITS.descriptionMax}
          className={cn(field, "h-auto py-2")}
          value={description}
          onChange={(event) => setDescription(event.target.value)}
          placeholder={t("Optional. Followers read this before they copy.")}
        />
      </div>
      <fieldset className="flex flex-col gap-1">
        <legend className="type-label mb-1 text-text-secondary">{t("Rules in it")}</legend>
        {rules.length === 0 ? (
          <p className="type-body-sm text-text-secondary">
            {t("You have no rules yet.")}{" "}
            <Link href="/automation" className="text-accent hover:text-accent-hover">
              {t("Make one on Your rules.")}
            </Link>
          </p>
        ) : (
          rules.map((rule) => {
            const checked = ruleIds.includes(rule.id);
            const elsewhere = rule.setId !== null && rule.setId !== initial?.id ? nameOfSet(rule.setId) : null;
            return (
              <label key={rule.id} className="flex min-h-9 cursor-pointer items-center gap-2.5 rounded-control px-1.5 hover:bg-surface-hover">
                <input
                  type="checkbox"
                  checked={checked}
                  onChange={() => setRuleIds(checked ? ruleIds.filter((entry) => entry !== rule.id) : [...ruleIds, rule.id])}
                  className="size-4 accent-[var(--accent)]"
                />
                <span className="flex min-w-0 flex-1 flex-col">
                  <span className="type-body-sm truncate text-text-primary">{rule.name}</span>
                  <span className="type-label truncate text-text-muted">
                    {t("{coin} {side} · {interval}", { coin: rule.coin, side: rule.side === "long" ? t("long") : t("short"), interval: rule.interval })}
                    {elsewhere !== null && ` · ${t("moves from {set}", { set: elsewhere })}`}
                  </span>
                </span>
              </label>
            );
          })
        )}
      </fieldset>
      <label className="flex items-start gap-2.5">
        <input type="checkbox" checked={published} disabled={handle === null} onChange={() => setPublished(!published)} className="mt-0.5 size-4 accent-[var(--accent)]" />
        <span className="flex flex-col gap-0.5">
          <span className="type-body-sm text-text-primary">{t("Share it so others can copy it")}</span>
          <span className="type-label text-text-muted">
            {handle === null ? (
              <>
                {t("Sharing needs an Arena handle: a shared set is shown by your handle, never your wallet.")}{" "}
                <Link href="/arena" className="text-accent hover:text-accent-hover">
                  {t("Choose one in Arena.")}
                </Link>
              </>
            ) : (
              t("Shown as @{handle}. Others see its rules, entries, exits and returns on margin — never your sizes or your wallet.", { handle })
            )}
          </span>
        </span>
      </label>
      <Problem text={error} />
      <div className="flex justify-end gap-2">
        <Button size="sm" variant="ghost" onClick={onDone}>
          {t("Cancel")}
        </Button>
        <Button size="sm" variant="accent" type="submit" disabled={saving}>
          {saving ? t("Saving…") : initial === null ? t("Make set") : t("Save changes")}
        </Button>
      </div>
    </form>
  );
}
