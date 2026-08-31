import { ConnectionsPanel } from "@/components/panels/ConnectionsPanel";
import { AppShell } from "@/components/shell/AppShell";

export default function AgentPage() {
  return (
    <AppShell>
      <ConnectionsPanel />
    </AppShell>
  );
}
