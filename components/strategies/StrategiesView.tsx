"use client";

import { useId, useRef, useState } from "react";
import { BookOpen, ChevronRight, FolderOpen, PencilRuler, Trash2 } from "lucide-react";
import { AiLab } from "@/components/strategies/AiLab";
import { Designer, RuleWords, type Draft } from "@/components/strategies/Designer";
import { ResultLine } from "@/components/strategies/ResultCard";
import { DrawerCard } from "@/components/shell/RouteDrawer";
import { SkeletonRows } from "@/components/portfolio/primitives";
import { Button } from "@/components/ui/Button";
import { formatRelativeTime } from "@/lib/format";
import { useT } from "@/lib/i18n/client";
import type { LibraryStrategy } from "@/lib/strategies/library";
import { starterDesign, type StrategyDesign } from "@/lib/strategies/spec";
import type { DesignResult, SavedDesign } from "@/lib/strategies/types";
import { useStrategies, type StrategiesFeed } from "@/lib/strategies/useStrategies";
import { useMinute } from "@/lib/useClock";
import { cn } from "@/lib/utils";

/* ---------------------------------------------------------------------------
   Strategies: design a trading strategy from rules, start from Elyra's
   library, or ask Elyra's AI for ideas — and test every one on real market
   history with the same backtest engine. A research workspace: nothing here
   trades.

   One draft is open at a time; the library, the AI lab and the saved list
   each open into it. The four tabs are one tool, so every panel stays
   mounted while another is shown: a design half-made, the backtest's market
   and period, an idea typed into the AI lab — all still there on return.
--------------------------------------------------------------------------- */

type Tab = "design" | "library" | "ai" | "saved";
const TABS: readonly Tab[] = ["design", "library", "ai", "saved"];

function Tabs({ tab, onTab, savedCount, ids }: { tab: Tab; onTab: (tab: Tab) => void; savedCount: number; ids: Record<Tab, { tab: string; panel: string }> }) {
  const t = useT();
  const refs = useRef<Partial<Record<Tab, HTMLButtonElement | null>>>({});
  const label: Record<Tab, string> = {
    design: t("Design"),
    library: t("Library"),
    ai: t("AI lab"),
    saved: savedCount > 0 ? t("Saved ({count})", { count: savedCount }) : t("Saved"),
  };
  /* Arrow keys move between tabs and open the one they land on (WAI-ARIA tabs, automatic activation). */
  const go = (index: number) => {
    const next = TABS[(index + TABS.length) % TABS.length];
    onTab(next);
    refs.current[next]?.focus();
  };
  return (
    <div role="tablist" aria-label={t("Strategy views")} className="grid grid-cols-4 gap-1 rounded-control border border-border-subtle bg-surface-base p-1">
      {TABS.map((id, index) => (
        <button
          key={id}
          ref={(node) => {
            refs.current[id] = node;
          }}
          id={ids[id].tab}
          type="button"
          role="tab"
          aria-selected={tab === id}
          aria-controls={ids[id].panel}
          tabIndex={tab === id ? 0 : -1}
          onClick={() => onTab(id)}
          onKeyDown={(event) => {
            if (event.key === "ArrowRight") go(index + 1);
            else if (event.key === "ArrowLeft") go(index - 1);
            else if (event.key === "Home") go(0);
            else if (event.key === "End") go(TABS.length - 1);
            else return;
            event.preventDefault();
          }}
          className={cn(
            "type-label h-9 min-w-0 truncate rounded-chip px-1.5 transition-colors duration-[var(--dur-fast)] ease-brand",
            tab === id ? "bg-surface-active text-text-primary" : "text-text-secondary hover:bg-surface-hover hover:text-text-primary",
          )}
        >
          {label[id]}
        </button>
      ))}
    </div>
  );
}

function LibraryCard({ entry, onOpen }: { entry: LibraryStrategy; onOpen: () => void }) {
  const t = useT();
  const [open, setOpen] = useState(false);
  const id = useId();
  return (
    <li className="flex flex-col gap-2.5 rounded-card border border-border-subtle bg-surface-base p-3">
      <div className="flex flex-col gap-0.5">
        <span className="type-label text-text-muted">
          {t(entry.style)} · {entry.design.timeframe}
        </span>
        <h3 className="type-h2 text-text-primary">{t(entry.design.name)}</h3>
      </div>
      <p className="type-body-sm text-text-secondary">{t(entry.idea)}</p>
      <div>
        <button
          type="button"
          aria-expanded={open}
          aria-controls={`${id}-rules`}
          onClick={() => setOpen(!open)}
          className="type-label -mx-1 inline-flex min-h-8 items-center gap-1.5 rounded-control px-1 text-text-secondary transition-colors hover:text-text-primary"
        >
          <ChevronRight size={14} aria-hidden className={cn("transition-transform duration-[var(--dur-base)] ease-brand", open && "rotate-90")} />
          {t("View rules")}
        </button>
        <div id={`${id}-rules`} hidden={!open} className="mt-2 rounded-card border border-border-subtle bg-surface-raised p-3">
          <RuleWords design={entry.design} />
        </div>
      </div>
      <p className="type-label text-caution">{t(entry.watchOut)}</p>
      <div>
        <Button size="sm" variant="quiet" onClick={onOpen}>
          <PencilRuler size={13} aria-hidden /> {t("Open and backtest")}
        </Button>
      </div>
    </li>
  );
}

function SavedRow({ entry, feed, onOpen, now }: { entry: SavedDesign; feed: StrategiesFeed; onOpen: () => void; now: number | null }) {
  const t = useT();
  const [busy, setBusy] = useState(false);
  const source = entry.source === "ai" ? t("From Elyra's AI") : entry.source === "library" ? t("From the library") : t("Your design");
  return (
    <li className="flex flex-col gap-1 py-3 first:pt-0 last:pb-0">
      <div className="flex items-baseline justify-between gap-2">
        <span className="type-body-sm min-w-0 truncate font-medium text-text-primary">{entry.design.name}</span>
        <span className="type-label shrink-0 text-text-muted">
          {source} · {entry.design.timeframe}
        </span>
      </div>
      {entry.result !== null ? <ResultLine result={entry.result} /> : <span className="type-label text-text-muted">{t("Not backtested yet.")}</span>}
      {now !== null && <span className="type-label text-text-muted">{t("Saved {when}", { when: formatRelativeTime(entry.updatedAt, now, t.locale) })}</span>}
      <div className="mt-1 flex flex-wrap gap-2">
        <Button size="sm" variant="quiet" onClick={onOpen}>
          <FolderOpen size={13} aria-hidden /> {t("Open")}
        </Button>
        <Button
          size="sm"
          variant="ghost"
          disabled={busy}
          onClick={() => {
            setBusy(true);
            void feed.write(`/api/strategies/${entry.id}`, "DELETE").finally(() => setBusy(false));
          }}
          aria-label={t("Delete {name}", { name: entry.design.name })}
        >
          <Trash2 size={13} aria-hidden /> {t("Delete")}
        </Button>
      </div>
    </li>
  );
}

function NoSaved({ onDesign, onLibrary }: { onDesign: () => void; onLibrary: () => void }) {
  const t = useT();
  return (
    <div className="flex flex-col items-center gap-2 px-2 py-4 text-center">
      <FolderOpen size={32} strokeWidth={1.5} aria-hidden className="mb-1 text-accent" />
      <p className="type-panel-title text-text-primary">{t("No saved strategies yet")}</p>
      <p className="type-body-sm max-w-[36ch] text-text-secondary">{t("Save a strategy from Design, Library or AI lab to find it here.")}</p>
      <Button variant="accent" className="mt-2" onClick={onDesign}>
        {t("Design a strategy")}
      </Button>
      <button type="button" onClick={onLibrary} className="type-label min-h-8 rounded-control px-2 text-text-secondary underline underline-offset-2 hover:text-text-primary">
        {t("Browse library")}
      </button>
    </div>
  );
}

export function StrategiesView() {
  const t = useT();
  const feed = useStrategies();
  const now = useMinute();
  const base = useId();
  const ids = Object.fromEntries(TABS.map((tab) => [tab, { tab: `${base}-tab-${tab}`, panel: `${base}-panel-${tab}` }])) as Record<Tab, { tab: string; panel: string }>;
  const [tab, setTab] = useState<Tab>("design");
  const [draft, setDraft] = useState<Draft>(() => ({ design: starterDesign(t("My strategy")), parkedExit: null, source: "designer", savedId: null, result: null }));
  /* A new key remounts the designer, so its fields take the opened design's values. */
  const [opened, setOpened] = useState(0);

  const open = (next: Draft) => {
    setDraft(next);
    setOpened((count) => count + 1);
    setTab("design");
  };
  const openLibrary = (entry: LibraryStrategy) =>
    open({ design: { ...entry.design, name: t(entry.design.name), summary: t(entry.idea) }, parkedExit: null, source: "library", savedId: null, result: null });
  const openGenerated = (design: StrategyDesign, result: DesignResult | null) => open({ design, parkedExit: null, source: "ai", savedId: null, result });

  const saved = feed.data?.saved ?? [];
  const library = feed.data?.library ?? [];
  const panel = (id: Tab) => ({ id: ids[id].panel, role: "tabpanel" as const, "aria-labelledby": ids[id].tab, hidden: tab !== id, className: "flex min-w-0 flex-col gap-3" });

  return (
    <>
      <p className="type-body-sm px-1 text-text-secondary">{t("Research workspace · Historical backtests only.")}</p>
      <Tabs tab={tab} onTab={setTab} savedCount={saved.length} ids={ids} />

      <div {...panel("design")}>
        <Designer key={opened} draft={draft} onChange={setDraft} feed={feed} />
      </div>

      <div {...panel("library")}>
        <DrawerCard icon={BookOpen} title={t("Strategy library")}>
          <div className="flex flex-col gap-3">
            <p className="type-body-sm text-text-secondary">
              {t("Well-known approaches, written out as rules, each with how it tends to fail. None comes with a promised return: open one, test it on your market, and change it.")}
            </p>
            {feed.loading && library.length === 0 ? (
              <SkeletonRows rows={4} />
            ) : (
              <ul className="flex flex-col gap-3">
                {library.map((entry) => (
                  <LibraryCard key={entry.id} entry={entry} onOpen={() => openLibrary(entry)} />
                ))}
              </ul>
            )}
          </div>
        </DrawerCard>
      </div>

      <div {...panel("ai")}>
        <AiLab feed={feed} onOpen={openGenerated} />
      </div>

      <div {...panel("saved")}>
        <DrawerCard icon={FolderOpen} title={t("Your strategies")}>
          {!feed.signedIn ? (
            <p className="type-body-sm text-text-secondary">{t("Sign in to keep the strategies you design.")}</p>
          ) : feed.loading && feed.data === null ? (
            <SkeletonRows rows={3} />
          ) : feed.data === null ? (
            <p className="type-body-sm text-text-secondary">{feed.error ?? t("Strategies could not be read.")}</p>
          ) : feed.data.error ? (
            <p className="type-body-sm text-text-secondary">{feed.data.error}</p>
          ) : saved.length === 0 ? (
            /* "Design a strategy" returns to the draft as it is; nothing is reset. */
            <NoSaved onDesign={() => setTab("design")} onLibrary={() => setTab("library")} />
          ) : (
            <ul className="flex flex-col divide-y divide-border-subtle">
              {saved.map((entry) => (
                <SavedRow
                  key={entry.id}
                  entry={entry}
                  feed={feed}
                  now={now}
                  onOpen={() => open({ design: entry.design, parkedExit: null, source: entry.source, savedId: entry.id, result: entry.result })}
                />
              ))}
            </ul>
          )}
        </DrawerCard>
      </div>
    </>
  );
}
