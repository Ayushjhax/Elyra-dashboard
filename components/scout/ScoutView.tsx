"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { AutoBuysTab } from "@/components/scout/AutoBuysTab";
import { PolyBasketsTab } from "@/components/scout/PolyBasketsTab";
import { PolyScanTab } from "@/components/scout/PolyScanTab";
import { ReadTab } from "@/components/scout/ReadTab";
import { SmartMoneyTab } from "@/components/scout/SmartMoneyTab";
import { useT } from "@/lib/i18n/client";
import { msg } from "@/lib/i18n/translate";
import { cn } from "@/lib/utils";

/* ---------------------------------------------------------------------------
   Scout: read any video, post or article with every claim graded; see what
   smart money just did; let it trigger auto-buys; scan Polymarket and hold
   its outcomes in paper baskets. Free to run: public data and Gemini's free
   tier. The tab is in the address (`?tab=`), so a notice can open one.
--------------------------------------------------------------------------- */

const TABS = [
  ["read", msg("Read")],
  ["smart", msg("Smart money")],
  ["autobuys", msg("Auto-buys")],
  ["polyscan", msg("Poly scan")],
  ["baskets", msg("Poly baskets")],
] as const;
type Tab = (typeof TABS)[number][0];

export function ScoutView() {
  const t = useT();
  const router = useRouter();
  const params = useSearchParams();
  const raw = params.get("tab");
  const tab: Tab = TABS.find(([id]) => id === raw)?.[0] ?? "read";
  const select = (next: Tab) => {
    const query = new URLSearchParams(params.toString());
    query.set("tab", next);
    router.replace(`/scout?${query}`, { scroll: false });
  };

  return (
    <>
      {/* Five equal columns; a long label wraps inside its own tab, so the strip never leaves one tab on a row of its own. */}
      <div role="tablist" aria-label={t("Scout")} className="grid grid-cols-5 gap-1 rounded-control border border-border-subtle bg-surface-base p-0.5">
        {TABS.map(([id, label]) => (
          <button
            key={id}
            type="button"
            role="tab"
            aria-selected={tab === id}
            onClick={() => select(id)}
            className={cn(
              "type-label flex min-h-9 items-center justify-center rounded-chip px-1 py-1 text-center leading-tight transition-colors",
              tab === id ? "bg-surface-raised text-text-primary" : "text-text-muted hover:text-text-primary",
            )}
          >
            {t(label)}
          </button>
        ))}
      </div>
      {tab === "read" && <ReadTab />}
      {tab === "smart" && <SmartMoneyTab />}
      {tab === "autobuys" && <AutoBuysTab />}
      {tab === "polyscan" && <PolyScanTab onOpenBaskets={() => select("baskets")} />}
      {tab === "baskets" && <PolyBasketsTab onOpenScan={() => select("polyscan")} />}
    </>
  );
}
