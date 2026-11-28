"use client";

import { forwardRef, useCallback, useEffect, useId, useRef, useState } from "react";
import Link from "next/link";
import { ArrowLeft, ArrowRight, Rocket } from "lucide-react";
import { CharterBasics, RiskFields } from "@/components/funds/CharterFields";
import { FreshKey } from "@/components/funds/ManagerBrief";
import { field, Problem } from "@/components/funds/parts";
import { Button, buttonVariants } from "@/components/ui/Button";
import {
  CHARTER_STEP_FIELDS,
  RISK_STEP_FIELDS,
  capitalOf,
  capitalProblem,
  charterBody,
  charterProblem,
  draftOf,
  fieldProblems,
  type CharterDraft,
  type DraftProblems,
} from "@/lib/funds/draft";
import { CHARTER_DEFAULTS, FUND_LIMITS } from "@/lib/funds/policy";
import type { FundManagerOption, FundSummary, FundsResponse } from "@/lib/funds/types";
import type { FundsFeed } from "@/lib/funds/useFunds";
import { cn } from "@/lib/utils";
import { useT } from "@/lib/i18n/client";

/* ---------------------------------------------------------------------------
   Launching a fund, in two steps: the charter (name, brief, markets), then
   risk and manager (the limits, paper starting capital, and who manages it).

   The draft lives with the Funds page, not here, so Back, a failed launch
   and leaving for the list and coming back all keep every value. Each step
   is checked by lib/funds/draft.ts, which asks the server's own
   `validateCharter`; the launch itself is the same POST /api/funds as
   always, so the key is made — and shown once — by the server, and the new
   fund is shown only once the server says it exists.

   The footer sticks to the bottom of whatever scrolls the drawer, and a
   field that takes focus behind it is scrolled up clear of it.
--------------------------------------------------------------------------- */

export type ManagerChoice = { kind: "new"; name: string } | { kind: "existing"; keyId: string } | { kind: "none" };

export interface LaunchDraft {
  charter: CharterDraft;
  capital: string;
  manager: ManagerChoice;
}

export function freshLaunch(): LaunchDraft {
  return { charter: draftOf(CHARTER_DEFAULTS), capital: "10000", manager: { kind: "new", name: "" } };
}

type Step = "charter" | "risk";

/** The nearest ancestor that actually scrolls: the drawer's body, or the workspace on a phone. */
function scroller(node: HTMLElement): HTMLElement | null {
  for (let element = node.parentElement; element !== null; element = element.parentElement) {
    const overflow = getComputedStyle(element).overflowY;
    if ((overflow === "auto" || overflow === "scroll") && element.scrollHeight > element.clientHeight) return element;
  }
  return null;
}

const StepHeading = forwardRef<HTMLHeadingElement, { step: 1 | 2; title: string; description: string }>(function StepHeading({ step, title, description }, ref) {
  const t = useT();
  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-center gap-2">
        <Rocket size={16} strokeWidth={1.5} aria-hidden className="shrink-0 text-accent" />
        <span className="type-label min-w-0 flex-1 text-text-secondary">{t("Launch a fund")}</span>
        <span className="type-data-sm inline-flex h-6 shrink-0 items-center rounded-pill border border-border-strong px-2.5 text-text-secondary">
          {t("Step {step} of {total}", { step, total: 2 })}
        </span>
      </div>
      <h2 ref={ref} tabIndex={-1} className="type-h1 text-text-primary">
        {title}
      </h2>
      <div aria-hidden className="grid grid-cols-2 gap-1">
        <span className="h-1 rounded-pill bg-accent" />
        <span className={cn("h-1 rounded-pill", step === 2 ? "bg-accent" : "bg-surface-hover")} />
      </div>
      <p className="type-body-sm text-text-secondary">{description}</p>
    </div>
  );
});

export function LaunchFund({
  feed,
  managers,
  draft,
  onDraft,
  onCancel,
  onDone,
}: {
  feed: FundsFeed<FundsResponse>;
  managers: FundManagerOption[];
  draft: LaunchDraft;
  onDraft: (draft: LaunchDraft) => void;
  /** Back to the list; the draft is kept. */
  onCancel: () => void;
  /** After a launch, back to the list; the draft is spent. */
  onDone: () => void;
}) {
  const t = useT();
  const id = useId();
  const free = managers.filter((manager) => manager.managing === null);
  const [step, setStep] = useState<Step>("charter");
  const [tried, setTried] = useState<Record<Step, boolean>>({ charter: false, risk: false });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [launched, setLaunched] = useState<{ fund: FundSummary; key: string | null } | null>(null);
  const sending = useRef(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const footerRef = useRef<HTMLDivElement>(null);
  const headingRef = useRef<HTMLHeadingElement>(null);

  const { charter, capital, manager } = draft;
  const setCharter = (next: CharterDraft) => onDraft({ ...draft, charter: next });
  const setManager = (next: ManagerChoice) => onDraft({ ...draft, manager: next });

  /* A step's problems are shown once the person has tried to leave it, and
     then follow every edit. */
  const charterProblems: DraftProblems = tried.charter ? fieldProblems(charter, CHARTER_STEP_FIELDS, t) : {};
  const riskProblems: DraftProblems = tried.risk ? fieldProblems(charter, RISK_STEP_FIELDS, t) : {};
  const capitalError = tried.risk ? capitalProblem(capital, t) : null;

  /* Each step, and the outcome, starts at its heading. */
  useEffect(() => {
    headingRef.current?.focus({ preventScroll: true });
    headingRef.current?.scrollIntoView({ block: "nearest" });
  }, [step, launched]);

  const focusFirstProblem = () => {
    requestAnimationFrame(() => {
      const root = rootRef.current;
      const target = root?.querySelector<HTMLElement>('[aria-invalid="true"], [data-invalid="true"] button');
      target?.focus();
    });
  };

  /* A field focused behind the sticky footer moves up clear of it. */
  const keepClearOfFooter = useCallback((event: React.FocusEvent<HTMLDivElement>) => {
    const target = event.target;
    const footer = footerRef.current;
    if (!(target instanceof HTMLElement) || footer === null || footer.contains(target)) return;
    requestAnimationFrame(() => {
      const overlap = target.getBoundingClientRect().bottom + 12 - footer.getBoundingClientRect().top;
      if (overlap > 0) scroller(target)?.scrollBy({ top: overlap });
    });
  }, []);

  const toRisk = () => {
    setTried((current) => ({ ...current, charter: true }));
    if (Object.keys(fieldProblems(charter, CHARTER_STEP_FIELDS, t)).length > 0) return focusFirstProblem();
    setError(null);
    setStep("risk");
  };

  const launch = async () => {
    if (sending.current) return;
    setTried((current) => ({ ...current, risk: true }));
    if (Object.keys(fieldProblems(charter, RISK_STEP_FIELDS, t)).length > 0 || capitalProblem(capital, t) !== null) return focusFirstProblem();
    const whole = charterProblem(charter, t);
    if (whole !== null) return setError(whole);

    sending.current = true;
    setBusy(true);
    setError(null);
    const body: Record<string, unknown> = { ...charterBody(charter), capitalUsd: capitalOf(capital) };
    if (manager.kind === "new") body.newKeyName = manager.name.trim().length > 0 ? manager.name : `${charter.name.trim() || "Fund"} manager`;
    if (manager.kind === "existing") body.keyId = manager.keyId;
    const result = await feed.write("/api/funds", "POST", body);
    sending.current = false;
    setBusy(false);
    /* A refusal keeps every value where it was, on this step. */
    if (result.error !== null) return setError(result.error);
    setLaunched({ fund: result.body.fund as FundSummary, key: (result.body.key as string | null) ?? null });
  };

  if (launched !== null) {
    return (
      <section aria-labelledby={`${id}-done`} className="flex flex-col gap-4 rounded-panel border border-border-subtle bg-surface-raised p-4 @max-[340px]:p-3">
        <div className="flex items-center gap-2.5">
          <Rocket size={18} strokeWidth={1.5} aria-hidden className="shrink-0 text-accent" />
          <h2 ref={headingRef} id={`${id}-done`} tabIndex={-1} className="type-h2 min-w-0 flex-1 text-text-primary">
            {t("{name} is trading on paper", { name: launched.fund.name })}
          </h2>
        </div>
        {launched.key !== null ? (
          <FreshKey keyText={launched.key} fundName={launched.fund.name} />
        ) : (
          <p className="type-body-sm text-text-secondary">
            {manager.kind === "existing"
              ? t("Its manager's key already exists; the fund's page has the instructions to give the agent.")
              : t("It has no manager yet. Assign one from the fund's page — until then, nothing trades.")}
          </p>
        )}
        <div className="flex flex-wrap gap-2">
          <Link href={`/funds/${launched.fund.id}`} className={buttonVariants({ variant: "accent", size: "sm" })}>
            {t("Open the fund")}
          </Link>
          <Button size="sm" variant="ghost" onClick={onDone}>
            {t("Done")}
          </Button>
        </div>
      </section>
    );
  }

  return (
    <div ref={rootRef} onFocusCapture={keepClearOfFooter} className="flex flex-col gap-6">
      {step === "charter" ? (
        <>
          <button
            type="button"
            onClick={onCancel}
            className="type-label -mx-1 -mb-3 inline-flex min-h-8 items-center gap-1.5 self-start rounded-control px-1 text-text-secondary transition-colors duration-[var(--dur-fast)] ease-brand hover:text-text-primary"
          >
            <ArrowLeft size={14} aria-hidden />
            {t("Your funds")}
          </button>
          <StepHeading ref={headingRef} step={1} title={t("Charter")} description={t("What the fund is for, how it should trade, and the markets it may use.")} />
          <CharterBasics draft={charter} onChange={setCharter} problems={charterProblems} />
        </>
      ) : (
        <>
          <StepHeading ref={headingRef} step={2} title={t("Risk & manager")} description={t("The limits Elyra holds every order to, the paper capital it starts with, and the AI that manages it.")} />
          <RiskFields draft={charter} onChange={setCharter} problems={riskProblems} />

          <div className="flex flex-col gap-1">
            <label htmlFor={`${id}-capital`} className="type-label text-text-secondary">
              {t("Paper starting capital")}
            </label>
            <span className="relative">
              <span aria-hidden className="type-data pointer-events-none absolute inset-y-0 left-3 flex items-center text-text-muted">
                $
              </span>
              <input
                id={`${id}-capital`}
                inputMode="decimal"
                autoComplete="off"
                className={cn(field, "pl-7 pr-12", capitalError !== null && "border-negative/60")}
                value={capital}
                aria-invalid={capitalError !== null ? true : undefined}
                aria-describedby={capitalError !== null ? `${id}-capital-hint ${id}-capital-error` : `${id}-capital-hint`}
                onChange={(event) => onDraft({ ...draft, capital: event.target.value })}
              />
              <span aria-hidden className="type-data-sm pointer-events-none absolute inset-y-0 right-3 flex items-center text-text-muted">
                USD
              </span>
            </span>
            <span id={`${id}-capital-hint`} className="type-label text-text-muted">
              {t("${minCapitalUsd} to ${maxPaperCapitalUsd}. Units start at 100, so returns are the manager's, whatever you add later.", {
                minCapitalUsd: FUND_LIMITS.minCapitalUsd,
                maxPaperCapitalUsd: FUND_LIMITS.maxPaperCapitalUsd.toLocaleString("en-US"),
              })}
            </span>
            {capitalError !== null && (
              <span id={`${id}-capital-error`} className="type-label text-negative">
                {capitalError}
              </span>
            )}
          </div>

          <fieldset className="flex flex-col gap-3">
            <legend className="type-panel-title mb-1 text-text-primary">{t("Manager")}</legend>
            <div className="flex flex-col gap-2">
              <label className="flex min-h-10 items-start gap-3">
                <input type="radio" name={`${id}-manager`} className="mt-0.5 size-5 shrink-0 accent-[var(--accent)]" checked={manager.kind === "new"} onChange={() => setManager({ kind: "new", name: "" })} />
                <span className="flex min-w-0 flex-col gap-0.5">
                  <span className="type-body text-text-primary">{t("Create a manager key")}</span>
                  <span className="type-label text-text-muted">{t("For the AI that will run the fund. Shown once, after launch, with how to connect it.")}</span>
                </span>
              </label>
              {manager.kind === "new" && (
                <input
                  className={cn(field, "ml-8 w-[calc(100%-2rem)]")}
                  maxLength={60}
                  autoComplete="off"
                  value={manager.name}
                  onChange={(event) => setManager({ kind: "new", name: event.target.value })}
                  placeholder={charter.name.trim() === "" ? t("Fund manager") : t("{name} manager", { name: charter.name.trim() })}
                  aria-label={t("Name of the manager's key")}
                />
              )}
              {free.length > 0 && (
                <>
                  <label className="flex min-h-10 items-start gap-3">
                    <input
                      type="radio"
                      name={`${id}-manager`}
                      className="mt-0.5 size-5 shrink-0 accent-[var(--accent)]"
                      checked={manager.kind === "existing"}
                      onChange={() => setManager({ kind: "existing", keyId: free[0].keyId })}
                    />
                    <span className="type-body text-text-primary">{t("Use one of my agent keys")}</span>
                  </label>
                  {manager.kind === "existing" && (
                    <select className={cn(field, "ml-8 w-[calc(100%-2rem)]")} value={manager.keyId} onChange={(event) => setManager({ kind: "existing", keyId: event.target.value })} aria-label={t("Agent key")}>
                      {free.map((option) => (
                        <option key={option.keyId} value={option.keyId}>
                          {option.name} · {option.prefix}…
                        </option>
                      ))}
                    </select>
                  )}
                </>
              )}
              <label className="flex min-h-10 items-start gap-3">
                <input type="radio" name={`${id}-manager`} className="mt-0.5 size-5 shrink-0 accent-[var(--accent)]" checked={manager.kind === "none"} onChange={() => setManager({ kind: "none" })} />
                <span className="flex min-w-0 flex-col gap-0.5">
                  <span className="type-body text-text-primary">{t("Assign later")}</span>
                  <span className="type-label text-text-muted">{t("Nothing trades until you assign a manager on the fund's page.")}</span>
                </span>
              </label>
            </div>
          </fieldset>
        </>
      )}

      <Problem text={error} />

      <div
        ref={footerRef}
        className="sticky bottom-0 z-10 -mx-4 -mb-4 mt-auto flex gap-2 border-t border-border-subtle bg-surface-panel px-4 py-3 @max-[340px]:-mx-3 @max-[340px]:-mb-3 @max-[340px]:px-3"
      >
        {step === "charter" ? (
          <Button variant="accent" className="w-full" onClick={toRisk}>
            {t("Continue to risk limits")}
            <ArrowRight size={15} aria-hidden />
          </Button>
        ) : (
          <>
            <Button variant="quiet" className="flex-1" disabled={busy} onClick={() => setStep("charter")}>
              {t("Back")}
            </Button>
            <Button variant="accent" className="flex-1 disabled:bg-surface-hover" disabled={busy} aria-busy={busy || undefined} onClick={() => void launch()}>
              {busy ? t("Launching…") : t("Launch on paper")}
            </Button>
          </>
        )}
      </div>
    </div>
  );
}
