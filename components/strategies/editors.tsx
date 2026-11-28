"use client";

import { useEffect, useRef, useState } from "react";
import { Plus, Trash2 } from "lucide-react";
import { useT } from "@/lib/i18n/client";
import { cn } from "@/lib/utils";
import {
  COMPARATOR_WORD,
  COMPARATORS,
  DESIGN_LIMITS,
  defaultOperand,
  OPERAND_KINDS,
  OPERAND_NAME,
  OPERAND_SHORT,
  PRICE_FIELDS,
  type Comparator,
  type Condition,
  type ConditionGroup,
  type Operand,
  type OperandKind,
} from "@/lib/strategies/spec";

/* ---------------------------------------------------------------------------
   The designer's controls: a number field that can be cleared while typed,
   a segmented choice, an operand with its parameters, a condition, and a
   group of them. They edit a design; `validateDesign` judges it.

   A condition reads in three rows, top to bottom, the way it is said:
   the indicator and its parameters, the comparison, then what it is
   compared with and its parameters — "EMA 20 · crosses above · EMA 50".
--------------------------------------------------------------------------- */

/* Inputs take --border-strong (brand doc 1.3). Focus is the global
   :focus-visible ring (app/globals.css), which a utility cannot override —
   a ring here as well would draw two. */
export const field = cn(
  "type-data h-[var(--control-h)] w-full min-w-0 rounded-control border border-border-strong bg-surface-base px-2.5",
  "text-text-primary placeholder:text-text-muted",
);

export function Problem({ text }: { text: string | null }) {
  if (text === null) return null;
  return (
    <p role="alert" className="type-label rounded-card border border-negative/40 bg-negative-bg px-3 py-2 text-negative">
      {text}
    </p>
  );
}

/** A number typed as text: it can be emptied while typing, and reports null for empty. */
export function NumberField({
  value,
  onChange,
  label,
  suffix,
  className,
}: {
  value: number | null;
  onChange: (value: number | null) => void;
  label: string;
  suffix?: string;
  className?: string;
}) {
  const [text, setText] = useState(value === null || Number.isNaN(value) ? "" : String(value));
  /* What this field last reported: a value that differs came from outside (a design opened). */
  const reported = useRef<number | null>(value);
  useEffect(() => {
    if (Object.is(value, reported.current)) return;
    reported.current = value;
    setText(value === null || Number.isNaN(value) ? "" : String(value));
  }, [value]);
  return (
    <label className={cn("flex min-w-0 flex-col gap-1", className)}>
      <span className="type-label text-text-secondary">{label}</span>
      <span className="relative">
        <input
          inputMode="decimal"
          autoComplete="off"
          className={cn(field, suffix !== undefined && (suffix.length > 1 ? "pr-12" : "pr-7"))}
          value={text}
          onChange={(event) => {
            setText(event.target.value);
            const trimmed = event.target.value.trim();
            const next = trimmed === "" ? null : Number(trimmed);
            reported.current = next;
            onChange(next);
          }}
        />
        {suffix !== undefined && (
          <span aria-hidden className="type-data-sm pointer-events-none absolute inset-y-0 right-2.5 flex items-center text-text-muted">
            {suffix}
          </span>
        )}
      </span>
    </label>
  );
}

export function Select<T extends string>({ value, options, onChange, label, title }: { value: T; options: Array<[T, string]>; onChange: (value: T) => void; label: string; title?: string }) {
  return (
    <label className="flex min-w-0 flex-col gap-1">
      <span className="type-label text-text-secondary">{label}</span>
      <select className={field} value={value} title={title} onChange={(event) => onChange(event.target.value as T)}>
        {options.map(([id, text]) => (
          <option key={id} value={id}>
            {text}
          </option>
        ))}
      </select>
    </label>
  );
}

/**
 * One choice of a few, as a segmented control: a radio group, so arrow keys
 * move the choice and Tab leaves it. Selected is Elyra Green, the brand's
 * selected state, with the words in primary text.
 */
export function Segmented<T extends string>({ value, options, onChange, label, className }: { value: T; options: Array<[T, string]>; onChange: (value: T) => void; label: string; className?: string }) {
  const refs = useRef<Array<HTMLButtonElement | null>>([]);
  const choose = (index: number) => {
    const next = (index + options.length) % options.length;
    onChange(options[next][0]);
    refs.current[next]?.focus();
  };
  return (
    <div
      role="radiogroup"
      aria-label={label}
      className={cn("grid gap-1 rounded-control border border-border-subtle bg-surface-base p-1", className)}
      style={{ gridTemplateColumns: `repeat(${options.length}, minmax(0, 1fr))` }}
    >
      {options.map(([id, text], index) => {
        const on = id === value;
        return (
          <button
            key={id}
            ref={(node) => {
              refs.current[index] = node;
            }}
            type="button"
            role="radio"
            aria-checked={on}
            tabIndex={on ? 0 : -1}
            onClick={() => onChange(id)}
            onKeyDown={(event) => {
              if (event.key === "ArrowRight" || event.key === "ArrowDown") choose(index + 1);
              else if (event.key === "ArrowLeft" || event.key === "ArrowUp") choose(index - 1);
              else if (event.key === "Home") choose(0);
              else if (event.key === "End") choose(options.length - 1);
              else return;
              event.preventDefault();
            }}
            className={cn(
              "type-label h-8 min-w-0 truncate rounded-chip px-2 transition-colors duration-[var(--dur-fast)] ease-brand",
              on ? "bg-surface-active text-text-primary" : "text-text-secondary hover:bg-surface-hover hover:text-text-primary",
            )}
          >
            {text}
          </button>
        );
      })}
    </div>
  );
}

/** One side of a comparison: what it is, then its parameters beside and below it. */
function OperandEditor({ operand, onChange, label }: { operand: Operand; onChange: (operand: Operand) => void; label: string }) {
  const t = useT();
  const num = (value: number | null) => (value === null ? Number.NaN : value);
  const period = t("Period (bars)");
  const params: React.ReactNode[] = [];

  if (operand.kind === "price") {
    params.push(
      <Select
        key="field"
        label={t("Of the bar")}
        value={operand.field}
        onChange={(value) => onChange({ ...operand, field: value })}
        options={PRICE_FIELDS.map((value) => [value, value === "close" ? t("Close") : value === "open" ? t("Open") : value === "high" ? t("High") : t("Low")])}
      />,
    );
  }
  if ("period" in operand) {
    params.push(<NumberField key="period" label={period} value={operand.period} onChange={(value) => onChange({ ...operand, period: num(value) } as Operand)} />);
  }
  if (operand.kind === "macd") {
    params.push(
      <NumberField key="fast" label={t("Fast (bars)")} value={operand.fast} onChange={(value) => onChange({ ...operand, fast: num(value) })} />,
      <NumberField key="slow" label={t("Slow (bars)")} value={operand.slow} onChange={(value) => onChange({ ...operand, slow: num(value) })} />,
      <NumberField key="signal" label={t("Signal (bars)")} value={operand.signal} onChange={(value) => onChange({ ...operand, signal: num(value) })} />,
      <Select
        key="line"
        label={t("Line")}
        value={operand.line}
        onChange={(value) => onChange({ ...operand, line: value })}
        options={[
          ["macd", t("MACD line")],
          ["signal", t("Signal line")],
          ["histogram", t("Histogram")],
        ]}
      />,
    );
  }
  if (operand.kind === "bollinger") {
    params.push(
      <NumberField key="deviations" label={t("Deviations")} value={operand.deviations} onChange={(value) => onChange({ ...operand, deviations: num(value) })} />,
      <Select
        key="band"
        label={t("Band")}
        value={operand.band}
        onChange={(value) => onChange({ ...operand, band: value })}
        options={[
          ["upper", t("Upper")],
          ["middle", t("Middle")],
          ["lower", t("Lower")],
        ]}
      />,
    );
  }
  if (operand.kind === "donchian") {
    params.push(
      <Select
        key="band"
        label={t("Band")}
        value={operand.band}
        onChange={(value) => onChange({ ...operand, band: value })}
        options={[
          ["upper", t("Highest high")],
          ["lower", t("Lowest low")],
        ]}
      />,
    );
  }
  if (operand.kind === "number") {
    params.push(<NumberField key="value" label={t("Value")} value={operand.value} onChange={(value) => onChange({ ...operand, value: num(value) })} />);
  }

  return (
    <div className="grid grid-cols-2 gap-x-3 gap-y-2 @max-[340px]:grid-cols-1">
      {/* With nothing beside it, what it is takes the row. */}
      <div className={cn("min-w-0", params.length === 0 && "col-span-2 @max-[340px]:col-span-1")}>
        <Select<OperandKind>
          label={label}
          value={operand.kind}
          title={t(OPERAND_NAME[operand.kind])}
          onChange={(kind) => onChange(defaultOperand(kind))}
          options={OPERAND_KINDS.map((kind) => [kind, t(OPERAND_SHORT[kind])])}
        />
      </div>
      {params}
    </div>
  );
}

function ConditionEditor({ condition, onChange, onRemove, index }: { condition: Condition; onChange: (condition: Condition) => void; onRemove: (() => void) | null; index: number }) {
  const t = useT();
  return (
    <li className="flex flex-col gap-3 rounded-card border border-border-subtle bg-surface-base p-3 @max-[340px]:p-2.5">
      <div className="-my-1 flex min-h-8 items-center justify-between gap-2">
        <span className="type-eyebrow text-text-muted">{t("Condition {n}", { n: index + 1 })}</span>
        {onRemove !== null && (
          <button
            type="button"
            onClick={onRemove}
            aria-label={t("Remove condition {n}", { n: index + 1 })}
            className="inline-flex size-8 items-center justify-center rounded-control text-text-muted transition-colors hover:bg-surface-hover hover:text-negative"
          >
            <Trash2 size={14} strokeWidth={1.5} aria-hidden />
          </button>
        )}
      </div>
      <OperandEditor label={t("Indicator")} operand={condition.left} onChange={(left) => onChange({ ...condition, left })} />
      <Select<Comparator> label={t("Comparison")} value={condition.op} onChange={(op) => onChange({ ...condition, op })} options={COMPARATORS.map((op) => [op, t(COMPARATOR_WORD[op])])} />
      <OperandEditor label={t("Compare with")} operand={condition.right} onChange={(right) => onChange({ ...condition, right })} />
    </li>
  );
}

/** A group of conditions, all or any of which must hold. "Add condition" adds to this group only. */
export function GroupEditor({ group, onChange, label, minimum = 1 }: { group: ConditionGroup; onChange: (group: ConditionGroup) => void; label: string; minimum?: number }) {
  const t = useT();
  const listRef = useRef<HTMLUListElement>(null);
  const added = useRef(false);
  const set = (index: number, condition: Condition) => onChange({ ...group, conditions: group.conditions.map((entry, at) => (at === index ? condition : entry)) });

  /* A condition just added takes focus at its first field. */
  useEffect(() => {
    if (!added.current) return;
    added.current = false;
    listRef.current?.querySelector<HTMLElement>("li:last-child select")?.focus();
  }, [group.conditions.length]);

  return (
    <div className="flex flex-col gap-3">
      <Segmented
        label={t("{group}: how the conditions combine", { group: label })}
        value={group.match}
        onChange={(match) => onChange({ ...group, match })}
        options={[
          ["all", t("All must hold")],
          ["any", t("Any one is enough")],
        ]}
      />
      <ul ref={listRef} className="flex flex-col gap-2">
        {group.conditions.map((condition, index) => (
          <ConditionEditor
            key={index}
            index={index}
            condition={condition}
            onChange={(next) => set(index, next)}
            onRemove={group.conditions.length > minimum ? () => onChange({ ...group, conditions: group.conditions.filter((_, at) => at !== index) }) : null}
          />
        ))}
      </ul>
      {group.conditions.length < DESIGN_LIMITS.maxConditions ? (
        <button
          type="button"
          onClick={() => {
            added.current = true;
            onChange({ ...group, conditions: [...group.conditions, { left: defaultOperand("rsi"), op: "below", right: defaultOperand("number") }] });
          }}
          aria-label={t("Add condition to {group}", { group: label })}
          className="type-label inline-flex h-10 w-full items-center gap-2 rounded-card border border-border-strong px-3 text-text-primary transition-colors duration-[var(--dur-fast)] ease-brand hover:bg-surface-hover"
        >
          <Plus size={15} aria-hidden className="text-accent" />
          {t("Add condition")}
        </button>
      ) : (
        <p className="type-label text-text-muted">{t("Up to {max} conditions in a group.", { max: DESIGN_LIMITS.maxConditions })}</p>
      )}
    </div>
  );
}
