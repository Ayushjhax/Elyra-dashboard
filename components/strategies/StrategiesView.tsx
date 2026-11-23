"use client";

import { useState } from "react";
import { BookOpen, FolderOpen, PencilRuler, Trash2 } from "lucide-react";
import { AiLab } from "@/components/strategies/AiLab";
import { Designer, type Draft } from "@/components/strategies/Designer";
import { ResultLine } from "@/components/strategies/ResultCard";
import { DrawerCard } from "@/components/shell/RouteDrawer";
import { SkeletonRows } from "@/components/portfolio/primitives";
import { Button } from "@/components/ui/Button";
import { formatRelativeTime } from "@/lib/format";
import { useT } from "@/lib/i18n/client";
import type { LibraryStrategy } from "@/lib/strategies/library";
import { describeDesign, starterDesign, type StrategyDesign } from "@/lib/strategies/spec";
import type { DesignResult, SavedDesign } from "@/lib/strategies/types";
import { useStrategies, type StrategiesFeed } from "@/lib/strategies/useStrategies";
import { useMinute } from "@/lib/useClock";
import { cn } from "@/lib/utils";

/* ---------------------------------------------------------------------------
   Strategies: design a trading strategy from rules, start from Elyra's
   library, or ask Elyra's AI for ideas — and test every one on real market
   history with the same backtest engine.

   One draft is open at a time; the library, the AI lab and the saved list
   each open into it. Nothing here trades: a strategy is tested on history,
   and the person decides what, if anything, to do with it.
--------------------------------------------------------------------------- */

type Tab = "design" | "library" | "ai" | "saved";

function Tabs({ tab, onTab, savedCount }: { tab: Tab; onTab: (tab: Tab) => void; savedCount: number }) {
  const t = useT();
  const entries: Array<[Tab, string]> = [
    ["design", t("Design")],
    ["library", t("Library")],
    ["ai", t("AI lab")],
    ["saved", savedCount > 0 ? t("Saved ({count})", { count: savedCount }) : t("Saved")],
  ];
  return (
    <div role="tablist" aria-label={t("Strategy views")} className="grid grid-cols-4 gap-1 rounded-control border border-border-subtle bg-surface-base p-0.5">
      {entries.map(([id, label]) => (
        <button
          key={id}
          type="button"
          role="tab"
          aria-selected={tab === id}
          onClick={() => onTab(id)}
          className={cn("type-label h-9 truncate rounded-chip px-1.5 transition-colors", tab === id ? "bg-surface-raised text-text-primary" : "text-text-muted hover:text-text-primary")}
        >
          {label}
        </button>
      ))}
    </div>
  );
}

function LibraryCard({ entry, onOpen }: { entry: LibraryStrategy; onOpen: () => void }) {
  const t = useT();
  const words = describeDesign(entry.design, t);
  return (
    <li className="flex flex-col gap-2 rounded-card border border-border-subtle bg-surface-raised p-3">
      <div className="flex flex-col gap-0.5">
        <span className="type-eyebrow text-text-muted">
          {t(entry.style)} · {entry.design.timeframe}
        </span>
        <span className="type-body-sm font-medium text-text-primary">{t(entry.design.name)}</span>
      </div>
      <p className="type-label text-text-secondary">{t(entry.idea)}</p>
      <details>
        <summary className="type-label cursor-pointer text-text-muted hover:text-text-primary">{t("The rules")}</summary>
        <p className="type-label mt-1 text-text-secondary">{words.entry}</p>
        <p className="type-label text-text-secondary">{words.exit}</p>
      </details>
      <p className="type-label text-caution">
        <span className="text-text-muted">{t("Watch out: ")}</span>
        {t(entry.watchOut)}
      </p>
      <div>
        <Button size="xs" variant="quiet" onClick={onOpen}>
          <PencilRuler size={12} aria-hidden /> {t("Open and backtest")}
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
    <li className="flex flex-col gap-1 py-2.5 first:pt-0 last:pb-0">
      <div className="flex items-baseline justify-between gap-2">
        <span className="type-body-sm min-w-0 truncate font-medium text-text-primary">{entry.design.name}</span>
        <span className="type-label shrink-0 text-text-muted">
          {source} · {entry.design.timeframe}
        </span>
      </div>
      {entry.result !== null ? <ResultLine result={entry.result} /> : <span className="type-label text-text-muted">{t("Not backtested yet.")}</span>}
      {now !== null && <span className="type-label text-text-muted">{t("Saved {when}", { when: formatRelativeTime(entry.updatedAt, now) })}</span>}
      <div className="mt-1 flex flex-wrap gap-2">
        <Button size="xs" variant="quiet" onClick={onOpen}>
          <FolderOpen size={12} aria-hidden /> {t("Open")}
        </Button>
        <Button
          size="xs"
          variant="ghost"
          disabled={busy}
          onClick={() => {
            setBusy(true);
            void feed.write(`/api/strategies/${entry.id}`, "DELETE").finally(() => setBusy(false));
          }}
          aria-label={t("Delete {name}", { name: entry.design.name })}
        >
          <Trash2 size={12} aria-hidden /> {t("Delete")}
        </Button>
      </div>
    </li>
  );
}

export function StrategiesView() {
  const t = useT();
  const feed = useStrategies();
  const now = useMinute();
  const [tab, setTab] = useState<Tab>("design");
  const [draft, setDraft] = useState<Draft>(() => ({ design: starterDesign(t("My strategy")), source: "designer", savedId: null, result: null }));
  /* A new key remounts the designer, so its fields take the opened design's values. */
  const [opened, setOpened] = useState(0);

  const open = (next: Draft) => {
    setDraft(next);
    setOpened((count) => count + 1);
    setTab("design");
  };
  const openLibrary = (entry: LibraryStrategy) =>
    open({ design: { ...entry.design, name: t(entry.design.name), summary: t(entry.idea) }, source: "library", savedId: null, result: null });
  const openGenerated = (design: StrategyDesign, result: DesignResult | null) => open({ design, source: "ai", savedId: null, result });

  const saved = feed.data?.saved ?? [];
  const library = feed.data?.library ?? [];

  return (
    <>
      <p className="type-body-sm px-1 text-text-secondary">
        {t("Design a strategy from rules, start from Elyra's library, or ask Elyra's AI for ideas — then test it on real market history. Nothing here trades.")}
      </p>
      <Tabs tab={tab} onTab={setTab} savedCount={saved.length} />

      {tab === "design" && <Designer key={opened} draft={draft} onChange={setDraft} feed={feed} />}

      {tab === "library" && (
        <DrawerCard icon={BookOpen} title={t("Elyra's library")}>
          <div className="flex flex-col gap-3">
            <p className="type-body-sm text-text-secondary">
              {t("Well-known approaches, written out as rules, each with how it tends to fail. None comes with a promised return: open one, test it on your market, and change it.")}
            </p>
            {feed.loading && library.length === 0 ? (
              <SkeletonRows rows={4} />
            ) : (
              <ul className="flex flex-col gap-2">
                {library.map((entry) => (
                  <LibraryCard key={entry.id} entry={entry} onOpen={() => openLibrary(entry)} />
                ))}
              </ul>
            )}
          </div>
        </DrawerCard>
      )}

      {tab === "ai" && <AiLab feed={feed} onOpen={openGenerated} />}

      {tab === "saved" && (
        <DrawerCard icon={FolderOpen} title={t("Your strategies")}>
          {!feed.signedIn ? (
            <p className="type-body-sm text-text-secondary">{t("Sign in to keep the strategies you design.")}</p>
          ) : feed.data?.error ? (
            <p className="type-body-sm text-text-secondary">{feed.data.error}</p>
          ) : saved.length === 0 ? (
            <p className="type-body-sm text-text-secondary">{t("Nothing saved yet. Design one, or open one from the library or the AI lab, and save it.")}</p>
          ) : (
            <ul className="flex flex-col divide-y divide-border-subtle">
              {saved.map((entry) => (
                <SavedRow
                  key={entry.id}
                  entry={entry}
                  feed={feed}
                  now={now}
                  onOpen={() => open({ design: entry.design, source: entry.source, savedId: entry.id, result: entry.result })}
                />
              ))}
            </ul>
          )}
        </DrawerCard>
      )}
    </>
  );
}
