"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useExportWallet, useFundWallet } from "@privy-io/react-auth/solana";
import { ExternalLink, KeyRound, LogOut, Plus } from "lucide-react";
import { useElyraAuth } from "@/components/providers/PrivyClientProvider";
import { Button, buttonVariants } from "@/components/ui/Button";
import { accountExplorerUrl } from "@/lib/solana/address";
import type { WalletDashboard } from "@/lib/wallet/useWalletDashboard";
import { cn } from "@/lib/utils";

/* ---------------------------------------------------------------------------
   What you can do with this wallet.

   Read-only, still: nothing here signs a transaction. Export hands the user
   to Privy's own iframe, which is the only thing that ever sees a key —
   this app cannot read it and does not want to.

   ── On the funding hook ─────────────────────────────────────────────────

   Funding needs `useSolanaFundingPlugin()` registered inside the provider —
   see the note in `PrivyClientProvider`. Without it this modal opens with no
   Solana screens in it.

   `useFundWallet` is marked deprecated in 3.39 in favour of `useAddFunds`,
   which surfaces Stripe's onramp as well. It is still the right choice here:
   `useAddFunds` is marked `@experimental` and documented as liable to change
   at any time, and it is the *unified* flow, whereas the plugin registered in
   the provider is specifically the Solana funding plugin this hook pairs
   with. Revisit when `useAddFunds` stabilises.
--------------------------------------------------------------------------- */

/**
 * Split out because it calls a Privy hook.
 *
 * `PrivyClientProvider` does not mount `PrivyProvider` when the app id is
 * malformed, and Privy's hooks throw when no provider is above them. Hooks
 * cannot be called conditionally, so the guard has to be which component
 * renders — not which branch runs inside one.
 */
function ExportAction({ address }: { address: string }) {
  const { exportWallet } = useExportWallet();
  const [busy, setBusy] = useState(false);

  return (
    <Button
      size="sm"
      variant="quiet"
      disabled={busy}
      onClick={() => {
        setBusy(true);
        /* Resolves when the user closes Privy's modal, whatever they did in
           it, so there is no success to report — only a control to re-enable. */
        void exportWallet({ address }).finally(() => setBusy(false));
      }}
      className="justify-start"
    >
      <KeyRound size={14} strokeWidth={1.5} aria-hidden />
      Export wallet
    </Button>
  );
}

/**
 * Split out for the same reason as `ExportAction`: it calls a Privy hook, and
 * Privy's hooks throw when no provider is mounted above them.
 */
function FundAction({ address }: { address: string }) {
  const { fundWallet } = useFundWallet();
  const [busy, setBusy] = useState(false);

  return (
    <Button
      size="sm"
      variant="quiet"
      disabled={busy}
      onClick={() => {
        setBusy(true);
        /* Resolves when the flow completes and rejects when the user closes
           the modal, which is a normal outcome rather than a failure — so
           both land in the same place and neither is reported as an error. */
        void fundWallet({ address }).catch(() => {}).finally(() => setBusy(false));
      }}
      className="justify-start"
    >
      <Plus size={14} strokeWidth={1.5} aria-hidden />
      Fund wallet
    </Button>
  );
}

export function WalletActions({ wallet }: { wallet: WalletDashboard }) {
  const auth = useElyraAuth();
  const router = useRouter();
  const address = wallet.address;

  return (
    <section className="flex flex-col gap-1.5 border-t border-border-subtle px-3 py-3">
      {auth.available && address !== null && <FundAction address={address} />}

      {/* Only an embedded wallet has a key Privy can show. An external wallet
          is held by Phantom or Solflare and is theirs to export. */}
      {auth.available && auth.account?.solanaIsEmbedded === true && address !== null && (
        <ExportAction address={address} />
      )}

      {/* An anchor wearing the button's styles. `Button` renders a real
          <button> and has no `asChild`, and a button that navigates is the
          wrong element — `buttonVariants` is the seam it exports for this. */}
      {address !== null && (
        <a
          href={accountExplorerUrl(address)}
          target="_blank"
          rel="noopener noreferrer"
          className={cn(buttonVariants({ size: "sm", variant: "quiet" }), "justify-start")}
        >
          <ExternalLink size={14} strokeWidth={1.5} aria-hidden />
          View on explorer
        </a>
      )}

      <Button
        size="sm"
        variant="danger"
        className="justify-start"
        onClick={() => {
          void auth.logout().then(() => router.push("/"));
        }}
      >
        <LogOut size={14} strokeWidth={1.5} aria-hidden />
        Disconnect
      </Button>
    </section>
  );
}
