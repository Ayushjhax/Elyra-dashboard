"use client";

import { useEffect, useRef, useState } from "react";
import { Plus, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { useT } from "@/lib/i18n/client";
import { cn } from "@/lib/utils";
import {
  COMPARATOR_WORD,
  COMPARATORS,
  DESIGN_LIMITS,
  defaultOperand,
  OPERAND_KINDS,
  OPERAND_NAME,
  PRICE_FIELDS,
  type Comparator,
  type Condition,
  type ConditionGroup,
  type Operand,
  type OperandKind,
} from "@/lib/strategies/spec";

/* ---------------------------------------------------------------------------
   The designer's controls: a number field that can be cleared while typed,
   an operand picker with its parameters, a condition, and a group of them.
   They edit a design; `validateDesign` judges it.
--------------------------------------------------------------------------- */

export const field = cn(
  "type-data h-[var(--control-h)] w-full min-w-0 rounded-control border border-border-subtle bg-surface-base px-2.5",
  "text-text-primary outline-none placeholder:text-text-muted focus-visible:ring-2 focus-visible:ring-focus-ring",
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
      <span className="type-label text-text-muted">{label}</span>
      <span className="relative">
        <input
          inputMode="decimal"
          className={cn(field, suffix !== undefined && "pr-7")}
          value={text}
          onChange={(event) => {
            setText(event.target.value);
            const trimmed = event.target.value.trim();
            const next = trimmed === "" ? null : Number(trimmed);
            reported.current = next;
            onChange(next);
          }}
        />
        {suffix !== undefined && <span className="type-label pointer-events-none absolute inset-y-0 right-2.5 flex items-center text-text-muted">{suffix}</span>}
      </span>
    </label>
  );
}

function Select<T extends string>({ value, options, onChange, label }: { value: T; options: Array<[T, string]>; onChange: (value: T) => void; label: string }) {
  return (
    <label className="flex min-w-0 flex-col gap-1">
      <span className="type-label text-text-muted">{label}</span>
      <select className={field} value={value} onChange={(event) => onChange(event.target.value as T)}>
        {options.map(([id, text]) => (
          <option key={id} value={id}>
            {text}
          </option>
        ))}
      </select>
    </label>
  );
}

/** One side of a comparison: what it is, and its parameters. */
function OperandEditor({ operand, onChange, label }: { operand: Operand; onChange: (operand: Operand) => void; label: string }) {
  const t = useT();
  const num = (value: number | null) => (value === null ? Number.NaN : value);
  return (
    <div className="grid grid-cols-2 gap-2 @max-[360px]:grid-cols-1">
      <Select<OperandKind>
        label={label}
        value={operand.kind}
        onChange={(kind) => onChange(defaultOperand(kind))}
        options={OPERAND_KINDS.map((kind) => [kind, t(OPERAND_NAME[kind])])}
      />
      {operand.kind === "price" && (
        <Select
          label={t("Of the bar")}
          value={operand.field}
          onChange={(value) => onChange({ ...operand, field: value })}
          options={PRICE_FIELDS.map((value) => [value, value === "close" ? t("Close") : value === "open" ? t("Open") : value === "high" ? t("High") : t("Low")])}
        />
      )}
      {"period" in operand && <NumberField label={t("Period, bars")} value={operand.period} onChange={(value) => onChange({ ...operand, period: num(value) } as Operand)} />}
      {operand.kind === "macd" && (
        <>
          <NumberField label={t("Fast")} value={operand.fast} onChange={(value) => onChange({ ...operand, fast: num(value) })} />
          <NumberField label={t("Slow")} value={operand.slow} onChange={(value) => onChange({ ...operand, slow: num(value) })} />
          <NumberField label={t("Signal")} value={operand.signal} onChange={(value) => onChange({ ...operand, signal: num(value) })} />
          <Select
            label={t("Line")}
            value={operand.line}
            onChange={(value) => onChange({ ...operand, line: value })}
            options={[
              ["macd", t("MACD line")],
              ["signal", t("Signal line")],
              ["histogram", t("Histogram")],
            ]}
          />
        </>
      )}
      {operand.kind === "bollinger" && (
        <>
          <NumberField label={t("Deviations")} value={operand.deviations} onChange={(value) => onChange({ ...operand, deviations: num(value) })} />
          <Select
            label={t("Band")}
            value={operand.band}
            onChange={(value) => onChange({ ...operand, band: value })}
            options={[
              ["upper", t("Upper")],
              ["middle", t("Middle")],
              ["lower", t("Lower")],
            ]}
          />
        </>
      )}
      {operand.kind === "donchian" && (
        <Select
          label={t("Band")}
          value={operand.band}
          onChange={(value) => onChange({ ...operand, band: value })}
          options={[
            ["upper", t("Highest high")],
            ["lower", t("Lowest low")],
          ]}
        />
      )}
      {operand.kind === "number" && <NumberField label={t("Value")} value={operand.value} onChange={(value) => onChange({ ...operand, value: num(value) })} />}
    </div>
  );
}

function ConditionEditor({ condition, onChange, onRemove, index }: { condition: Condition; onChange: (condition: Condition) => void; onRemove: (() => void) | null; index: number }) {
  const t = useT();
  return (
    <li className="flex flex-col gap-2 rounded-card border border-border-subtle bg-surface-base p-2.5">
      <div className="flex items-center justify-between gap-2">
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
      <OperandEditor label={t("This")} operand={condition.left} onChange={(left) => onChange({ ...condition, left })} />
      <Select<Comparator>
        label={t("Compared")}
        value={condition.op}
        onChange={(op) => onChange({ ...condition, op })}
        options={COMPARATORS.map((op) => [op, t(COMPARATOR_WORD[op])])}
      />
      <OperandEditor label={t("That")} operand={condition.right} onChange={(right) => onChange({ ...condition, right })} />
    </li>
  );
}

/** A group of conditions, all or any of which must hold. */
export function GroupEditor({ group, onChange, minimum = 1 }: { group: ConditionGroup; onChange: (group: ConditionGroup) => void; minimum?: number }) {
  const t = useT();
  const set = (index: number, condition: Condition) => onChange({ ...group, conditions: group.conditions.map((entry, at) => (at === index ? condition : entry)) });
  return (
    <div className="flex flex-col gap-2">
      <div role="radiogroup" aria-label={t("How the conditions combine")} className="grid grid-cols-2 gap-1 rounded-control border border-border-subtle bg-surface-base p-0.5">
        {(["all", "any"] as const).map((match) => (
          <button
            key={match}
            type="button"
            role="radio"
            aria-checked={group.match === match}
            onClick={() => onChange({ ...group, match })}
            className={cn("type-label h-8 rounded-chip transition-colors", group.match === match ? "bg-surface-raised text-text-primary" : "text-text-muted hover:text-text-primary")}
          >
            {match === "all" ? t("All must hold") : t("Any one is enough")}
          </button>
        ))}
      </div>
      <ul className="flex flex-col gap-2">
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
      {group.conditions.length < DESIGN_LIMITS.maxConditions && (
        <div>
          <Button
            size="xs"
            variant="quiet"
            onClick={() =>
              onChange({ ...group, conditions: [...group.conditions, { left: defaultOperand("rsi"), op: "below", right: defaultOperand("number") }] })
            }
          >
            <Plus size={12} aria-hidden /> {t("Add a condition")}
          </Button>
        </div>
      )}
    </div>
  );
}
