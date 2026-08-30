import { AppShell } from "@/components/shell/AppShell";
import { PlaceholderPage } from "@/components/ui/PlaceholderPage";

export default function AssetsPage() {
  return (
    <AppShell>
      <PlaceholderPage
        title="Assets"
        eyebrow="ASSETS"
        description="Balances, transfers and token detail land here. The terminal on Home is the working surface for now."
      />
    </AppShell>
  );
}
