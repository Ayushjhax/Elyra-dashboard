import { AppShell } from "@/components/shell/AppShell";
import { PlaceholderPage } from "@/components/ui/PlaceholderPage";

export default function AgentPage() {
  return (
    <AppShell>
      <PlaceholderPage
        title="Agent"
        eyebrow="AGENT"
        description="The agent's own console — run history, tool access and limits. Its output already appears on Home."
      />
    </AppShell>
  );
}
