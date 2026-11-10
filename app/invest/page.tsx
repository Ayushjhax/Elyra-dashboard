import { Layers } from "lucide-react";
import { InvestList } from "@/components/invest/InvestList";
import { RouteDrawer } from "@/components/shell/RouteDrawer";

/* ---------------------------------------------------------------------------
   Intelligent Portfolios.

   Opens in the route column beside the chart, like Portfolio — a list of
   seven cards fits the column, so this is not a full-bleed route and the
   chart stays the focus. The page lives in components/invest.
--------------------------------------------------------------------------- */

export const metadata = {
  title: "Intelligent Portfolios · Elyra",
  description: "Model portfolios you buy into your own wallet, with their holdings and drift in plain view.",
};

export default function InvestPage() {
  return (
    <RouteDrawer
      label="Intelligent Portfolios"
      icon={<Layers size={28} strokeWidth={1.5} />}
      title="Intelligent Portfolios"
      subtitle="Model portfolios, held in your own wallet"
    >
      <InvestList />
    </RouteDrawer>
  );
}
