import { notFound } from "next/navigation";
import { Layers } from "lucide-react";
import { PortfolioView } from "@/components/invest/PortfolioView";
import { RouteDrawer } from "@/components/shell/RouteDrawer";
import { PORTFOLIOS, portfolioById } from "@/lib/invest/catalog";

/* ---------------------------------------------------------------------------
   One Intelligent Portfolio, beside the chart.

   The id is checked against the catalog here, on the server, so an unknown
   one is a 404 rather than an empty page.
--------------------------------------------------------------------------- */

export function generateStaticParams() {
  return PORTFOLIOS.map((portfolio) => ({ id: portfolio.id }));
}

interface Props {
  params: Promise<{ id: string }>;
}

export async function generateMetadata(props: Props) {
  const { id } = await props.params;
  const portfolio = portfolioById(id);
  return portfolio === null
    ? { title: "Intelligent Portfolios · Elyra" }
    : { title: `${portfolio.name} · Elyra`, description: portfolio.summary };
}

export default async function InvestPortfolioPage(props: Props) {
  const { id } = await props.params;
  const portfolio = portfolioById(id);
  if (portfolio === null) notFound();

  return (
    <RouteDrawer
      label={portfolio.name}
      icon={<Layers size={28} strokeWidth={1.5} />}
      title={portfolio.name}
      subtitle={portfolio.summary}
    >
      <PortfolioView id={portfolio.id} />
    </RouteDrawer>
  );
}
