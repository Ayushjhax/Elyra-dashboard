"use client";

import { useState } from "react";
import { useFundWallet } from "@privy-io/react-auth/solana";
import { ArrowDownToLine, ArrowLeftRight, ArrowUpRight, Send } from "lucide-react";
import { useElyraAuth } from "@/components/providers/PrivyClientProvider";
import { ActionButton } from "@/components/assets/primitives";
import { Button } from "@/components/ui/Button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogTitle,
} from "@/components/ui/dialog";
import { Eyebrow } from "@/components/ui/Eyebrow";
import { truncateMiddle } from "@/lib/format";
import { cn } from "@/lib/utils";

/* ---------------------------------------------------------------------------
   The four capital actions.

   ── What is real, and what is honestly not ─────────────────────────────

   DEPOSIT works. It hands off to Privy's own Solana funding flow — the same
   `useFundWallet` hook `components/wallet/WalletActions.tsx` already uses,
   reused rather than reimplemented, which is what §3 asks for and what keeps
   the on-ramp from being invented here.

   SWAP, TRANSFER and WITHDRAW do not, and this file does not pretend they
   do. §3 says "REUSE existing workflows if they already exist" — they do
   not. There is no Jupiter swap route, no transfer builder, and no signing
   path anywhere in this repository: `sendTransaction`, `signTransaction` and
   `signAndSendTransaction` appear zero times in the whole app, and
   lib/exchange is read-only by construction ("Nothing in lib/exchange/ may
   call an endpoint that places, modifies or cancels an order").

   So the choice was between building three money-moving flows from scratch —
   quoting, transaction construction, signing, submission, confirmation —
   against live funds inside a redesign task, or stating plainly that they
   are not wired up. The second is correct, and it is what §"NO FAKE DATA"
   demands: a Swap dialog showing a fabricated quote and a Confirm button
   that cannot confirm is worse than no dialog, because it looks like a bug
   in something real rather than a feature that does not exist.

   Each unavailable action therefore opens the same modal SHELL §31
   describes — title, the route the capital would take, what is missing —
   with no fabricated quote, no fee, and no Confirm. When the flows land,
   the shell is where they go.
--------------------------------------------------------------------------- */

export type AssetAction = "deposit" | "swap" | "transfer" | "withdraw";

interface Unavailable {
  title: string;
  /** What this action would do, so the dialog is not just a refusal. */
  purpose: string;
  /** Precisely what is missing. Named, not hand-waved. */
  missing: string;
}

const UNAVAILABLE: Record<Exclude<AssetAction, "deposit">, Unavailable> = {
  swap: {
    title: "Swap",
    purpose:
      "Exchange one token for another inside your wallet, routed for the best available price.",
    missing:
      "Elyra reads Jupiter for token metadata and prices, but no swap route, quote step or transaction signing path is wired up yet. Quoting, preview and confirmation all land together when it is.",
  },
  transfer: {
    title: "Transfer",
    purpose: "Move tokens from this wallet to another address or to a connected venue.",
    missing:
      "No transfer builder or signing path exists in Elyra yet. Sending funds needs transaction construction and a confirmation step, and neither is implemented.",
  },
  withdraw: {
    title: "Withdraw",
    purpose: "Move capital off a connected venue and back into your wallet.",
    missing:
      "Venue connections are read-only by design — nothing in Elyra places, modifies or cancels anything at an exchange. Withdrawals need a write path that does not exist yet.",
  },
};

/**
 * Split out because it calls a Privy hook.
 *
 * `PrivyClientProvider` does not mount `PrivyProvider` when the app id is
 * malformed, and Privy's hooks throw with no provider above them. Hooks
 * cannot be called conditionally, so the guard has to be which component
 * renders — the same split `WalletActions` makes, for the same reason.
 */
function DepositAction({ address }: { address: string }) {
  const { fundWallet } = useFundWallet();
  const [busy, setBusy] = useState(false);

  return (
    <ActionButton
      icon={ArrowDownToLine}
      label="Deposit"
      tone="primary"
      disabled={busy}
      onClick={() => {
        setBusy(true);
        /* Resolves when the flow completes and rejects when the user closes
           Privy's modal, which is an ordinary outcome rather than a failure —
           so both land in the same place and neither is reported as an error. */
        void fundWallet({ address })
          .catch(() => {})
          .finally(() => setBusy(false));
      }}
    />
  );
}

function Row({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="flex items-baseline justify-between gap-3 py-1.5">
      <span className="type-label text-text-muted">{label}</span>
      <span className="type-data-sm min-w-0 truncate text-text-primary">{value}</span>
    </div>
  );
}

function UnavailableDialog({
  action,
  address,
  onClose,
}: {
  action: Exclude<AssetAction, "deposit">;
  address: string | null;
  onClose: () => void;
}) {
  const content = UNAVAILABLE[action];

  return (
    <Dialog open onOpenChange={(next) => !next && onClose()}>
      <DialogContent side="center" surface="glass" className="flex flex-col gap-0 p-0">
        <header className="flex h-11 shrink-0 items-center gap-2 border-b border-border-subtle px-4">
          <DialogTitle asChild>
            <Eyebrow>{content.title}</Eyebrow>
          </DialogTitle>
          <DialogDescription className="sr-only">
            {content.title} is not available yet. {content.missing}
          </DialogDescription>
        </header>

        <div className="flex min-h-0 flex-1 flex-col gap-3 overflow-y-auto p-4">
          <p className="type-body-sm text-text-secondary">{content.purpose}</p>

          <div className="flex flex-col divide-y divide-border-subtle rounded-card border border-border-subtle bg-surface-raised px-3 py-1">
            <Row
              label="From"
              value={
                address === null ? (
                  <span className="text-text-muted">No wallet</span>
                ) : (
                  <span className="type-mono-addr">{truncateMiddle(address, 4, 4)}</span>
                )
              }
            />
            <Row label="Asset" value={<span className="text-text-muted">—</span>} />
            <Row label="Amount" value={<span className="text-text-muted">—</span>} />
            <Row label="Network fee" value={<span className="text-text-muted">—</span>} />
          </div>

          {/* The honest part. Clay, because this is a capability gap the
              operator needs to register, not a neutral notice. */}
          <div className="rounded-card border border-negative/40 bg-negative-bg px-3 py-2.5">
            <p className="type-label text-negative">Not available yet</p>
            <p className="type-label mt-1 text-text-secondary">{content.missing}</p>
          </div>
        </div>

        <footer className="flex shrink-0 items-center justify-end gap-2 border-t border-border-subtle px-4 py-3">
          <Button size="sm" variant="quiet" onClick={onClose}>
            Close
          </Button>
          {/* Present and permanently disabled rather than absent: the shape
              of the flow is real, only its execution is missing, and §31's
              "confirmation only activates once inputs are valid" is exactly
              what a disabled Confirm expresses here. */}
          <Button size="sm" variant="accent" disabled title="This flow is not connected yet">
            Confirm
          </Button>
        </footer>
      </DialogContent>
    </Dialog>
  );
}

/**
 * The action bar, and whatever dialog it has open.
 *
 * Deposit is a direct hand-off with no dialog of Elyra's own — Privy renders
 * its own funding UI, and wrapping it in a second modal would be two modals
 * to close.
 */
export function AssetActionBar({ address }: { address: string | null }) {
  const auth = useElyraAuth();
  const [open, setOpen] = useState<Exclude<AssetAction, "deposit"> | null>(null);

  const canFund = auth.available && address !== null;

  return (
    <>
      <div className="flex flex-wrap items-center gap-1.5">
        {canFund ? (
          <DepositAction address={address} />
        ) : (
          <ActionButton
            icon={ArrowDownToLine}
            label="Deposit"
            tone="primary"
            disabled
            title={
              address === null
                ? "Connect a wallet to deposit"
                : "Wallet funding is unavailable"
            }
            onClick={() => {}}
          />
        )}

        <ActionButton
          icon={ArrowLeftRight}
          label="Swap"
          tone="secondary"
          onClick={() => setOpen("swap")}
        />
        <ActionButton
          icon={Send}
          label="Transfer"
          tone="secondary"
          onClick={() => setOpen("transfer")}
        />
        <ActionButton
          icon={ArrowUpRight}
          label="Withdraw"
          tone="subtle"
          onClick={() => setOpen("withdraw")}
        />
      </div>

      {open !== null && (
        <UnavailableDialog action={open} address={address} onClose={() => setOpen(null)} />
      )}
    </>
  );
}

/** Shared by the empty state, which offers funding without the whole bar. */
export function DepositOnlyButton({ address }: { address: string | null }) {
  const auth = useElyraAuth();
  if (!auth.available || address === null) return null;
  return (
    <div className={cn("flex")}>
      <DepositAction address={address} />
    </div>
  );
}
