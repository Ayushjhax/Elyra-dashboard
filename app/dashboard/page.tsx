"use client";

import { AccountPanel } from "@/components/panels/AccountPanel";
import { WalletActivityPanel } from "@/components/panels/WalletActivityPanel";
import { RouteClose } from "@/components/shell/RouteClose";
import { Eyebrow } from "@/components/ui/Eyebrow";
import { Panel, PanelBody, PanelHeader } from "@/components/ui/Panel";
import { CLUSTER_LABEL, EXPECTED_CLUSTER } from "@/lib/solana/cluster";
import { formatQty, formatUsd } from "@/lib/format";
import { useWalletDashboard } from "@/lib/wallet/useWalletDashboard";
import { cn } from "@/lib/utils";

/* ---------------------------------------------------------------------------
   The wallet dashboard.

   Renders in the route column beside the chart, like every other route — the
   chart is mounted by the shell and is never replaced. The status bar is not
   here: it belongs to the shell and is above everything.

   Every panel below reads `useWalletDashboard`, which is one reference-counted
   subscription and one poll however many of them are on screen.
--------------------------------------------------------------------------- */

function Card({
  title,
  hint,
  children,
}: {
  title: string;
  hint?: string;
  children: React.ReactNode;
}) {
  return (
    <section className="rounded-card border border-border-subtle bg-surface-raised p-3">
      <div className="mb-2 flex items-baseline justify-between gap-2">
        <Eyebrow>{title}</Eyebrow>
        {hint !== undefined && (
          <span className="type-label text-text-muted">{hint}</span>
        )}
      </div>
      {children}
    </section>
  );
}

function Stat({
  label,
  value,
  tone = "default",
}: {
  label: string;
  value: string;
  tone?: "default" | "positive" | "negative" | "muted";
}) {
  return (
    <div className="flex min-w-0 flex-col gap-0.5">
      <span className="type-label truncate text-text-muted">{label}</span>
      <span
        className={cn(
          "type-data tabular-nums",
          {
            default: "text-text-primary",
            positive: "text-positive",
            negative: "text-negative",
            muted: "text-text-muted",
          }[tone],
        )}
      >
        {value}
      </span>
    </div>
  );
}

/**
 * The upstreams, in detail.
 *
 * The status bar's meter compresses this into one number; a dashboard is the
 * right place to show what that number is made of. Every value is measured —
 * the latency is the round trip the last balance read actually took, and the
 * cluster is what the node reported, not what the config claims.
 */
function Upstreams() {
  const wallet = useWalletDashboard();

  const onExpected = wallet.cluster === null || wallet.cluster === EXPECTED_CLUSTER;

  return (
    <Card title="Upstreams" hint={wallet.stale ? "last known" : undefined}>
      <div className="grid grid-cols-2 gap-3">
        <Stat
          label="Cluster"
          value={
            wallet.cluster === null ? "—" : CLUSTER_LABEL[wallet.cluster]
          }
          tone={onExpected ? "default" : "negative"}
        />
        <Stat
          label="RPC round trip"
          value={wallet.latencyMs === null ? "—" : `${wallet.latencyMs} ms`}
          tone={
            wallet.latencyMs === null
              ? "muted"
              : wallet.latencyMs > 400
                ? "negative"
                : "positive"
          }
        />
        <Stat
          label="SOL price"
          value={
            wallet.snapshot?.solUsd == null
              ? "—"
              : formatUsd(wallet.snapshot.solUsd)
          }
          tone={wallet.snapshot?.solUsd == null ? "muted" : "default"}
        />
        <Stat
          label="Slot"
          value={
            wallet.snapshot === null
              ? "—"
              : wallet.snapshot.slot.toLocaleString("en-US")
          }
        />
      </div>

      {wallet.error !== null && (
        <p className="type-label mt-2 break-words text-negative">{wallet.error}</p>
      )}
    </Card>
  );
}

/** Native balance and total, so the dashboard answers "how much" without the sheet. */
function Holdings() {
  const wallet = useWalletDashboard();
  const snapshot = wallet.snapshot;

  return (
    <Card
      title="Holdings"
      hint={
        snapshot === null
          ? undefined
          : `${snapshot.tokenCount} token${snapshot.tokenCount === 1 ? "" : "s"}`
      }
    >
      <div className="grid grid-cols-2 gap-3">
        <Stat
          label="Total value"
          value={
            snapshot?.usdValue == null ? "—" : formatUsd(snapshot.usdValue)
          }
          tone={snapshot?.usdValue == null ? "muted" : "default"}
        />
        <Stat
          label="SOL"
          value={snapshot === null ? "—" : formatQty(snapshot.sol, 4)}
        />
      </div>
      <p className="type-label mt-2 text-text-muted">
        Open the balance chip in the status bar for the full token list.
      </p>
    </Card>
  );
}

export default function DashboardPage() {
  return (
    <Panel label="Dashboard" glow="forest" className="min-h-0 flex-1">
      <PanelHeader>
        <Eyebrow>Dashboard</Eyebrow>
        <RouteClose />
      </PanelHeader>

      <PanelBody className="p-3">
        <div className="mx-auto flex w-full max-w-xl flex-col gap-3">
          <Holdings />
          <Upstreams />

          <Card title="Account">
            <AccountPanel />
          </Card>

          <Card title="Activity" hint="newest first">
            <WalletActivityPanel />
          </Card>
        </div>
      </PanelBody>
    </Panel>
  );
}
