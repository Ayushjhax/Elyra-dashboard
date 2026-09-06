"use client";

import { useElyraAuth } from "@/components/providers/PrivyClientProvider";
import { methodLabel } from "@/components/wallet/WalletIdentity";
import { Eyebrow } from "@/components/ui/Eyebrow";
import { truncateMiddle } from "@/lib/format";
import { cn } from "@/lib/utils";

/* ---------------------------------------------------------------------------
   The account card: who you are, according to Privy.

   Everything comes from the auth façade rather than from `usePrivy`, so this
   file knows nothing about Privy's shapes — see the note at the top of
   `PrivyClientProvider`.

   Dates are absolute, not relative. "Joined 4 months ago" is a worse answer
   than a date for something that never changes, and `formatRelativeTime` in
   this codebase is pinned to the mock clock in any case.
--------------------------------------------------------------------------- */

function formatJoined(iso: string): string {
  return new Date(iso).toLocaleDateString("en-GB", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  });
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex items-baseline justify-between gap-3 py-1.5">
      <span className="type-label shrink-0 text-text-muted">{label}</span>
      <span className="min-w-0 text-right">{children}</span>
    </div>
  );
}

export function AccountPanel() {
  const auth = useElyraAuth();

  if (!auth.available) {
    return (
      <p className="type-body-sm text-text-secondary">
        Authentication is not configured, so there is no account to show.
      </p>
    );
  }

  if (!auth.ready) {
    return (
      <div className="flex flex-col gap-2">
        {[0, 1, 2].map((i) => (
          <span key={i} className="skeleton h-5 w-full" aria-hidden />
        ))}
      </div>
    );
  }

  const account = auth.account;
  if (!auth.authenticated || account === null) {
    return (
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="type-body-sm text-text-secondary">
          Sign in to see your account.
        </p>
      </div>
    );
  }

  /* The wallets first, then everything else: on a Solana account the wallet
     is the thing you came here to check. */
  const ordered = [...account.accounts].sort((a, b) => {
    if (a.type === b.type) return 0;
    if (a.type === "wallet") return -1;
    if (b.type === "wallet") return 1;
    return 0;
  });

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-col divide-y divide-border-subtle">
        <Field label="User id">
          {/* The DID is long and is mostly the same prefix on every account,
              so the middle is what gets dropped — the tail is the part that
              identifies it, and the title carries the whole thing. */}
          <span className="type-mono-addr text-text-secondary" title={account.id}>
            {truncateMiddle(account.id, 14, 6)}
          </span>
        </Field>

        {account.createdAt !== null && (
          <Field label="Created">
            <span className="type-data-sm text-text-secondary">
              {formatJoined(account.createdAt)}
            </span>
          </Field>
        )}

        {account.loginMethod !== null && (
          <Field label="Signed in with">
            <span className="type-data-sm text-text-secondary">
              {methodLabel(account.loginMethod.type)}
            </span>
          </Field>
        )}
      </div>

      <div>
        <Eyebrow className="mb-1.5">Linked accounts</Eyebrow>
        <ul className="flex list-none flex-col gap-1">
          {ordered.map((entry, index) => (
            <li
              key={`${entry.type}-${entry.detail ?? index}`}
              className={cn(
                "flex items-center gap-2 rounded-card border border-border-subtle",
                "bg-surface-raised px-2.5 py-1.5",
              )}
            >
              <span className="type-label shrink-0 text-text-secondary">
                {methodLabel(entry.type)}
                {entry.chainType !== null && (
                  <span className="ml-1 text-text-muted">({entry.chainType})</span>
                )}
              </span>
              <span
                className="type-mono-addr ml-auto min-w-0 truncate text-text-muted"
                title={entry.detail ?? undefined}
              >
                {entry.detail === null
                  ? "—"
                  : entry.detail.length > 24
                    ? truncateMiddle(entry.detail, 6, 6)
                    : entry.detail}
              </span>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}
