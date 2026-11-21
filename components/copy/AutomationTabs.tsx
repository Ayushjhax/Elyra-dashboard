"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useT } from "@/lib/i18n/client";
import { msg } from "@/lib/i18n/translate";
import { cn } from "@/lib/utils";

/* ---------------------------------------------------------------------------
   Automation's two pages: the person's own rules, and copy trading. Links,
   not tabs, so each is a route of its own — beside the chart, with the
   rail's Automation lit for both.
--------------------------------------------------------------------------- */

const PAGES = [
  { href: "/automation", label: msg("Your rules") },
  { href: "/automation/copy", label: msg("Copy trading") },
] as const;

export function AutomationTabs() {
  const t = useT();
  const pathname = usePathname();
  return (
    <nav aria-label={t("Automation")} className="grid grid-cols-2 gap-1 rounded-control border border-border-subtle bg-surface-base p-1">
      {PAGES.map((page) => {
        const active = pathname === page.href;
        return (
          <Link
            key={page.href}
            href={page.href}
            aria-current={active ? "page" : undefined}
            className={cn(
              "type-label flex h-8 items-center justify-center rounded-chip transition-colors duration-[var(--dur-fast)] ease-brand",
              active ? "bg-surface-active text-text-primary" : "text-text-secondary hover:bg-surface-hover hover:text-text-primary",
            )}
          >
            {t(page.label)}
          </Link>
        );
      })}
    </nav>
  );
}
