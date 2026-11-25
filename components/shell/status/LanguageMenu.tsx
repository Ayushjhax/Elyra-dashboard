"use client";

import { useState } from "react";
import { Check, Languages } from "lucide-react";
import { Popover } from "@/components/ui/Popover";
import { chooseLocale, useLocale, useT } from "@/lib/i18n/client";
import { LOCALE_NAMES, LOCALE_SHORT, LOCALES, type Locale } from "@/lib/i18n/locales";
import { cn } from "@/lib/utils";

/* ---------------------------------------------------------------------------
   The language switch, in the header on every route.

   Each language is named in itself — 简体中文, English — so a reader finds
   theirs without reading the other, and the trigger carries the universal
   文A mark beside the current one's short name. Choosing writes the cookie
   and reloads (lib/i18n/client.tsx says why). A flat panel with
   --shadow-pop: glass is the notifications and wallet menus' alone.
--------------------------------------------------------------------------- */

export function LanguageMenu() {
  const t = useT();
  const locale = useLocale();
  const [open, setOpen] = useState(false);
  const [switching, setSwitching] = useState<Locale | null>(null);

  const choose = (next: Locale) => {
    if (next === locale) {
      setOpen(false);
      return;
    }
    setSwitching(next);
    chooseLocale(next);
  };

  return (
    <Popover
      id="language-menu"
      label={t("Language")}
      open={open}
      onOpenChange={setOpen}
      className="w-[220px] p-1.5"
      trigger={
        <button
          type="button"
          aria-expanded={open}
          aria-controls="language-menu"
          aria-haspopup="dialog"
          aria-label={t("Language: {language}", { language: LOCALE_NAMES[locale] })}
          title={t("Language")}
          onClick={() => setOpen((value) => !value)}
          className={cn(
            "inline-flex h-9 shrink-0 items-center justify-center gap-1.5 rounded-control px-2",
            "text-text-secondary transition-colors duration-[var(--dur-fast)] ease-brand",
            "hover:bg-surface-hover hover:text-text-primary",
            open && "bg-surface-hover text-text-primary",
          )}
        >
          <Languages size={18} strokeWidth={1.5} aria-hidden />
          <span className="type-label hidden compact:inline">{LOCALE_SHORT[locale]}</span>
        </button>
      }
    >
      <p className="type-eyebrow px-2.5 pb-1 pt-1.5 text-text-muted">{t("Language")}</p>
      <div role="radiogroup" aria-label={t("Language")} className="flex flex-col">
        {LOCALES.map((option) => {
          const current = option === locale;
          return (
            <button
              key={option}
              type="button"
              role="radio"
              aria-checked={current}
              lang={option}
              disabled={switching !== null}
              data-autofocus={current ? "" : undefined}
              onClick={() => choose(option)}
              className={cn(
                "type-body-sm flex h-11 w-full items-center gap-3 rounded-control px-2.5 text-left",
                "transition-colors duration-[var(--dur-fast)] ease-brand hover:bg-surface-hover",
                current ? "text-text-primary" : "text-text-secondary hover:text-text-primary",
                "disabled:cursor-default disabled:opacity-60",
              )}
            >
              <span className="min-w-0 flex-1 truncate">{LOCALE_NAMES[option]}</span>
              {switching === option ? (
                <span aria-hidden className="size-1.5 rounded-pill bg-accent motion-safe:animate-pulse" />
              ) : (
                current && <Check size={16} strokeWidth={1.5} aria-hidden className="shrink-0 text-accent" />
              )}
            </button>
          );
        })}
      </div>
    </Popover>
  );
}
