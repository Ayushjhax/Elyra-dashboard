import { AppShell } from "@/components/shell/AppShell";
import { PlaceholderPage } from "@/components/ui/PlaceholderPage";

export default function PersonalizedPage() {
  return (
    <AppShell>
      <PlaceholderPage
        title="Personalized"
        eyebrow="PERSONALIZED"
        description="Feeds and layouts tuned to what you trade. Nothing has been tuned yet."
      />
    </AppShell>
  );
}
