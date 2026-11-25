"use client";

import { DashboardCards } from "@/components/dashboard/DashboardDrawer";
import { RouteDrawer } from "@/components/shell/RouteDrawer";
import { ElyraMark } from "@/components/ui/ElyraMark";
import { useT } from "@/lib/i18n/client";

/* ---------------------------------------------------------------------------
   The Dashboard: the account at a glance.

   Opens in the route column beside the chart, like every other route — the
   chart is mounted by the shell and is never replaced. The cards read the
   shared wallet, activity and auth stores (components/dashboard), so the
   drawer costs no request the status bar is not already making.
--------------------------------------------------------------------------- */

export default function DashboardPage() {
  const t = useT();
  return (
    <RouteDrawer
      label={t("Dashboard")}
      icon={<ElyraMark size={30} />}
      title={t("Dashboard")}
      subtitle={t("Your account at a glance")}
    >
      <DashboardCards />
    </RouteDrawer>
  );
}
