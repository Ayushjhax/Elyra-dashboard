"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useExportWallet, useFundWallet } from "@privy-io/react-auth/solana";
import { ChevronRight, ExternalLink, KeyRound, Plus, Power } from "lucide-react";
import { useElyraAuth } from "@/components/providers/PrivyClientProvider";
import { walletClientName } from "@/lib/account";
import { accountExplorerUrl } from "@/lib/solana/address";
import type { Cluster } from "@/lib/solana/cluster";
import type { WalletDashboard } from "@/lib/wallet/useWalletDashboard";
import { cn } from "@/lib/utils";

/* ---------------------------------------------------------------------------
   What you can do with this wallet.

   Read-only, still: nothing here signs a transaction. Export hands the person
   to Privy's own iframe, which is the only thing that ever sees a key — this
   app cannot read it, and keeps nothing of it.

   Funding needs `useSolanaFundingPlugin()` registered inside the provider —
   see the note in `PrivyClientProvider`. `useFundWallet` is marked deprecated
   in favour of `useAddFunds`, which is still `@experimental`; the plugin
   registered there is the Solana one this hook pairs with.

   The Privy hooks throw when no PrivyProvider is mounted, and hooks cannot be
   called conditionally, so each lives in a component that is only rendered
   when Privy is there.
--------------------------------------------------------------------------- */

/** Privy's chain id for the cluster the node reported; Privy's default when unknown. */
const PRIVY_CHAIN = {
  "mainnet-beta": "solana:mainnet",
  devnet: "solana:devnet",
  testnet: "solana:testnet",
} as const;

export const ROW = cn(
  "-mx-2 flex min-h-11 w-[calc(100%+16px)] items-center gap-3 rounded-control px-2 py-2 text-left",
  "type-body text-text-primary transition-colors duration-[var(--dur-fast)] ease-brand",
  "hover:bg-surface-hover focus-visible:bg-surface-hover disabled:pointer-events-none",
);

/** The drawer's one primary action, on the wallet and network shown above it. */
export function FundWallet({ address, cluster }: { address: string; cluster: Cluster | null }) {
  const { fundWallet } = useFundWallet();
  const [busy, setBusy] = useState(false);
  const chain = cluster === null || cluster === "unknown" ? undefined : PRIVY_CHAIN[cluster];

  return (
    <div className="px-5 pb-4">
      <button
        type="button"
        disabled={busy}
        onClick={() => {
          if (busy) return;
          setBusy(true);
          /* Rejects when the person closes the flow, which is an ordinary
             outcome rather than a failure, so it is not reported as one. */
          void fundWallet({ address, options: chain === undefined ? undefined : { chain } })
            .catch(() => {})
            .finally(() => setBusy(false));
        }}
        className={cn(
          "type-body inline-flex h-11 w-full items-center justify-center gap-2 rounded-control bg-accent font-medium text-text-on-accent",
          "transition-colors duration-[var(--dur-fast)] ease-brand hover:bg-accent-hover disabled:opacity-70",
        )}
      >
        <Plus size={18} strokeWidth={1.75} aria-hidden />
        {busy ? "Opening…" : "Fund wallet"}
      </button>
    </div>
  );
}

/** An embedded wallet's key, through Privy's export flow and nothing else. */
function ExportRow({ address }: { address: string }) {
  const { exportWallet } = useExportWallet();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  return (
    <>
      <button
        type="button"
        disabled={busy}
        onClick={() => {
          if (busy) return;
          setBusy(true);
          setError(null);
          /* Resolves when the person closes Privy's window, whatever they did
             in it, so there is no success to report — only a row to re-enable. */
          exportWallet({ address })
            .catch(() => setError("Privy couldn't open the export window. Try again."))
            .finally(() => setBusy(false));
        }}
        className={ROW}
      >
        <KeyRound size={18} strokeWidth={1.5} aria-hidden className="shrink-0 text-text-secondary" />
        <span className="flex-1">{busy ? "Opening export…" : "Export wallet"}</span>
        <ChevronRight size={16} strokeWidth={1.5} aria-hidden className="text-text-muted" />
      </button>
      {error !== null && (
        <p role="alert" className="type-label pb-1 pl-8 text-negative">
          {error}
        </p>
      )}
    </>
  );
}

export function WalletActions({ wallet, onSignedOut }: { wallet: WalletDashboard; onSignedOut: () => void }) {
  const auth = useElyraAuth();
  const router = useRouter();
  const address = wallet.address;
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  /* Only an embedded wallet has a key Privy can show. An external one is
     held by its own app, which is where it is exported from. */
  const embedded = auth.account?.solanaIsEmbedded === true;
  const holder = walletClientName(
    auth.account?.accounts.find((entry) => entry.type === "wallet" && entry.detail === address)?.walletClientType ?? null,
  );

  /* The app's one disconnect: it ends the Elyra session, as the header's
     wallet menu does. Nothing is deleted, and the wallet itself is untouched. */
  const disconnect = async () => {
    if (busy) return;
    setBusy(true);
    setError(null);
    try {
      await auth.logout();
      onSignedOut();
      router.push("/");
    } catch (failure: unknown) {
      setError(failure instanceof Error ? failure.message : "Disconnecting failed. Try again.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <>
      {address !== null && (
        <section aria-label="Wallet actions" className="mx-5 border-t border-border-subtle py-2">
          {auth.available && embedded ? (
            <ExportRow address={address} />
          ) : (
            <div className={cn(ROW, "cursor-default hover:bg-transparent")}>
              <KeyRound size={18} strokeWidth={1.5} aria-hidden className="shrink-0 text-text-muted" />
              <span className="flex-1 text-text-secondary">
                Export wallet
                <span className="type-label block text-text-muted">
                  {holder === null
                    ? "This wallet's key isn't held by Elyra, so it is exported from the app that holds it."
                    : `This key is held by ${holder} — export it from there.`}
                </span>
              </span>
            </div>
          )}
          <a href={accountExplorerUrl(address, wallet.cluster)} target="_blank" rel="noopener noreferrer" className={ROW}>
            <ExternalLink size={18} strokeWidth={1.5} aria-hidden className="shrink-0 text-text-secondary" />
            <span className="flex-1">
              View on explorer
              <span className="sr-only"> (Solscan, opens in a new tab)</span>
            </span>
            <ChevronRight size={16} strokeWidth={1.5} aria-hidden className="text-text-muted" />
          </a>
        </section>
      )}

      <section aria-label="Disconnect" className="mx-5 border-t border-border-subtle py-2">
        <button
          type="button"
          onClick={() => void disconnect()}
          aria-disabled={busy || undefined}
          aria-describedby="wallet-disconnect-note"
          className={cn(ROW, "text-negative aria-disabled:opacity-70")}
        >
          <Power size={18} strokeWidth={1.5} aria-hidden className="shrink-0" />
          <span className="flex-1">
            {busy ? "Disconnecting…" : "Disconnect"}
            <span id="wallet-disconnect-note" className="type-label block text-text-muted">
              Signs you out of Elyra. Nothing is deleted.
            </span>
          </span>
          <ChevronRight size={16} strokeWidth={1.5} aria-hidden className="text-negative/70" />
        </button>
        {error !== null && (
          <p role="alert" className="type-label pb-1 pl-8 text-negative">
            {error}
          </p>
        )}
      </section>
    </>
  );
}
