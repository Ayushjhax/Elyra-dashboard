"use client";

import { AlertTriangle, ExternalLink, RefreshCw } from "lucide-react";
import { useElyraAuth } from "@/components/providers/PrivyClientProvider";
import { Button } from "@/components/ui/Button";
import { txExplorerUrl, truncateAddress } from "@/lib/solana/address";
import { useMinute } from "@/lib/useClock";
import { useWalletActivity } from "@/lib/wallet/useWalletActivity";
import type { ActivityStatus, WalletActivity } from "@/lib/wallet/types";
import { cn } from "@/lib/utils";

/* ---------------------------------------------------------------------------
   Recent transactions, newest first.

   What is here is what `getSignaturesForAddress` actually returns: whether it
   landed, when, and a link. Decoding "sent 2 SOL to X" would need a
   getTransaction per signature plus an instruction parser per program, and a
   feed that guessed at amounts from partial data would be wrong on exactly
   the transactions worth reading — the unusual ones.

   Timestamps are relative to the shared minute clock, which is null until
   hydration so the server and the first client render agree.
--------------------------------------------------------------------------- */

const STATUS: Record<ActivityStatus, { label: string; className: string }> = {
  confirmed: {
    label: "Confirmed",
    className: "border-positive/40 bg-positive-bg text-positive",
  },
  pending: {
    label: "Pending",
    className: "border-border-strong bg-surface-raised text-text-secondary",
  },
  failed: {
    label: "Failed",
    className: "border-negative/40 bg-negative-bg text-negative",
  },
};

/** Live-clock relative time. Deliberately not `lib/format`'s, see above. */
function relativeTo(iso: string | null, now: number | null): string {
  /* Before hydration there is no client clock, and an age computed against
     the server's would be wrong by the page's whole time to interactive. */
  if (now === null) return "—";
  if (iso === null) return "just now";
  const seconds = Math.max(0, Math.round((now - Date.parse(iso)) / 1000));
  if (seconds < 60) return "just now";
  const minutes = Math.round(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  return `${Math.round(hours / 24)}d ago`;
}

function Row({ item, now }: { item: WalletActivity; now: number | null }) {
  const status = STATUS[item.status];

  return (
    <li>
      <a
        href={txExplorerUrl(item.signature)}
        target="_blank"
        rel="noopener noreferrer"
        className={cn(
          "flex items-center gap-2 rounded-card px-2 py-2",
          "transition-colors duration-[var(--dur-fast)] ease-brand hover:bg-surface-hover",
        )}
      >
        <span
          className={cn(
            "type-label shrink-0 rounded-chip border px-1.5 py-0.5",
            status.className,
          )}
        >
          {status.label}
        </span>

        <span className="type-mono-addr min-w-0 flex-1 truncate text-text-secondary">
          {truncateAddress(item.signature, 6, 6)}
        </span>

        {item.memo !== null && (
          <span className="type-label hidden min-w-0 max-w-[10rem] truncate text-text-muted mid:inline">
            {item.memo}
          </span>
        )}

        <span className="type-label shrink-0 tabular-nums text-text-muted">
          {relativeTo(item.at, now)}
        </span>

        <ExternalLink
          size={12}
          strokeWidth={1.5}
          aria-hidden
          className="shrink-0 text-text-muted"
        />
      </a>
    </li>
  );
}

export function WalletActivityPanel() {
  const auth = useElyraAuth();
  const feed = useWalletActivity(20);

  /* One instant for every row in a paint, from the shared minute clock —
     `Date.now()` in a render body is an impure read and the compiler rejects
     it. This also means the ages actually advance on their own rather than
     only when something else re-renders the list. */
  const now = useMinute();

  if (!auth.authenticated) {
    return (
      <p className="type-body-sm text-text-secondary">
        Sign in to see this wallet&rsquo;s transactions.
      </p>
    );
  }

  if (feed.unconfigured) {
    return (
      <p className="type-label text-text-muted">
        <code>SOLANA_RPC_URL</code> is not set, so transaction history cannot
        be read.
      </p>
    );
  }

  if (feed.error !== null) {
    return (
      <div
        role="alert"
        className="flex flex-col gap-2 rounded-card border border-negative/40 bg-negative-bg px-2.5 py-2"
      >
        <div className="flex items-start gap-2">
          <AlertTriangle
            size={14}
            strokeWidth={1.5}
            aria-hidden
            className="mt-0.5 shrink-0 text-negative"
          />
          <p className="type-label break-words text-text-muted">{feed.error}</p>
        </div>
        <Button size="sm" variant="quiet" onClick={feed.refetch} className="self-start">
          <RefreshCw size={13} strokeWidth={1.5} aria-hidden />
          Retry
        </Button>
      </div>
    );
  }

  if (feed.isLoading) {
    return (
      <div className="flex flex-col gap-1">
        {[0, 1, 2, 3].map((i) => (
          <span key={i} className="skeleton h-8 w-full rounded-card" aria-hidden />
        ))}
      </div>
    );
  }

  if (feed.items.length === 0) {
    return (
      <div>
        <p className="type-body-sm text-text-secondary">Nothing yet.</p>
        <p className="type-label mt-1 text-text-muted">
          Transactions signed by this wallet will appear here, newest first.
        </p>
      </div>
    );
  }

  return (
    <ul className="flex list-none flex-col">
      {feed.items.map((item) => (
        <Row key={item.signature} item={item} now={now} />
      ))}
    </ul>
  );
}
