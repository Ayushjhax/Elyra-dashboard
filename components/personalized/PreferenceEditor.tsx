"use client";

import { useState } from "react";
import { Loader2, Trash2 } from "lucide-react";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import type { MemoryFeed } from "@/lib/personalized/client";
import type { MemoryType, PersonalizedMemory } from "@/lib/personalized/types";
import { cn } from "@/lib/utils";

/* ---------------------------------------------------------------------------
   Saving a preference — only ever because the person pressed Save.

   Opened from a suggestion ("Risk tolerance", "Allocation limits"), from
   "Add preference", or from a saved preference to change or remove it. A
   suggestion is an empty form, never a saved value: nothing is written until
   Save, and what is written is validated again on the server
   (lib/personalized/memory.ts) whatever this form allowed.
--------------------------------------------------------------------------- */

export type EditorIntent =
  | { mode: "risk" }
  | { mode: "allocation" }
  | { mode: "new" }
  | { mode: "edit"; memory: PersonalizedMemory };

interface FieldSpec {
  type: MemoryType;
  label: string;
  hint: string;
  kind: "percent" | "multiple" | "text" | "symbol";
  placeholder: string;
}

const FIELDS: Record<MemoryType, FieldSpec> = {
  concentration_limit: {
    type: "concentration_limit",
    label: "Most in any one asset",
    hint: "Elyra flags when a single asset grows past this share of your portfolio.",
    kind: "percent",
    placeholder: "25",
  },
  stablecoin_buffer: {
    type: "stablecoin_buffer",
    label: "Keep at least this much in stablecoins",
    hint: "A floor of dry powder Elyra keeps in mind before suggesting you deploy it.",
    kind: "percent",
    placeholder: "10",
  },
  leverage_limit: {
    type: "leverage_limit",
    label: "Highest leverage you'll use",
    hint: "Elyra will not suggest a position above this multiple.",
    kind: "multiple",
    placeholder: "3",
  },
  preferred_venue: {
    type: "preferred_venue",
    label: "Preferred venue",
    hint: "Where you would rather trade when there is a choice.",
    kind: "text",
    placeholder: "Hyperliquid",
  },
  watch_symbol: {
    type: "watch_symbol",
    label: "Watch a symbol",
    hint: "Elyra brings it up when it matters to your portfolio.",
    kind: "symbol",
    placeholder: "SOL",
  },
  note: {
    type: "note",
    label: "Something Elyra should always know",
    hint: "In your words, up to 280 characters.",
    kind: "text",
    placeholder: "I'm saving for a house deposit in 2027 — keep risk modest.",
  },
};

const NEW_TYPES: MemoryType[] = [
  "concentration_limit",
  "stablecoin_buffer",
  "leverage_limit",
  "preferred_venue",
  "watch_symbol",
  "note",
];

function fieldsFor(intent: EditorIntent, chosen: MemoryType): FieldSpec[] {
  switch (intent.mode) {
    case "risk":
      return [FIELDS.leverage_limit, FIELDS.stablecoin_buffer];
    case "allocation":
      return [FIELDS.concentration_limit];
    case "new":
      return [FIELDS[chosen]];
    case "edit":
      return [FIELDS[intent.memory.type]];
  }
}

const TITLE: Record<EditorIntent["mode"], string> = {
  risk: "Risk tolerance",
  allocation: "Allocation limits",
  new: "Add a preference",
  edit: "Edit preference",
};

function existingValue(memories: PersonalizedMemory[], type: MemoryType): string {
  const found = memories.find((memory) => memory.type === type);
  return found === undefined ? "" : String(found.value ?? "");
}

const input = cn(
  "type-body h-10 w-full min-w-0 rounded-control border border-border-subtle bg-surface-base px-3 text-text-primary",
  "placeholder:text-text-muted transition-colors duration-[var(--dur-fast)] ease-brand",
  "hover:border-border-strong focus-visible:border-accent-quiet",
);

function Editor({ intent, memory, onDone }: { intent: EditorIntent; memory: MemoryFeed; onDone: () => void }) {
  const [chosen, setChosen] = useState<MemoryType>("concentration_limit");
  const fields = fieldsFor(intent, chosen);
  /* Pre-filled with what is already saved, so a suggestion for a type that
     exists edits it rather than appearing to add a second one. */
  const [values, setValues] = useState<Record<string, string>>(() =>
    intent.mode === "edit"
      ? { [intent.memory.type]: String(intent.memory.value ?? "") }
      : Object.fromEntries(
          (intent.mode === "risk" ? [FIELDS.leverage_limit, FIELDS.stablecoin_buffer] : [FIELDS.concentration_limit]).map(
            (field) => [field.type, existingValue(memory.memories, field.type)],
          ),
        ),
  );
  const [busy, setBusy] = useState<"save" | "remove" | null>(null);
  const [error, setError] = useState<string | null>(null);

  const filled = fields.filter((field) => (values[field.type] ?? "").trim().length > 0);

  const save = async () => {
    if (filled.length === 0) {
      setError("Fill in at least one value, or close without saving.");
      return;
    }
    setBusy("save");
    setError(null);
    for (const field of filled) {
      const raw = values[field.type].trim();
      const value = field.kind === "percent" || field.kind === "multiple" ? Number(raw) : raw;
      const failure =
        intent.mode === "edit" ? await memory.update(intent.memory.id, value) : await memory.save(field.type, value);
      if (failure !== null) {
        setBusy(null);
        setError(`${field.label}: ${failure}`);
        return;
      }
    }
    setBusy(null);
    onDone();
  };

  const remove = async () => {
    if (intent.mode !== "edit") return;
    setBusy("remove");
    setError(null);
    const failure = await memory.remove(intent.memory.id);
    setBusy(null);
    if (failure !== null) setError(failure);
    else onDone();
  };

  return (
    <form
      onSubmit={(event) => {
        event.preventDefault();
        void save();
      }}
      className="flex flex-col gap-4 px-4 pb-4 pt-3"
    >
      {intent.mode === "new" && (
        <fieldset className="flex flex-col gap-1.5">
          <legend className="type-label mb-1.5 text-text-secondary">What kind of preference</legend>
          <div className="grid grid-cols-2 gap-1.5">
            {NEW_TYPES.map((type) => (
              <label
                key={type}
                className={cn(
                  "type-body-sm flex cursor-pointer items-center gap-2 rounded-control border px-2.5 py-2",
                  "transition-colors duration-[var(--dur-fast)] ease-brand has-[:focus-visible]:outline has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-focus-ring",
                  chosen === type
                    ? "border-accent-quiet bg-surface-hover text-text-primary"
                    : "border-border-subtle text-text-secondary hover:bg-surface-hover",
                )}
              >
                <input
                  type="radio"
                  name="preference-type"
                  value={type}
                  checked={chosen === type}
                  onChange={() => {
                    setChosen(type);
                    setError(null);
                  }}
                  className="sr-only"
                />
                {FIELDS[type].label}
              </label>
            ))}
          </div>
        </fieldset>
      )}

      {fields.map((field) => {
        const id = `pref-${field.type}`;
        const suffix = field.kind === "percent" ? "%" : field.kind === "multiple" ? "×" : null;
        return (
          <div key={field.type} className="flex flex-col gap-1.5">
            <label htmlFor={id} className="type-body-sm font-medium text-text-primary">
              {field.label}
            </label>
            <div className="relative">
              <input
                id={id}
                value={values[field.type] ?? ""}
                onChange={(event) => setValues((current) => ({ ...current, [field.type]: event.target.value }))}
                inputMode={suffix === null ? "text" : "decimal"}
                placeholder={field.placeholder}
                maxLength={field.kind === "text" ? 280 : 12}
                autoComplete="off"
                className={cn(input, suffix !== null && "pr-8 tabular-nums", field.kind === "symbol" && "uppercase")}
              />
              {suffix !== null && (
                <span aria-hidden className="type-body pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-text-muted">
                  {suffix}
                </span>
              )}
            </div>
            <p className="type-label text-text-muted">{field.hint}</p>
          </div>
        );
      })}

      {error !== null && (
        <p role="alert" className="type-body-sm rounded-control border border-negative/40 bg-negative-bg px-3 py-2 text-negative">
          {error}
        </p>
      )}

      <div className="flex flex-wrap items-center gap-2">
        {intent.mode === "edit" && (
          <button
            type="button"
            onClick={() => void remove()}
            disabled={busy !== null}
            className={cn(
              "type-body-sm inline-flex h-9 items-center gap-1.5 rounded-control px-2.5 text-negative",
              "transition-colors duration-[var(--dur-fast)] ease-brand hover:bg-negative-bg disabled:opacity-60",
            )}
          >
            {busy === "remove" ? (
              <Loader2 size={14} strokeWidth={1.75} aria-hidden className="motion-safe:animate-spin" />
            ) : (
              <Trash2 size={14} strokeWidth={1.5} aria-hidden />
            )}
            {busy === "remove" ? "Removing…" : "Remove"}
          </button>
        )}
        <span className="type-label ml-auto text-text-muted">Saved only when you choose.</span>
        <button
          type="submit"
          disabled={busy !== null}
          className={cn(
            "type-body-sm inline-flex h-9 items-center gap-1.5 rounded-control border border-accent px-4 font-medium text-text-primary",
            "transition-colors duration-[var(--dur-fast)] ease-brand hover:bg-surface-hover disabled:opacity-60",
          )}
        >
          {busy === "save" && <Loader2 size={14} strokeWidth={1.75} aria-hidden className="motion-safe:animate-spin" />}
          {busy === "save" ? "Saving…" : "Save"}
        </button>
      </div>
    </form>
  );
}

export function PreferenceEditor({
  intent,
  onClose,
  memory,
}: {
  intent: EditorIntent | null;
  onClose: () => void;
  memory: MemoryFeed;
}) {
  return (
    <Dialog open={intent !== null} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="w-[min(440px,calc(100vw-24px))] p-0">
        {intent !== null && (
          <>
            <DialogHeader className="border-b border-border-subtle px-4 py-3">
              <DialogTitle className="type-h2 text-text-primary">{TITLE[intent.mode]}</DialogTitle>
              <DialogDescription className="type-body-sm text-text-secondary">
                {intent.mode === "edit"
                  ? intent.memory.label
                  : "Elyra reads these on every question and holds its suggestions to them."}
              </DialogDescription>
            </DialogHeader>
            {/* Keyed so each opening starts from what is saved, not from the last draft. */}
            <Editor key={intent.mode === "edit" ? intent.memory.id : intent.mode} intent={intent} memory={memory} onDone={onClose} />
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}
