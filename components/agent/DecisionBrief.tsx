"use client";

import { useId, useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import { Bell, ChevronDown, Layers, LineChart, Target, type LucideIcon } from "lucide-react";
import { useElyraAuth } from "@/components/providers/PrivyClientProvider";
import { requestAlert } from "@/lib/alerts/alertRequest";
import { useAlerts } from "@/lib/alerts/useAlerts";
import { exposureLine, watchNextLine, type BriefLine } from "@/lib/market/brief";
import { leadLevel, priceContextLine } from "@/lib/market/chartBrief";
import { isFullBleedRoute } from "@/lib/layout";
import { useChartFacts } from "@/lib/market/useChartFacts";
import { useLevels } from "@/lib/market/useLevels";
import { useAssets, usePrice } from "@/lib/market/usePrices";
import { usePortfolio } from "@/lib/portfolio/usePortfolio";
import { useElyraStore } from "@/lib/store";
import { useMinute } from "@/lib/useClock";
import { cn } from "@/lib/utils";
import { useT } from "@/lib/i18n/client";

/* ---------------------------------------------------------------------------
   The decision brief, about the market on the chart.

   - The lead: the level nearest the live quote — the prior-day pivot, or the
     24h range's edge where there are no pivots — how far it is, and "Set
     alert", which opens the chart's alert form with this market and that
     price filled in (lib/alerts/alertRequest.ts). Nothing is saved until the
     person sets it there.
   - Price context: the live quote against the EMA 20 at the chart's
     interval, named with both — the same figures as the chart's legend
     (lib/market/useChartFacts.ts), so the two agree on every market and
     interval.
   - Exposure: what the signed-in account actually holds in this market,
     spot and perp, from /api/portfolio.

   Facts only. No line says what price will do, or what to trade; every line
   says where it came from, and says plainly when it cannot be computed.
--------------------------------------------------------------------------- */

function LineBody({ line }: { line: BriefLine }) {
  const t = useT();
  if (line.kind === "loading") return <span aria-label={t("Loading")} className="skeleton block h-4 w-4/5" />;
  if (line.kind === "unavailable") return <p className="type-body-sm text-text-muted">{line.text}</p>;
  return (
    <>
      <p className="type-body-sm text-text-primary">{line.text}</p>
      <p className="type-data-sm mt-0.5 text-text-muted">{line.source}</p>
    </>
  );
}

/** A compact section under the lead, open by default, collapsible. */
function BriefSection({ title, icon: Icon, line }: { title: string; icon: LucideIcon; line: BriefLine }) {
  const [open, setOpen] = useState(true);
  const bodyId = useId();
  return (
    <section aria-label={title} className="rounded-card border border-border-subtle bg-surface-raised">
      <h3>
        <button
          type="button"
          aria-expanded={open}
          aria-controls={bodyId}
          onClick={() => setOpen(!open)}
          className="flex w-full items-center gap-2 rounded-card px-3 py-2 text-left"
        >
          <Icon size={14} strokeWidth={1.5} aria-hidden className="shrink-0 text-text-muted" />
          <span className="type-eyebrow text-text-secondary">{title}</span>
          <ChevronDown
            size={14}
            strokeWidth={1.5}
            aria-hidden
            className={cn(
              "ml-auto text-text-muted transition-transform duration-[var(--dur-base)] ease-brand motion-reduce:transition-none",
              !open && "-rotate-90",
            )}
          />
        </button>
      </h3>
      <div id={bodyId} hidden={!open} className="px-3 pb-2.5">
        <LineBody line={line} />
      </div>
    </section>
  );
}

export function DecisionBrief() {
  const t = useT();
  const open = useElyraStore((state) => state.decisionBriefOpen);
  const setOpen = useElyraStore((state) => state.setDecisionBriefOpen);
  const selectedAssetId = useElyraStore((state) => state.selectedAssetId);
  const interval = useElyraStore((state) => state.interval);
  const { byId } = useAssets([selectedAssetId]);
  const asset = byId.get(selectedAssetId);
  const symbol = asset?.symbol.toUpperCase() ?? "";
  const { row } = usePrice(selectedAssetId);
  const auth = useElyraAuth();
  const feed = usePortfolio();
  const alerts = useAlerts();
  /* The exchange sources list crypto only: pivots and candles are crypto's. */
  const candleSymbol = asset?.assetType === "crypto" ? symbol : null;
  const { data: levelData, loading: levelsLoading } = useLevels(candleSymbol);
  const { data: facts, loading: factsLoading } = useChartFacts(candleSymbol, interval);
  const now = useMinute();
  const bodyId = useId();
  const pathname = usePathname();
  const router = useRouter();

  const lead = symbol ? leadLevel(symbol, row, levelData?.levels ?? null, levelsLoading, t) : ({ kind: "loading" } as const);
  const context = symbol ? priceContextLine(symbol, row, facts, factsLoading, interval, now, t) : ({ kind: "loading" } as const);
  const exposure = symbol
    ? exposureLine(symbol, { ...feed, available: auth.available, ready: auth.ready, authenticated: auth.authenticated }, now, t)
    : ({ kind: "loading" } as const);
  /* What is already armed here, so a second alert on the same level is a choice, not an accident. */
  const armed = symbol !== "" && alerts.alerts.some((alert) => alert.symbol === symbol && alert.triggeredAt === null);
  const armedLine = armed ? watchNextLine(symbol, row, alerts, levelData?.levels ?? null, "web", t) : null;

  const setAlert = () => {
    if (lead.kind !== "ready") return;
    /* A full-bleed route hides the workspace, chart and all; the form is on the chart. */
    if (isFullBleedRoute(pathname)) router.push("/");
    requestAlert({ symbol, target: lead.target, direction: lead.direction });
  };

  return (
    <section aria-label={t("Decision brief")} className="flex flex-col gap-2">
      <div className="rounded-card border border-border-subtle bg-surface-raised">
        <button
          type="button"
          aria-expanded={open}
          aria-controls={bodyId}
          onClick={() => setOpen(!open)}
          className="flex w-full items-center gap-2 rounded-card px-3 py-2.5 text-left"
        >
          <span className="type-eyebrow text-text-secondary">{t("Decision brief")}</span>
          {symbol && <span className="type-data-sm text-text-secondary">· {symbol}</span>}
          <ChevronDown
            size={14}
            strokeWidth={1.5}
            aria-hidden
            className={cn(
              "ml-auto text-text-muted transition-transform duration-[var(--dur-base)] ease-brand motion-reduce:transition-none",
              !open && "-rotate-90",
            )}
          />
        </button>

        <div id={bodyId} hidden={!open} className="px-3 pb-3">
          <div className="flex gap-3 rounded-card border border-border-strong bg-surface-panel p-3">
            <Target size={18} strokeWidth={1.5} aria-hidden className="mt-0.5 shrink-0 text-text-secondary" />
            <div className="min-w-0 flex-1">
              <p className="type-label text-text-muted">
                {t("Nearest level")}
                {lead.kind === "ready" ? ` · ${lead.source}` : ""}
              </p>
              {lead.kind === "loading" ? (
                <span aria-label={t("Loading")} className="skeleton mt-1 block h-5 w-3/5" />
              ) : lead.kind === "unavailable" ? (
                <p className="type-body-sm mt-0.5 text-text-muted">{lead.text}</p>
              ) : (
                <>
                  <p className="type-panel-title font-sans tabular-nums text-text-primary">{lead.title}</p>
                  <p className="type-body-sm text-text-secondary">{lead.detail}</p>
                </>
              )}
            </div>
          </div>

          <div className="mt-2.5 flex flex-wrap items-center gap-x-3 gap-y-2">
            <button
              type="button"
              onClick={setAlert}
              disabled={lead.kind !== "ready"}
              aria-haspopup="dialog"
              aria-label={
                lead.kind === "ready"
                  ? t("Set an alert on {symbol} at {title}", { symbol, title: lead.title })
                  : t("Set alert")
              }
              className={cn(
                "type-label inline-flex h-8 items-center gap-1.5 rounded-control bg-accent px-3 font-semibold text-text-on-accent",
                "transition-colors duration-[var(--dur-fast)] ease-brand hover:bg-accent-hover disabled:opacity-50",
              )}
            >
              <Bell size={14} strokeWidth={1.75} aria-hidden />
              {t("Set alert")}
            </button>
            {armedLine !== null && armedLine.kind === "ready" && (
              <p className="type-label min-w-0 flex-1 text-text-muted">{armedLine.text}</p>
            )}
          </div>
        </div>
      </div>

      {open && (
        <>
          <BriefSection title={t("Price context")} icon={LineChart} line={context} />
          <BriefSection title={t("Exposure")} icon={Layers} line={exposure} />
        </>
      )}
    </section>
  );
}
