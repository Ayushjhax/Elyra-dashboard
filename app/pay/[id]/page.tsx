import type { Metadata } from "next";
import { PayPage } from "@/components/rails/PayPage";
import { pageMetadata } from "@/lib/i18n/server";

/* ---------------------------------------------------------------------------
   A payment request's public page: what is asked, to which wallet, a
   Solana Pay code any wallet scans, and whether the chain shows it paid.
   Standalone — no workspace shell (STANDALONE_ROUTES in lib/layout.ts) —
   because whoever opens it is paying, not trading.
--------------------------------------------------------------------------- */

export const dynamic = "force-dynamic";

export async function generateMetadata(): Promise<Metadata> {
  return { ...(await pageMetadata("Payment request", "A USDC payment request on Solana, settled on-chain.")), robots: { index: false, follow: false } };
}

export default async function PayRoute({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return <PayPage id={id} />;
}
