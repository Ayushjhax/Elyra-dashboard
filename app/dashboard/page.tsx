"use client";

import { DashboardCards } from "@/components/dashboard/DashboardDrawer";
import { RouteDrawer } from "@/components/shell/RouteDrawer";
import { ElyraMark } from "@/components/ui/ElyraMark";

/* ---------------------------------------------------------------------------
   The Dashboard: the account at a glance.

   Opens in the route column beside the chart, like every other route — the
   chart is mounted by the shell and is never replaced. The cards read the
   shared wallet, activity and auth stores (components/dashboard), so the
   drawer costs no request the status bar is not already making.
--------------------------------------------------------------------------- */

export default function DashboardPage() {
  return (
    <RouteDrawer
      label="Dashboard"
      icon={<ElyraMark size={30} />}
      title="Dashboard"
      subtitle="Your account at a glance"
    >
      <DashboardCards />
    </RouteDrawer>
  );
}
