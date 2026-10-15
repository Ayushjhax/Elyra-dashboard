"use client";

import { useState } from "react";
import { useFundWallet } from "@privy-io/react-auth/solana";
import { ArrowDownToLine, ArrowLeftRight, ArrowUpRight, Send, type LucideIcon } from "lucide-react";
import { useElyraAuth } from "@/components/providers/PrivyClientProvider";
import { Tip } from "@/components/shell/RouteDrawer";
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

const BASE = cn(
  "type-body-sm inline-flex h-10 min-w-0 items-center justify-center gap-2 whitespace-nowrap rounded-control px-3 font-medium",
  "transition-colors duration-[var(--dur-fast)] ease-brand",
);

const TONE = {
  primary: "bg-accent text-text-on-accent hover:bg-accent-hover active:bg-accent-quiet active:text-text-primary",
  secondary: "border border-border-strong text-text-primary hover:border-accent-quiet hover:bg-surface-hover active:bg-surface-panel",
};

/**
 * One capital action. Unavailable ones stay focusable and say why — a
 * disabled button can be neither reached nor hovered, so its reason would
 * be invisible to exactly the people who need it.
 */
function CapitalAction({
  icon: Icon,
  label,
  tone,
  reason,
  busy,
  onClick,
}: {
  icon: LucideIcon;
  label: string;
  tone: keyof typeof TONE;
  /** Why it cannot be used right now. Null when it can. */
  reason: string | null;
  busy?: boolean;
  onClick: () => void;
}) {
  const unavailable = reason !== null;
  const button = (
    <button
      type="button"
      aria-disabled={unavailable || busy ? true : undefined}
      aria-label={unavailable ? `${label} — ${reason}` : undefined}
      onClick={() => {
        if (!unavailable && !busy) onClick();
      }}
      className={cn(
        BASE,
        unavailable
          ? "cursor-not-allowed border border-border-subtle text-text-muted"
          : TONE[tone],
        busy && "opacity-70",
      )}
    >
      <Icon size={16} strokeWidth={1.5} aria-hidden className="shrink-0" />
      <span className="truncate">{busy ? `${label}…` : label}</span>
    </button>
  );
  return unavailable ? <Tip label={reason}>{button}</Tip> : button;
}

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
    <CapitalAction
      icon={ArrowDownToLine}
      label="Deposit"
      tone="primary"
      reason={null}
      busy={busy}
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
 * The action row, and whatever dialog it has open.
 *
 * Deposit is a direct hand-off with no dialog of Elyra's own — Privy renders
 * its own funding UI, and wrapping it in a second modal would be two modals
 * to close. Swap, Transfer and Withdraw move what is in the Solana wallet,
 * so they need one, holding something.
 */
export function AssetActionBar({
  address,
  walletFunded,
  onExecuted,
}: {
  address: string | null;
  /** The wallet holds a counted balance — something to swap or send. */
  walletFunded: boolean;
  /** A swap or transfer landed; the caller refreshes what it shows. */
  onExecuted?: () => void;
}) {
  const auth = useElyraAuth();
  const [open, setOpen] = useState<Exclude<AssetAction, "deposit"> | null>(null);

  /* Swap, Transfer and Withdraw all sign in this browser, so all three call
     Privy hooks — which THROW when `PrivyClientProvider` did not mount a
     provider. They carry the same guard Deposit does, with the reason. */
  const signReason =
    address === null
      ? "Link a Solana wallet first."
      : !auth.available
        ? "Wallet signing is unavailable on this deployment."
        : !walletFunded
          ? "The wallet holds nothing to move yet — deposit first."
          : null;

  return (
    <>
      <div className="grid grid-cols-2 gap-2 @[36rem]:grid-cols-[1.15fr_1fr_1fr_1fr]">
        {auth.available && address !== null ? (
          <DepositAction address={address} />
        ) : (
          <CapitalAction
            icon={ArrowDownToLine}
            label="Deposit"
            tone="primary"
            reason={address === null ? "Link a Solana wallet to deposit into." : "Wallet funding is unavailable on this deployment."}
            onClick={() => {}}
          />
        )}
        <CapitalAction icon={ArrowLeftRight} label="Swap" tone="secondary" reason={signReason} onClick={() => setOpen("swap")} />
        <CapitalAction icon={Send} label="Transfer" tone="secondary" reason={signReason} onClick={() => setOpen("transfer")} />
        <CapitalAction icon={ArrowUpRight} label="Withdraw" tone="secondary" reason={signReason} onClick={() => setOpen("withdraw")} />
      </div>

      {signReason === null && address !== null && open === "swap" && (
        <SwapDialog address={address} onExecuted={() => onExecuted?.()} onClose={() => setOpen(null)} />
      )}

      {/* One component, two names. `intent` changes the wording; the address
          handling, the confirm step and the build/sign/submit path are the
          same, because a second implementation of "send money somewhere" is a
          second place for the careful parts to be missing. */}
      {signReason === null && address !== null && (open === "transfer" || open === "withdraw") && (
        <TransferDialog address={address} intent={open} onClose={() => setOpen(null)} />
      )}
    </>
  );
}
