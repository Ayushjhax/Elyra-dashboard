"use client";

import { useState } from "react";
import { useFundWallet } from "@privy-io/react-auth/solana";
import { ArrowDownToLine, ArrowLeftRight, ArrowUpRight, Send } from "lucide-react";
import { useElyraAuth } from "@/components/providers/PrivyClientProvider";
import { ActionButton } from "@/components/assets/primitives";
import { SwapDialog } from "@/components/assets/SwapDialog";
import { TransferDialog } from "@/components/assets/TransferDialog";
import { cn } from "@/lib/utils";

/* ---------------------------------------------------------------------------
   The four capital actions.

   ── What is real, and what is honestly not ─────────────────────────────

   DEPOSIT works. It hands off to Privy's own Solana funding flow — the same
   `useFundWallet` hook `components/wallet/WalletActions.tsx` already uses,
   reused rather than reimplemented, which is what §3 asks for and what keeps
   the on-ramp from being invented here.

   SWAP and TRANSFER work now. Both quote or build on the server, sign in
   this browser through Privy, and submit the signed bytes back — see those
   two files for the reasoning specific to each: a swap re-quotes before it
   signs, a transfer shows the recipient in full before it sends.

   WITHDRAW works now, and it is the same flow as Transfer under the name
   people actually look for.

   It used to open an honest but useless dialog saying venue withdrawals do
   not exist — which is still true, and was still the wrong answer. On a
   screen showing a Privy embedded wallet, "Withdraw" does not read as "move
   capital off Kraken". It reads as "get my money out of here", and that is a
   real, reachable thing: paste an address you control, send the balance to
   it. Answering that question with a paragraph about read-only exchange
   connections left the operator with funds in a wallet they cannot open in
   Phantom and no visible way to reach them.

   So Withdraw opens `TransferDialog` with `intent="withdraw"`. One code
   path, not two: the careful handling of the recipient address — validated
   as you type, shown in full before it sends — is the part that must not
   exist in one dialog and not the other.

   Venue withdrawals remain out of scope and unbuilt. Nothing in Elyra
   places, modifies or cancels anything at an exchange; that is a design
   decision, and when there is a venue balance to move it will need a write
   path that does not exist. It is simply not what this button is for.
--------------------------------------------------------------------------- */

export type AssetAction = "deposit" | "swap" | "transfer" | "withdraw";

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

  /* Swap, Transfer and Withdraw all sign in this browser, so all three call
     Privy hooks — which THROW when `PrivyClientProvider` did not mount a
     provider, as it does not when the app id is malformed. Opening one of
     those dialogs in that state replaces the page with an error boundary
     rather than telling anyone what is wrong, so the buttons carry the same
     guard Deposit already had: disabled, with a title that says why. */
  const canSign = auth.available && address !== null;
  const signHint =
    address === null ? "Connect a Solana wallet first" : "Wallet signing is unavailable";

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
          disabled={!canSign}
          title={canSign ? undefined : signHint}
          onClick={() => setOpen("swap")}
        />
        <ActionButton
          icon={Send}
          label="Transfer"
          tone="secondary"
          disabled={!canSign}
          title={canSign ? undefined : signHint}
          onClick={() => setOpen("transfer")}
        />
        <ActionButton
          icon={ArrowUpRight}
          label="Withdraw"
          tone="subtle"
          disabled={!canSign}
          title={canSign ? undefined : signHint}
          onClick={() => setOpen("withdraw")}
        />
      </div>

      {canSign && open === "swap" && (
        <SwapDialog address={address} onClose={() => setOpen(null)} />
      )}

      {/* One component, two names. `intent` changes the wording; the address
          handling, the confirm step and the build/sign/submit path are the
          same, because a second implementation of "send money somewhere" is a
          second place for the careful parts to be missing. */}
      {canSign && (open === "transfer" || open === "withdraw") && (
        <TransferDialog
          address={address}
          intent={open}
          onClose={() => setOpen(null)}
        />
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
