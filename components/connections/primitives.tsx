"use client";

import { useCallback, useEffect, useId, useRef, useState } from "react";
import { ChevronDown, type LucideIcon } from "lucide-react";
import { STATUS, type ConnectionStatus, type StatusTone } from "@/lib/connections/state";
import { useAuthedFetch } from "@/lib/useAuthedFetch";
import { cn } from "@/lib/utils";

/* ---------------------------------------------------------------------------
   The pieces every Connections card is made of.

   Flat, like every other drawer: a raised surface, a 1px border, and fields
   on the base surface so the text typed into them sits on the darkest, most
   legible ground in the card.
--------------------------------------------------------------------------- */

/**
 * `authedFetch`, stable for the life of the component.
 *
 * The drawer remounts its cards per signed-in account (see ConnectionsDrawer),
 * so a card's requests never outlive the account they were made for, and an
 * effect that loads a card's state runs once rather than on every change to
 * the auth object.
 */
export function useAccountFetch(): (url: string, init?: RequestInit) => Promise<Response> {
  const authedFetch = useAuthedFetch();
  const latest = useRef(authedFetch);
  useEffect(() => {
    latest.current = authedFetch;
  }, [authedFetch]);
  return useCallback((url: string, init?: RequestInit) => latest.current(url, init), []);
}

/** Reads a JSON body without throwing on an empty or non-JSON one. */
export async function readJson<T>(response: Response): Promise<Partial<T>> {
  try {
    return (await response.json()) as Partial<T>;
  } catch {
    return {};
  }
}

/* --- Controls -------------------------------------------------------------- */

const control = cn(
  "type-body-sm inline-flex h-10 items-center justify-center gap-2 whitespace-nowrap rounded-control px-4 font-medium",
  "transition-colors duration-[var(--dur-fast)] ease-brand",
  "disabled:pointer-events-none",
);

/** The one solid lime action in a card. */
export const primaryAction = cn(
  control,
  "bg-accent text-text-on-accent hover:bg-accent-hover active:bg-accent-hover",
  "disabled:bg-surface-hover disabled:text-text-muted",
);

/** A secondary action that still reads as a control: an outline in the quiet lime. */
export const outlinedAction = cn(
  control,
  "border border-accent-quiet text-text-primary hover:border-accent hover:bg-surface-hover active:bg-surface-panel",
  "disabled:border-border-subtle disabled:text-text-muted",
);

/** A quiet action: a border and no colour of its own. */
export const quietAction = cn(
  control,
  "border border-border-strong text-text-primary hover:bg-surface-hover active:bg-surface-panel",
  "disabled:text-text-muted",
);

/** A word-sized action inside a line of text. */
export const textAction = cn(
  "type-label inline-flex items-center gap-1 rounded-chip text-text-primary underline decoration-border-strong underline-offset-4",
  /* A 16px line is too small a thing to tap; the hit area grows to 32px tall
     without moving the text, and only a little sideways, so two actions
     side by side never claim the same tap. */
  "relative after:absolute after:-inset-x-1 after:-inset-y-2",
  "transition-colors duration-[var(--dur-fast)] ease-brand hover:decoration-accent",
  "disabled:pointer-events-none disabled:text-text-muted",
);

/** Every text field in the drawer. */
export const fieldInput = cn(
  "h-10 w-full min-w-0 rounded-control border border-border-strong bg-surface-base px-3 text-text-primary",
  "transition-colors duration-[var(--dur-fast)] ease-brand",
  "placeholder:text-text-muted hover:border-accent-quiet focus:border-accent-quiet",
  "aria-[invalid=true]:border-negative/60",
  "disabled:opacity-60",
);

/* --- Status ---------------------------------------------------------------- */

const TONE: Record<StatusTone, { badge: string; dot: string }> = {
  muted: { badge: "border-border-subtle text-text-secondary", dot: "bg-text-muted" },
  progress: { badge: "border-border-subtle text-text-secondary", dot: "bg-accent" },
  caution: { badge: "border-caution/35 bg-caution-bg text-caution", dot: "bg-caution" },
  positive: { badge: "border-sage/45 bg-positive-bg text-positive", dot: "bg-sage" },
  negative: { badge: "border-negative/40 bg-negative-bg text-negative", dot: "bg-negative" },
};

/**
 * A connection's state: a dot and its words, in a pill.
 *
 * `role="status"`, so a change — a code redeemed in Telegram, a key accepted
 * — is announced without anyone having to look for it.
 */
export function StatusBadge({
  status,
  label,
  name,
  className,
}: {
  status: ConnectionStatus;
  /** Overrides the default words: "Not linked", "Synced". The tone stays the status's. */
  label?: string;
  /** What this is the status of, for the announcement: "Telegram". */
  name: string;
  className?: string;
}) {
  const { tone, label: fallback } = STATUS[status];
  const words = label ?? fallback;
  return (
    <span
      role="status"
      aria-label={`${name}: ${words}`}
      className={cn(
        "type-label inline-flex h-6 shrink-0 items-center gap-1.5 whitespace-nowrap rounded-pill border px-2",
        TONE[tone].badge,
        className,
      )}
    >
      <span aria-hidden className={cn("size-1.5 shrink-0 rounded-pill", TONE[tone].dot)} />
      {words}
    </span>
  );
}

/* --- Cards ----------------------------------------------------------------- */

/** A square tile for a connection's mark. */
export function MarkTile({ icon: Icon, children }: { icon?: LucideIcon; children?: React.ReactNode }) {
  return (
    <span
      aria-hidden
      className="grid size-10 shrink-0 place-items-center rounded-control border border-border-subtle bg-surface-base text-text-secondary"
    >
      {Icon !== undefined ? <Icon size={18} strokeWidth={1.5} /> : children}
    </span>
  );
}

/** A connection: its mark, its name, one line on what it is for, and its state. */
export function ConnectionCard({
  as: Heading = "h2",
  mark,
  title,
  subtitle,
  status,
  children,
  className,
}: {
  /** h3 inside a titled group, so the outline reads Exchanges › Binance. */
  as?: "h2" | "h3";
  mark: React.ReactNode;
  title: string;
  subtitle: React.ReactNode;
  status: React.ReactNode;
  children?: React.ReactNode;
  className?: string;
}) {
  const titleId = useId();
  const ref = useRef<HTMLElement>(null);
  /* Whether keyboard or pointer focus is somewhere in this card. */
  const holding = useRef(false);

  /* A card swaps whole regions — a button for a code, a code for a summary —
     and the control that had focus can go with them, which drops focus to
     the page. When that happens it is kept in the card instead. */
  useEffect(() => {
    const active = document.activeElement;
    if (holding.current && (active === null || active === document.body)) {
      ref.current?.focus({ preventScroll: true });
    }
  });

  return (
    <section
      ref={ref}
      tabIndex={-1}
      aria-labelledby={titleId}
      onFocus={() => {
        holding.current = true;
      }}
      onBlur={(event) => {
        const next = event.relatedTarget;
        if (next instanceof Node && event.currentTarget.contains(next)) return;
        /* Still on the page means focus moved elsewhere on purpose; gone
           means it was removed from under the person. */
        holding.current = !event.target.isConnected;
      }}
      className={cn(
        "min-w-0 rounded-panel border border-border-subtle bg-surface-raised p-4 @max-[340px]:p-3",
        className,
      )}
    >
      <header className="flex items-start gap-3">
        {mark}
        <div className="min-w-0 flex-1 pt-px">
          <div className="flex flex-wrap items-center justify-between gap-x-2 gap-y-1">
            <Heading id={titleId} className="type-h2 min-w-0 text-text-primary">
              {title}
            </Heading>
            {status}
          </div>
          <p className="type-body-sm mt-0.5 text-text-secondary">{subtitle}</p>
        </div>
      </header>
      {children !== undefined && <div className="mt-4 flex flex-col gap-3">{children}</div>}
    </section>
  );
}

/* --- Disclosure ------------------------------------------------------------ */

/**
 * A button that shows and hides a region below it. A real button with
 * `aria-expanded`, so Enter and Space work and the state is announced.
 */
export function Disclosure({
  open,
  onOpenChange,
  label,
  icon: Icon,
  className,
  children,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  label: string;
  icon?: LucideIcon;
  className?: string;
  children: React.ReactNode;
}) {
  const regionId = useId();
  return (
    <div className={cn("flex flex-col", className)}>
      <button
        type="button"
        aria-expanded={open}
        aria-controls={regionId}
        onClick={() => onOpenChange(!open)}
        className={cn(
          "type-body-sm -mx-1 flex min-h-9 items-center gap-2 rounded-control px-1 text-left text-text-secondary",
          "transition-colors duration-[var(--dur-fast)] ease-brand hover:text-text-primary",
        )}
      >
        {Icon !== undefined && <Icon size={15} strokeWidth={1.5} aria-hidden className="shrink-0" />}
        <span className="min-w-0 flex-1">{label}</span>
        <ChevronDown
          size={15}
          strokeWidth={1.5}
          aria-hidden
          className={cn(
            "shrink-0 transition-transform duration-[var(--dur-fast)] ease-brand motion-reduce:transition-none",
            open && "rotate-180",
          )}
        />
      </button>
      <div id={regionId} hidden={!open} className="pt-2">
        {children}
      </div>
    </div>
  );
}

/* --- Confirming ------------------------------------------------------------ */

/**
 * A destructive action that asks once, in place.
 *
 * Opens on its safe answer ("Keep it") so a second Enter does not confirm by
 * accident, and hands focus back to the trigger if dismissed. `beside` sits
 * next to the trigger and makes way for the question while it is asked.
 */
export function ConfirmAction({
  trigger,
  question,
  confirm,
  pendingLabel,
  pending,
  onConfirm,
  beside,
}: {
  trigger: string;
  question: string;
  confirm: string;
  pendingLabel: string;
  pending: boolean;
  onConfirm: () => void;
  beside?: React.ReactNode;
}) {
  const [asking, setAsking] = useState(false);
  const keepRef = useRef<HTMLButtonElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const wasAsking = useRef(false);

  useEffect(() => {
    if (asking) keepRef.current?.focus();
    else if (wasAsking.current) triggerRef.current?.focus();
    wasAsking.current = asking;
  }, [asking]);

  const danger = cn(quietAction, "h-9 px-3 text-negative hover:bg-negative-bg");

  if (!asking) {
    return (
      <div className="flex flex-wrap justify-end gap-2">
        {beside}
        <button ref={triggerRef} type="button" onClick={() => setAsking(true)} className={danger}>
          {trigger}
        </button>
      </div>
    );
  }

  return (
    <div
      role="group"
      aria-label={question}
      className="flex flex-wrap items-center justify-between gap-2 rounded-card border border-negative/40 bg-negative-bg px-3 py-2"
    >
      <p className="type-body-sm min-w-0 text-text-primary">{question}</p>
      <div className="flex gap-2">
        <button ref={keepRef} type="button" onClick={() => setAsking(false)} className={cn(quietAction, "h-9 px-3")}>
          Keep it
        </button>
        <button type="button" onClick={onConfirm} disabled={pending} className={cn(danger, "border-negative/50")}>
          {pending ? pendingLabel : confirm}
        </button>
      </div>
    </div>
  );
}

/* --- Messages -------------------------------------------------------------- */

/** A failure, said where it happened. Announced as it appears. */
export function InlineError({ children, className }: { children: React.ReactNode; className?: string }) {
  return (
    <p role="alert" className={cn("type-body-sm text-negative", className)}>
      {children}
    </p>
  );
}

/** A plain outcome that is neither success nor failure: nothing found, a code to type. */
export function InlineNote({
  icon: Icon,
  tone = "muted",
  children,
  className,
}: {
  icon?: LucideIcon;
  tone?: "muted" | "caution";
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <p
      className={cn(
        "type-body-sm flex items-start gap-2",
        tone === "caution" ? "text-caution" : "text-text-secondary",
        className,
      )}
    >
      {Icon !== undefined && <Icon size={15} strokeWidth={1.5} aria-hidden className="mt-px shrink-0" />}
      <span className="min-w-0">{children}</span>
    </p>
  );
}

/** A thin rule between a card's parts. */
export function CardRule() {
  return <hr className="border-0 border-t border-border-subtle" />;
}
