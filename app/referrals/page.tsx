import { AppShell } from "@/components/shell/AppShell";
import { PlaceholderPage } from "@/components/ui/PlaceholderPage";

export default function ReferralsPage() {
  return (
    <AppShell>
      <PlaceholderPage
        title="Referrals"
        eyebrow="REFERRALS"
        description="Referral links and earned fees. Nothing to show until a link is created."
      />
    </AppShell>
  );
}
