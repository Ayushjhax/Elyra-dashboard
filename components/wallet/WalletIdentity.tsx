"use client";

import { useState } from "react";
import { AlertTriangle, Check, Copy } from "lucide-react";
import { useElyraAuth } from "@/components/providers/PrivyClientProvider";
import { Eyebrow } from "@/components/ui/Eyebrow";
import { CLUSTER_LABEL, EXPECTED_CLUSTER } from "@/lib/solana/cluster";
import { truncateAddress } from "@/lib/solana/address";
import type { WalletDashboard } from "@/lib/wallet/useWalletDashboard";
import { cn } from "@/lib/utils";

/* ---------------------------------------------------------------------------
   Who this wallet is, and which ledger it is on.

   The network row is not a label read off config: it is the cluster the node
   reported via its genesis hash. When that is not mainnet the row becomes a
   warning, because a devnet balance shown as real money is the worst thing
   this panel could do — and unlike EVM there is no chain switch to offer, so
   the action is to fix the endpoint, which the copy says.
--------------------------------------------------------------------------- */

/** Privy's account types, in the words a person would use. */
const METHOD_LABEL: Record<string, string> = {
  wallet: "Wallet",
  email: "Email",
  phone: "Phone",
  google_oauth: "Google",
  twitter_oauth: "X",
  discord_oauth: "Discord",
  github_oauth: "GitHub",
  apple_oauth: "Apple",
  linkedin_oauth: "LinkedIn",
  tiktok_oauth: "TikTok",
  spotify_oauth: "Spotify",
  instagram_oauth: "Instagram",
  twitch_oauth: "Twitch",
  line_oauth: "LINE",
  farcaster: "Farcaster",
  telegram: "Telegram",
  passkey: "Passkey",
  smart_wallet: "Smart wallet",
  guest: "Guest",
};

export function methodLabel(type: string): string {
  /* Unknown types render as their raw name with the underscores taken out,
     which is still readable and does not require this table to be complete. */
  return METHOD_LABEL[type] ?? type.replace(/_/g, " ");
}

function CopyAddress({ address }: { address: string }) {
  const [copied, setCopied] = useState(false);

  return (
    <button
      type="button"
      onClick={() => {
        void navigator.clipboard.writeText(address).then(() => {
          setCopied(true);
          setTimeout(() => setCopied(false), 1500);
        });
      }}
      /* The full address is the accessible name: a screen reader user must
         not be offered "4Nd1…9wXy" as the thing they are about to copy. */
      aria-label={`Copy wallet address ${address}`}
      className={cn(
        "group inline-flex items-center gap-1.5 rounded-control px-1.5 py-1",
        "transition-colors duration-[var(--dur-fast)] ease-brand hover:bg-surface-hover",
      )}
    >
      <span className="type-mono-addr text-text-primary">
        {truncateAddress(address)}
      </span>
      {copied ? (
        <Check size={14} strokeWidth={1.5} aria-hidden className="text-positive" />
      ) : (
        <Copy
          size={14}
          strokeWidth={1.5}
          aria-hidden
          className="text-text-muted group-hover:text-text-primary"
        />
      )}
      {/* Announced on change rather than shown only as a colour swap. */}
      <span aria-live="polite" className="sr-only">
        {copied ? "Address copied" : ""}
      </span>
    </button>
  );
}

export function WalletIdentity({ wallet }: { wallet: WalletDashboard }) {
  const auth = useElyraAuth();
  const method = auth.account?.loginMethod ?? null;

  return (
    <section className="flex flex-col gap-2 border-b border-border-subtle px-3 py-3">
      <div className="flex items-center justify-between gap-2">
        <Eyebrow>Wallet</Eyebrow>
        {method !== null && (
          <span className="type-label text-text-muted">
            via {methodLabel(method.type)}
          </span>
        )}
      </div>

      {wallet.address === null ? (
        <p className="type-body-sm text-text-secondary">
          This account has no Solana wallet.
        </p>
      ) : (
        <CopyAddress address={wallet.address} />
      )}

      {wallet.wrongChain ? (
        <div
          role="alert"
          className="flex items-start gap-2 rounded-card border border-negative/40 bg-negative-bg px-2.5 py-2"
        >
          <AlertTriangle
            size={14}
            strokeWidth={1.5}
            aria-hidden
            className="mt-0.5 shrink-0 text-negative"
          />
          <div>
            <p className="type-label text-negative">
              Connected to {CLUSTER_LABEL[wallet.cluster ?? "unknown"]}
            </p>
            <p className="type-label mt-0.5 text-text-muted">
              Balances below are not {CLUSTER_LABEL[EXPECTED_CLUSTER]} balances.
              A Solana key is valid on every cluster, so the endpoint decides
              which ledger you are reading — point SOLANA_RPC_URL at mainnet.
            </p>
          </div>
        </div>
      ) : (
        <p className="type-label text-text-muted">{wallet.chain}</p>
      )}
    </section>
  );
}
