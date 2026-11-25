"use client";

import { useMemo, useState } from "react";
import { ArrowDownLeft, ArrowLeftRight, ArrowUpRight, ExternalLink, History } from "lucide-react";
import { HistoryTable } from "@/components/assets/tables";
import { SwapDialog } from "@/components/assets/SwapDialog";
import { TransferDialog } from "@/components/assets/TransferDialog";
import { Card, CardHead, Delta, Money } from "@/components/portfolio/primitives";
import { ReceiveDialog } from "@/components/portfolio/ReceiveDialog";
import type { ElyraAuth } from "@/components/providers/PrivyClientProvider";
import { Tip } from "@/components/shell/RouteDrawer";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { OptionMenu } from "@/components/ui/OptionMenu";
import { EvmSendDialog, evmWalletOf } from "@/components/wallet/EvmDialogs";
import { SuiSendDialog } from "@/components/wallet/SuiDialogs";
import { EVM_CHAIN_KEYS, type EvmChainKey } from "@/lib/evm/chains";
import { useT } from "@/lib/i18n/client";
import { accountsView, type AccountFilter, type AccountRow } from "@/lib/portfolio/accounts";
import { WALLET_NETWORKS, networkName, type WalletNetwork } from "@/lib/portfolio/chain";
import type { PortfolioFeed } from "@/lib/portfolio/usePortfolio";
import type { Cluster } from "@/lib/solana/cluster";
import { cn } from "@/lib/utils";
import { useWalletActivity } from "@/lib/wallet/useWalletActivity";

/* ---------------------------------------------------------------------------
   Accounts: total equity, where it lives, and the buttons that move it.

   Deposit shows the wallet's address and QR code. Withdraw is the signed
   send that already exists for each network — Solana, the EVM chains, Sui —
   showing the recipient in full before anything is signed. Transfer moves
   money between the person's own accounts: a swap inside the wallet, or a
   venue's own deposit page for Hyperliquid and Polymarket, since venue
   connections are read-only by design and nothing in Elyra moves funds at a
   venue. History is the wallets' transactions.

   Every one of them signs in the person's own wallet or leaves Elyra for the
   venue. Nothing here holds a key or moves money on its own.
--------------------------------------------------------------------------- */

const VENUE_NAMES: Record<string, string> = {
  hyperliquid: "Hyperliquid",
  polymarket: "Polymarket",
  binance: "Binance",
  okx: "OKX",
  bybit: "Bybit",
  coinbase: "Coinbase",
};

const VENUE_DEPOSITS: ReadonlyArray<{ id: string; name: string; url: string; note: string }> = [
  {
    id: "hyperliquid",
    name: "Hyperliquid",
    url: "https://app.hyperliquid.xyz/portfolio",
    note: "Deposit and withdraw USDC on Hyperliquid's own site. Elyra reads the account; it cannot move money there.",
  },
  {
    id: "polymarket",
    name: "Polymarket",
    url: "https://polymarket.com/portfolio",
    note: "Deposit and withdraw on Polymarket's own site. Elyra reads the positions; it cannot move money there.",
  },
];

function ActionButton({
  icon: Icon,
  label,
  reason,
  onClick,
}: {
  icon: typeof ArrowDownLeft;
  label: string;
  /** Why it cannot be used; null when it can. Kept focusable so the reason is reachable. */
  reason: string | null;
  onClick: () => void;
}) {
  const button = (
    <button
      type="button"
      aria-disabled={reason !== null}
      onClick={reason === null ? onClick : undefined}
      className={cn(
        "type-label flex min-h-11 flex-1 flex-col items-center justify-center gap-1 rounded-control border border-border-subtle bg-surface-panel px-2 py-2 text-text-secondary transition-colors",
        reason === null ? "hover:bg-surface-hover hover:text-text-primary" : "cursor-default opacity-60",
      )}
    >
      <Icon size={16} strokeWidth={1.5} aria-hidden />
      {label}
    </button>
  );
  return reason === null ? button : <Tip label={reason} openOnTap>{button}</Tip>;
}

function rowLabel(row: AccountRow, t: ReturnType<typeof useT>): string {
  if (row.kind === "wallet") return row.name === null ? t("Spot & DeFi") : t("Wallet on {network}", { network: networkName(row.name as WalletNetwork) });
  if (row.kind === "hyperliquid") return t("Hyperliquid perps");
  if (row.kind === "prediction") return t("Polymarket");
  return VENUE_NAMES[row.name ?? ""] ?? row.name ?? t("Exchange");
}

function rowDetail(row: AccountRow, t: ReturnType<typeof useT>): string | null {
  if (row.status === "disconnected") return t("Not connected");
  if (row.status === "failed") return row.reason ?? t("Could not be read");
  if (row.count === null) return null;
  if (row.kind === "wallet") return row.count === 1 ? t("1 asset") : t("{count} assets", { count: row.count });
  if (row.kind === "prediction") return row.count === 1 ? t("1 market") : t("{count} markets", { count: row.count });
  return row.count === 1 ? t("1 open position") : t("{count} open positions", { count: row.count });
}

function HistoryDialog({ onClose }: { onClose: () => void }) {
  const t = useT();
  const feed = useWalletActivity(50);
  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-h-[85dvh] w-[min(56rem,calc(100vw-2rem))] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{t("Transaction history")}</DialogTitle>
          <DialogDescription>{t("Sends, receives, swaps and bridges across your wallets, newest first.")}</DialogDescription>
        </DialogHeader>
        {feed.error !== null && feed.items.length === 0 ? (
          <p className="type-body-sm text-text-secondary">{feed.error}</p>
        ) : (
          <HistoryTable items={feed.items} />
        )}
        {feed.notes.map((note) => (
          <p key={note} className="type-label text-text-muted">
            {t(note)}
          </p>
        ))}
      </DialogContent>
    </Dialog>
  );
}

function TransferChooser({ canSwap, onSwap, onClose }: { canSwap: boolean; onSwap: () => void; onClose: () => void }) {
  const t = useT();
  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="w-[min(30rem,calc(100vw-2rem))]">
        <DialogHeader>
          <DialogTitle>{t("Move funds between your accounts")}</DialogTitle>
          <DialogDescription>
            {t("Elyra moves money only from your own wallet, and only when you sign. A venue's deposits and withdrawals happen on its own site.")}
          </DialogDescription>
        </DialogHeader>
        <ul className="flex list-none flex-col gap-2">
          <li>
            <button
              type="button"
              disabled={!canSwap}
              onClick={onSwap}
              className="flex w-full items-center gap-3 rounded-control border border-border-subtle bg-surface-panel px-3 py-2.5 text-left transition-colors hover:bg-surface-hover disabled:cursor-default disabled:opacity-60"
            >
              <ArrowLeftRight size={16} strokeWidth={1.5} aria-hidden className="shrink-0 text-text-muted" />
              <span className="min-w-0">
                <span className="type-body-sm block text-text-primary">{t("Swap inside your wallet")}</span>
                <span className="type-label block text-text-muted">
                  {canSwap ? t("One token for another on Solana, signed by you.") : t("Link a Solana wallet first.")}
                </span>
              </span>
            </button>
          </li>
          {VENUE_DEPOSITS.map((venue) => (
            <li key={venue.id}>
              <a
                href={venue.url}
                target="_blank"
                rel="noopener noreferrer"
                className="flex w-full items-center gap-3 rounded-control border border-border-subtle bg-surface-panel px-3 py-2.5 transition-colors hover:bg-surface-hover"
              >
                <ExternalLink size={16} strokeWidth={1.5} aria-hidden className="shrink-0 text-text-muted" />
                <span className="min-w-0">
                  <span className="type-body-sm block text-text-primary">{t("Fund {venue}", { venue: venue.name })}</span>
                  <span className="type-label block text-text-muted">{t(venue.note)}</span>
                </span>
              </a>
            </li>
          ))}
        </ul>
      </DialogContent>
    </Dialog>
  );
}

type Open = null | "deposit" | "withdraw" | "transfer" | "swap" | "history";

export function AccountsPanel({ auth, feed, cluster }: { auth: ElyraAuth; feed: PortfolioFeed; cluster: Cluster | null }) {
  const t = useT();
  const [filter, setFilter] = useState<AccountFilter>("all");
  const [open, setOpen] = useState<Open>(null);
  const snapshot = feed.snapshot;
  const view = useMemo(() => (snapshot === null ? null : accountsView(snapshot, filter)), [snapshot, filter]);

  const evm = evmWalletOf(auth);
  const evmChain: EvmChainKey | null = (EVM_CHAIN_KEYS as readonly string[]).includes(filter) ? (filter as EvmChainKey) : null;
  const withdrawReason = !auth.available
    ? t("Wallet signing is unavailable on this deployment.")
    : evmChain !== null
      ? evm.address === null || !evm.embedded
        ? t("Sending on {network} needs Elyra's own EVM wallet.", { network: networkName(evmChain) })
        : null
      : filter === "sui"
        ? auth.suiAddress === null
          ? t("This account has no Sui wallet yet.")
          : null
        : auth.solanaAddress === null
          ? t("Link a Solana wallet first.")
          : null;

  const options = [
    { id: "all", label: t("All chains") },
    ...WALLET_NETWORKS.map((network) => ({ id: network, label: networkName(network) })),
  ];

  return (
    <Card className="gap-3 p-4">
      <CardHead
        title={t("Accounts")}
        right={<OptionMenu label={t("Network")} options={options} value={filter} onChange={(id) => setFilter(id as AccountFilter)} align="end" />}
      />

      <div>
        <p className="type-label text-text-muted">{filter === "all" ? t("Total equity") : t("Equity on {network}", { network: networkName(filter) })}</p>
        <p className="type-price mt-0.5 text-text-primary">
          <Money value={view?.totalUsd ?? null} reason={feed.error ?? t("Not read yet.")} />
        </p>
        {view?.partial === true && <p className="type-label text-caution">{t("Partial: a source could not be read, so this is what could be.")}</p>}
      </div>

      <div className="grid grid-cols-4 gap-1.5">
        <ActionButton icon={ArrowDownLeft} label={t("Deposit")} reason={auth.solanaAddress === null && evm.address === null ? t("This account has no wallet yet.") : null} onClick={() => setOpen("deposit")} />
        <ActionButton icon={ArrowLeftRight} label={t("Transfer")} reason={null} onClick={() => setOpen("transfer")} />
        <ActionButton icon={ArrowUpRight} label={t("Withdraw")} reason={withdrawReason} onClick={() => setOpen("withdraw")} />
        <ActionButton icon={History} label={t("History")} reason={null} onClick={() => setOpen("history")} />
      </div>

      {view === null ? (
        <div aria-busy="true" aria-label={t("Reading your accounts")} className="h-32 animate-pulse rounded-card bg-surface-panel" />
      ) : (
        <ul aria-label={t("Accounts")} className="flex list-none flex-col divide-y divide-border-subtle rounded-card border border-border-subtle">
          {view.rows.map((row) => {
            const detail = rowDetail(row, t);
            return (
              <li key={row.id} className="flex items-center justify-between gap-3 px-3 py-2.5">
                <div className="min-w-0">
                  <p className="type-body-sm truncate text-text-primary">{rowLabel(row, t)}</p>
                  <p className={cn("type-label truncate", row.status === "failed" ? "text-caution" : "text-text-muted")}>
                    {detail}
                    {row.defiUsd !== null && (
                      <>
                        {detail !== null && " · "}
                        {t("DeFi")} <Money value={row.defiUsd} compact className="text-text-muted" />
                      </>
                    )}
                  </p>
                </div>
                <div className="shrink-0 text-right">
                  <p className="type-data-sm text-text-primary">
                    <Money value={row.status === "ok" ? row.valueUsd : null} reason={detail ?? undefined} />
                  </p>
                  {row.status === "ok" && (row.changeUsd !== null || row.changePct !== null) && (
                    <p className="type-label flex items-center justify-end gap-1 text-text-muted">
                      <span>{row.changeKind === "24h" ? t("24h") : t("Open")}</span>
                      <Delta pct={row.changePct} usd={row.changeUsd} reason={t("No change reported.")} />
                    </p>
                  )}
                </div>
              </li>
            );
          })}
        </ul>
      )}

      {open === "deposit" && (
        <ReceiveDialog
          open
          onOpenChange={(next) => !next && setOpen(null)}
          address={auth.solanaAddress}
          cluster={cluster}
          network={filter === "all" ? "solana" : filter}
        />
      )}
      {open === "withdraw" && withdrawReason === null && evmChain !== null && <EvmSendDialog chain={evmChain} onClose={() => setOpen(null)} />}
      {open === "withdraw" && withdrawReason === null && filter === "sui" && <SuiSendDialog onClose={() => setOpen(null)} />}
      {open === "withdraw" && withdrawReason === null && evmChain === null && filter !== "sui" && (
        <TransferDialog address={auth.solanaAddress} intent="withdraw" onClose={() => setOpen(null)} />
      )}
      {open === "transfer" && <TransferChooser canSwap={auth.available && auth.solanaAddress !== null} onSwap={() => setOpen("swap")} onClose={() => setOpen(null)} />}
      {open === "swap" && <SwapDialog address={auth.solanaAddress} onExecuted={() => feed.refetch()} onClose={() => setOpen(null)} />}
      {open === "history" && <HistoryDialog onClose={() => setOpen(null)} />}
    </Card>
  );
}
