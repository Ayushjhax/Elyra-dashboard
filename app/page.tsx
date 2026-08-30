import { AppShell } from "@/components/shell/AppShell";
import { MarketHeader } from "@/components/panels/MarketHeader";
import { ChartPanel } from "@/components/panels/ChartPanel";
import { LedgerPanel } from "@/components/panels/LedgerPanel";

export default function HomePage() {
  return (
    <AppShell>
      <MarketHeader />
      <ChartPanel />
      <LedgerPanel />
    </AppShell>
  );
}
