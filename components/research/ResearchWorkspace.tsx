"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { ReportsTab } from "./ReportsTab";
import { BacktestsTab } from "./BacktestsTab";
import { PredictionMarketsTab } from "./PredictionMarketsTab";
import { RecapTab } from "./RecapTab";
import { SignalsTab } from "./SignalsTab";
import { YieldTab } from "./YieldTab";
import { UnlocksTab } from "./UnlocksTab";
import "./research.css";

const TABS = [
  ["reports", "Reports"],
  ["backtests", "Backtests"],
  ["prediction", "Prediction Markets"],
  ["recap", "Market Recap"],
  ["signals", "Signals"],
  ["yield", "Yield"],
  ["unlocks", "Unlocks"],
] as const;
type Tab = (typeof TABS)[number][0];

export function ResearchWorkspace() {
  const router = useRouter();
  const params = useSearchParams();
  const raw = params.get("tab");
  const tab: Tab = TABS.find(([id]) => id === raw)?.[0] ?? "reports";
  const [visited, setVisited] = useState<Set<Tab>>(() => new Set([tab]));
  const nav = useRef<HTMLDivElement>(null);
  const select = (next: Tab) => {
    setVisited((current) => new Set([...current, next]));
    const query = new URLSearchParams(params.toString());
    query.set("tab", next);
    router.replace(`/research?${query}`, { scroll: false });
  };
  useEffect(() => {
    // Scroll only the tab strip; never move the workspace or document.
    const strip = nav.current;
    const button = strip?.querySelector<HTMLElement>('[aria-selected="true"]');
    if (!strip || !button) return;
    const left = button.offsetLeft - strip.offsetLeft;
    if (left < strip.scrollLeft) strip.scrollLeft = left;
    else if (left + button.offsetWidth > strip.scrollLeft + strip.clientWidth)
      strip.scrollLeft = left + button.offsetWidth - strip.clientWidth;
  }, [tab]);
  return (
    <div className="research-workspace">
      <header className="r-header">
        <h1>Research</h1>
        <p>Filings, markets, signals and event intelligence.</p>
      </header>
      <div ref={nav} className="r-tabs" role="tablist" aria-label="Research">
        {TABS.map(([id, label], index) => (
          <button
            key={id}
            id={`research-tab-${id}`}
            type="button"
            role="tab"
            aria-selected={tab === id}
            aria-controls={`research-panel-${id}`}
            tabIndex={tab === id ? 0 : -1}
            onClick={() => select(id)}
            onKeyDown={(event) => {
              const key = event.key;
              if (!["ArrowRight", "ArrowLeft", "Home", "End"].includes(key))
                return;
              event.preventDefault();
              const next =
                key === "Home"
                  ? 0
                  : key === "End"
                    ? TABS.length - 1
                    : (index + (key === "ArrowRight" ? 1 : -1) + TABS.length) %
                      TABS.length;
              select(TABS[next][0]);
              (
                event.currentTarget.parentElement?.children[next] as HTMLElement
              )?.focus();
            }}
          >
            {label}
          </button>
        ))}
      </div>
      {TABS.map(
        ([id]) =>
          (visited.has(id) || id === tab) && (
            <section
              className="r-tabpanel"
              key={id}
              id={`research-panel-${id}`}
              role="tabpanel"
              aria-labelledby={`research-tab-${id}`}
              hidden={tab !== id}
              tabIndex={0}
            >
              {id === "reports" && <ReportsTab active={tab === id} />}
              {id === "backtests" && <BacktestsTab />}
              {id === "prediction" && <PredictionMarketsTab />}
              {id === "recap" && <RecapTab active={tab === id} />}
              {id === "signals" && <SignalsTab active={tab === id} />}
              {id === "yield" && <YieldTab active={tab === id} />}
              {id === "unlocks" && (
                <UnlocksTab
                  active={tab === id}
                  onReports={() => select("reports")}
                />
              )}
            </section>
          ),
      )}
    </div>
  );
}
