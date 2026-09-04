import { ChartPanel } from "@/components/panels/ChartPanel";
import { LedgerPanel } from "@/components/panels/LedgerPanel";
import { MarketHeader } from "@/components/panels/MarketHeader";
import { MainSplit } from "@/components/shell/MainSplit";

/**
 * The middle column: market header, chart, ledger.
 *
 * It belongs to the shell rather than to a route. It used to be Home's page
 * content, which meant navigating anywhere else unmounted the chart — the
 * TradingView widget was torn down and rebuilt on every trip to Portfolio and
 * back, and the operator lost the market they were watching from view.
 *
 * Now every route renders beside it (see `AppShell`), so this mounts once for
 * the life of the session and the chart is never what a navigation costs.
 */
export function MarketColumn() {
  return (
    <>
      <MarketHeader />
      <ChartPanel />
      {/* Takes no height of its own — it sits in the gap the two already had. */}
      <MainSplit />
      <LedgerPanel />
    </>
  );
}
