"use client";

import { useEffect, useRef, useState } from "react";
import { Check, ChevronDown, type LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";

/* ---------------------------------------------------------------------------
   A single-choice menu, shared by the Portfolio drawer's and the Capital
   Accounts page's account selectors.
--------------------------------------------------------------------------- */

export interface MenuOption {
  id: string;
  label: string;
  /** A short second column — a truncated address. */
  detail?: string | null;
}

/**
 * A single-choice menu: a trigger that names the current choice, and a
 * listbox under it. Arrow keys, Home and End move; Enter or a click chooses;
 * Escape closes and returns focus to the trigger without reaching anything
 * behind it (a drawer's own Escape, for one); a press outside closes it.
 */
export function OptionMenu({
  options,
  value,
  onChange,
  label,
  icon: Icon,
  align = "start",
  className,
}: {
  options: MenuOption[];
  value: string;
  onChange: (id: string) => void;
  /** What is being chosen, for assistive tech: "Account". */
  label: string;
  icon?: LucideIcon;
  align?: "start" | "end";
  className?: string;
}) {
  const [open, setOpen] = useState(false);
  const root = useRef<HTMLDivElement>(null);
  const trigger = useRef<HTMLButtonElement>(null);
  const current = options.find((option) => option.id === value) ?? options[0];

  /* Closes on a press anywhere else; listens only while open. */
  useEffect(() => {
    if (!open) return;
    const onDown = (event: PointerEvent) => {
      if (!root.current?.contains(event.target as Node)) setOpen(false);
    };
    document.addEventListener("pointerdown", onDown);
    return () => document.removeEventListener("pointerdown", onDown);
  }, [open]);

  /* Focus lands on the chosen option when the list opens. */
  useEffect(() => {
    if (open) root.current?.querySelector<HTMLElement>('[aria-selected="true"]')?.focus();
  }, [open]);

  const close = () => {
    setOpen(false);
    trigger.current?.focus();
  };

  return (
    <div ref={root} className="relative min-w-0">
      <button
        ref={trigger}
        type="button"
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-label={`${label}: ${current.label}`}
        onClick={() => setOpen((value) => !value)}
        onKeyDown={(event) => {
          if (event.key === "ArrowDown" && !open) {
            event.preventDefault();
            setOpen(true);
          }
        }}
        className={cn(
          "type-body-sm inline-flex h-9 max-w-full items-center justify-center gap-2 whitespace-nowrap rounded-control border border-border-subtle px-3 text-text-primary",
          "transition-colors duration-[var(--dur-fast)] ease-brand hover:border-border-strong hover:bg-surface-hover active:bg-surface-panel",
          className,
        )}
      >
        {Icon !== undefined && <Icon size={16} strokeWidth={1.5} aria-hidden className="shrink-0 text-text-secondary" />}
        <span className="min-w-0 truncate">{current.label}</span>
        <ChevronDown
          size={14}
          strokeWidth={1.5}
          aria-hidden
          className={cn("shrink-0 text-text-secondary transition-transform duration-[var(--dur-fast)] motion-reduce:transition-none", open && "rotate-180")}
        />
      </button>

      {open && (
        <ul
          role="listbox"
          aria-label={label}
          onKeyDown={(event) => {
            const items = [...(root.current?.querySelectorAll<HTMLElement>('[role="option"]') ?? [])];
            const at = items.indexOf(document.activeElement as HTMLElement);
            if (event.key === "Escape") {
              /* The menu's, not the drawer's or the page's. */
              event.preventDefault();
              close();
            } else if (event.key === "ArrowDown" || event.key === "ArrowUp") {
              event.preventDefault();
              const next = (at + (event.key === "ArrowDown" ? 1 : -1) + items.length) % items.length;
              items[next]?.focus();
            } else if (event.key === "Home" || event.key === "End") {
              event.preventDefault();
              items[event.key === "Home" ? 0 : items.length - 1]?.focus();
            } else if (event.key === "Tab") {
              setOpen(false);
            }
          }}
          className={cn(
            "absolute top-full z-40 mt-1 flex w-max min-w-full max-w-[min(18rem,80vw)] list-none flex-col rounded-control border border-border-strong bg-surface-raised p-1 shadow-pop",
            align === "end" ? "right-0" : "left-0",
          )}
        >
          {options.map((option) => {
            const selected = option.id === current.id;
            return (
              <li key={option.id} role="presentation">
                <button
                  type="button"
                  role="option"
                  aria-selected={selected}
                  tabIndex={selected ? 0 : -1}
                  onClick={() => {
                    onChange(option.id);
                    close();
                  }}
                  className={cn(
                    "type-body-sm flex w-full items-center gap-2 rounded-chip px-2 py-1.5 text-left",
                    "transition-colors duration-[var(--dur-fast)] ease-brand hover:bg-surface-hover focus-visible:bg-surface-hover focus-visible:outline-none",
                    selected ? "text-text-primary" : "text-text-secondary",
                  )}
                >
                  <Check size={13} strokeWidth={1.75} aria-hidden className={cn("shrink-0", selected ? "text-accent" : "opacity-0")} />
                  <span className="min-w-0 flex-1 truncate">{option.label}</span>
                  {option.detail != null && <span className="type-mono-addr shrink-0 text-text-muted">{option.detail}</span>}
                </button>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
