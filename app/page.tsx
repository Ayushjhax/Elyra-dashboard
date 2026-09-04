import { AppShell } from "@/components/shell/AppShell";
import { MainSplit } from "@/components/shell/MainSplit";
import { MarketHeader } from "@/components/panels/MarketHeader";
import { ChartPanel } from "@/components/panels/ChartPanel";
import { LedgerPanel } from "@/components/panels/LedgerPanel";

export default function HomePage() {
  return (
    <AppShell>
      <MarketHeader />
      <ChartPanel />
      {/* Takes no height of its own — it sits in the gap the two already had. */}
      <MainSplit />
      <LedgerPanel />
    </AppShell>
  );
}
