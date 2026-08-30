import { AppShell } from "@/components/shell/AppShell";
import { PlaceholderPage } from "@/components/ui/PlaceholderPage";

export default function PortfolioPage() {
  return (
    <AppShell>
      <PlaceholderPage
        title="Portfolio"
        eyebrow="PORTFOLIO"
        description="Allocation, realised PnL and exposure by market. Open positions are on Home under Positions."
      />
    </AppShell>
  );
}
