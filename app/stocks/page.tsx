import type { Metadata } from "next";
import { CandlestickChart } from "lucide-react";
import { StocksView } from "@/components/equities/StocksView";
import { RouteDrawer } from "@/components/shell/RouteDrawer";
import { pageMetadata } from "@/lib/i18n/server";
import { msg } from "@/lib/i18n/translate";

/* ---------------------------------------------------------------------------
   Tokenized stocks, beside the chart like every other route — the chart
   stays mounted and in focus. Every issuer's tokens grouped by share, with
   their primary and secondary markets; the page lives in components/equities.
--------------------------------------------------------------------------- */

export async function generateMetadata(): Promise<Metadata> {
  return pageMetadata("Tokenized stocks", "Every tokenized stock and ETF on-chain, grouped by share, with where each is minted and where it trades.");
}

export default function StocksPage() {
  return (
    <RouteDrawer
      label={msg("Tokenized stocks")}
      icon={<CandlestickChart size={28} strokeWidth={1.5} />}
      title={msg("Tokenized stocks")}
      subtitle={msg("Every issuer, primary and secondary markets")}
    >
      <StocksView />
    </RouteDrawer>
  );
}
