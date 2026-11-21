"use client";

import { useCallback, useEffect, useState } from "react";
import { RefreshCw } from "lucide-react";
import { Problem, Timestamp } from "@/components/research/shared";
import { DataTable, type Column } from "@/components/ui/DataTable";
import { formatCompactUsd, formatPriceUsd } from "@/lib/format";
import { useT } from "@/lib/i18n/client";
import { msg, type Translator } from "@/lib/i18n/translate";
import type { ArbitrageScan } from "@/lib/research/arbitrage";
import { BASIS_ROUND_TRIP_BPS, clearsCosts, FUNDING_ROUND_TRIP_BPS, type ArbitrageRow } from "@/lib/research/arbitrageMath";
import { cn } from "@/lib/utils";

/* ---------------------------------------------------------------------------
   Arbitrage: where Hyperliquid's perps and Binance disagree, and whether the
   gap survives the fees. Read-only — Elyra places no orders on Binance and
   no arbitrage of any kind — and refreshed by hand: a gap is worth
   re-reading, not watching tick. lib/research/arbitrageMath.ts holds the
   arithmetic and the reasons it is an observation, not a trade.
--------------------------------------------------------------------------- */

function useScan(active: boolean) {
  const [state, setState] = useState<{ data: ArbitrageScan | null; loading: boolean; failed: boolean }>({ data: null, loading: true, failed: false });
  const [attempt, setAttempt] = useState(0);
  useEffect(() => {
    if (!active) return;
    let cancelled = false;
    fetch("/api/research/arbitrage")
      .then(async (response) => (await response.json()) as ArbitrageScan)
      .then((data) => !cancelled && setState({ data, loading: false, failed: false }))
      .catch(() => !cancelled && setState((current) => ({ ...current, loading: false, failed: true })));
    return () => {
      cancelled = true;
    };
  }, [active, attempt]);
  const reload = useCallback(() => {
    setState((current) => ({ ...current, loading: true }));
    setAttempt((value) => value + 1);
  }, []);
  return { ...state, reload };
}

const signed = (value: number | null, digits = 1, unit = "") =>
  value === null ? "—" : `${value > 0 ? "+" : ""}${value.toFixed(digits)}${unit}`;

function basisLine(row: ArbitrageRow, t: Translator): string {
  if (row.basisBps === null || row.netBasisBps === null) return t("No spot price on Binance.");
  const side = row.basisSide === "perp-rich" ? t("perp above spot") : t("perp below spot");
  return row.netBasisBps > 0
    ? t("{bps} bps {side}, {net} bps left after fees.", { bps: Math.abs(row.basisBps).toFixed(1), side, net: row.netBasisBps.toFixed(1) })
    : t("{bps} bps {side}, less than the fees.", { bps: Math.abs(row.basisBps).toFixed(1), side });
}

function fundingLine(row: ArbitrageRow, t: Translator): string {
  if (row.fundingSpreadApr === null) return t("No perp funding on Binance.");
  const pays = row.fundingSide === "hyperliquid-pays-more" ? t("Hyperliquid's longs pay more") : t("Binance's longs pay more");
  return row.breakEvenDays === null
    ? t("{spread} pts a year apart; {pays}.", { spread: Math.abs(row.fundingSpreadApr).toFixed(1), pays })
    : t("{spread} pts a year apart; {pays}; covers the fees in {days} days at today's rates.", {
        spread: Math.abs(row.fundingSpreadApr).toFixed(1),
        pays,
        days: row.breakEvenDays < 10 ? row.breakEvenDays.toFixed(1) : Math.round(row.breakEvenDays),
      });
}

export function ArbitrageTab({ active }: { active: boolean }) {
  const t = useT();
  const { data, loading, failed, reload } = useScan(active);
  const rows = data?.rows ?? [];

  const columns: Column<ArbitrageRow>[] = [
    { key: "market", header: msg("Market"), width: "14%", render: (row) => <span className="type-data-sm text-text-primary">{row.symbol}</span> },
    { key: "hl", header: msg("Hyperliquid perp"), align: "right", width: "16%", className: "hidden @[48rem]:table-cell", render: (row) => <span className="type-data-sm">{row.hyperliquidMark === null ? "—" : formatPriceUsd(row.hyperliquidMark)}</span> },
    { key: "spot", header: msg("Binance spot"), align: "right", width: "16%", className: "hidden @[48rem]:table-cell", render: (row) => <span className="type-data-sm">{row.binanceSpot === null ? "—" : formatPriceUsd(row.binanceSpot)}</span> },
    {
      key: "basis",
      header: msg("Basis (bps)"),
      align: "right",
      width: "13%",
      render: (row) => <span className={cn("type-data-sm", row.netBasisBps !== null && row.netBasisBps > 0 ? "text-accent" : "text-text-secondary")}>{signed(row.basisBps)}</span>,
    },
    { key: "hlf", header: msg("HL funding APR"), align: "right", width: "14%", render: (row) => <span className="type-data-sm">{signed(row.hyperliquidFundingApr, 1, "%")}</span> },
    { key: "bnf", header: msg("Binance funding APR"), align: "right", width: "14%", className: "hidden @[40rem]:table-cell", render: (row) => <span className="type-data-sm">{signed(row.binanceFundingApr, 1, "%")}</span> },
    {
      key: "spread",
      header: msg("Funding gap"),
      align: "right",
      width: "13%",
      render: (row) => (
        <span className={cn("type-data-sm", row.breakEvenDays !== null && row.breakEvenDays <= 14 ? "text-accent" : "text-text-secondary")}>{signed(row.fundingSpreadApr, 1, " pts")}</span>
      ),
    },
  ];

  const worth = rows.filter(clearsCosts);

  return (
    <div className="@container flex flex-col gap-4">
      <div className="r-toolbar">
        <p className="type-body-sm min-w-0 flex-1 text-text-secondary">
          {t("Hyperliquid's most traded perps against Binance's spot and perps, net of taker fees: {basis} bps for a basis round trip, {funding} bps for a funding one.", {
            basis: BASIS_ROUND_TRIP_BPS.toFixed(0),
            funding: FUNDING_ROUND_TRIP_BPS.toFixed(0),
          })}
        </p>
        <button type="button" className="r-button" onClick={reload} disabled={loading}>
          <RefreshCw size={14} strokeWidth={1.5} aria-hidden className={cn(loading && "motion-safe:animate-spin")} />
          {t("Refresh")}
        </button>
      </div>

      {failed && <Problem retry={reload}>{t("The scan could not be run just now.")}</Problem>}
      {data?.notes.map((note) => (
        <p key={note} className="type-label text-text-muted">
          {t(note)}
        </p>
      ))}

      {worth.length > 0 ? (
        <section aria-labelledby="arb-worth" className="rounded-card border border-border-subtle bg-surface-raised p-4">
          <h2 id="arb-worth" className="type-h2 text-text-primary">
            {t("Gaps that clear their costs")}
          </h2>
          <ul className="mt-2 flex flex-col gap-2">
            {worth.slice(0, 6).map((row) => (
              <li key={row.symbol} className="type-body-sm text-text-secondary">
                <span className="type-data-sm text-text-primary">{row.symbol}</span>
                {" — "}
                {row.netBasisBps !== null && row.netBasisBps > 0 ? basisLine(row, t) : fundingLine(row, t)}
              </li>
            ))}
          </ul>
        </section>
      ) : (
        !loading &&
        rows.length > 0 && <p className="type-body-sm text-text-secondary">{t("No gap clears its fees right now. The venues agree within their costs.")}</p>
      )}

      {rows.length > 0 && (
        <DataTable
          caption={t("Price and funding gaps between Hyperliquid and Binance")}
          columns={columns}
          rows={rows}
          getRowKey={(row) => row.symbol}
          minWidth={360}
          card={(row) => (
            <div className="flex flex-col gap-1 py-2">
              <div className="flex items-baseline justify-between gap-2">
                <span className="type-data-sm text-text-primary">{row.symbol}</span>
                <span className="type-label text-text-muted">{row.volume24hUsd === null ? "" : t("{volume} 24h volume", { volume: formatCompactUsd(row.volume24hUsd) })}</span>
              </div>
              <p className="type-label text-text-secondary">{basisLine(row, t)}</p>
              <p className="type-label text-text-secondary">{fundingLine(row, t)}</p>
            </div>
          )}
        />
      )}

      <p className="type-label text-text-muted">
        {t("Observations, not trades. Prices move between legs, funding resets every hour on Hyperliquid and every eight on Binance, shorting spot is not always possible, and your fees may differ. Elyra does not trade these.")}
      </p>
      {data !== null && <Timestamp at={data.asOf} />}
    </div>
  );
}
