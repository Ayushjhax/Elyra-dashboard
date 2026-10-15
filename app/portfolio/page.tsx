"use client";

import { PieChart } from "lucide-react";
import { PortfolioCards } from "@/components/portfolio/PortfolioDrawer";
import { RouteDrawer } from "@/components/shell/RouteDrawer";

/* ---------------------------------------------------------------------------
   Portfolio: your capital, in one place.

   Opens in the route column beside the chart, like every other route — the
   chart is mounted by the shell and is never replaced. Everything inside
   reads the one portfolio snapshot (components/portfolio/PortfolioDrawer).
--------------------------------------------------------------------------- */

export default function PortfolioPage() {
  return (
    <RouteDrawer
      label="Portfolio"
      icon={<PieChart size={28} strokeWidth={1.5} />}
      title="Portfolio"
      subtitle="Your capital, in one place"
    >
      <PortfolioCards />
    </RouteDrawer>
  );
}
