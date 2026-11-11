"use client";

import Link from "next/link";
import {
  ArrowRight,
  AtSign,
  BadgeCheck,
  CircleCheck,
  CircleUserRound,
  CircleX,
  Clock3,
  ExternalLink,
  History,
  KeyRound,
  Mail,
  Network,
  Phone,
  RefreshCw,
  Wallet,
  WalletCards,
  type LucideIcon,
} from "lucide-react";
import { useElyraAuth, type ElyraAuth, type LinkedAccountSummary } from "@/components/providers/PrivyClientProvider";
import {
  CopyButton,
  DrawerCard,
  IconButton,
  Metric,
  StatusDot,
  Tip,
} from "@/components/shell/RouteDrawer";
import { CoinMark } from "@/components/ui/CoinMark";
import { methodLabel } from "@/lib/account";
import { formatAge, formatPriceUsd, formatQty, formatRelativeTime, formatUsd, truncateMiddle } from "@/lib/format";
import { useTickerLogos } from "@/lib/market/tickerLogos";
import { txExplorerUrl } from "@/lib/solana/address";
import { CLUSTER_LABEL } from "@/lib/solana/cluster";
import { useElyraStore } from "@/lib/store";
import { useMinute, useSecond } from "@/lib/useClock";
import { cn } from "@/lib/utils";
import type { ActivityStatus, WalletActivity } from "@/lib/wallet/types";
import { useWalletActivity, type ActivityFeed } from "@/lib/wallet/useWalletActivity";
import { useWalletDashboard, type WalletDashboard } from "@/lib/wallet/useWalletDashboard";

/* ---------------------------------------------------------------------------
   The Dashboard drawer: the account at a glance.

   Four cards over two shared stores and the auth façade — `useWalletDashboard`
   (balance, cluster, SOL price), `useWalletActivity` (signatures)
   and `useElyraAuth` (who you are). Each store is reference counted and the
   status bar already holds the wallet one open, so this drawer adds no poll
   of its own.

   Every figure keeps three states apart: not read yet (a skeleton), could
   not be read (a dash or an inline retry), and read as zero ($0.00). A
   failed read never renders as an empty wallet.
--------------------------------------------------------------------------- */

/** Stable, so the logo lookup is one catalogue read for the life of the drawer. */
const MARKS = ["SOL", "ETH"] as const;

function ChainMark({ symbol, size = 32 }: { symbol: "SOL" | "ETH"; size?: number }) {
  const logos = useTickerLogos(MARKS);
  const { logo, fallbackLogo } = logos(symbol);
  return <CoinMark symbol={symbol} logo={logo} fallbackLogo={fallbackLogo} size={size} className="bg-surface-base" />;
}

/** A round tile for an account type that has no coin to show. */
function IconTile({ icon: Icon, size = 32 }: { icon: LucideIcon; size?: number }) {
  return (
    <span
      aria-hidden
      style={{ width: size, height: size }}
      className="grid shrink-0 place-items-center rounded-pill border border-border-subtle bg-surface-base text-text-secondary"
    >
      <Icon size={Math.round(size * 0.47)} strokeWidth={1.5} />
    </span>
  );
}

const outlined = cn(
  "type-label inline-flex h-8 shrink-0 items-center justify-center gap-1.5 whitespace-nowrap rounded-control px-3",
  "border border-accent-quiet text-text-primary",
  "transition-colors duration-[var(--dur-fast)] ease-brand",
  "hover:border-accent hover:bg-surface-hover active:bg-surface-panel",
);

function InlineRetry({ message, onRetry, busy }: { message: string; onRetry: () => void; busy?: boolean }) {
  return (
    <div role="alert" className="flex flex-wrap items-center gap-x-3 gap-y-1.5">
      <p className="type-body-sm min-w-0 flex-1 break-words text-negative">{message}</p>
      <button type="button" onClick={onRetry} disabled={busy} className={cn(outlined, "h-7 px-2.5 disabled:opacity-60")}>
        <RefreshCw size={12} strokeWidth={1.5} aria-hidden className={cn(busy && "motion-safe:animate-spin")} />
        Retry
      </button>
    </div>
  );
}

/* ---------------------------------------------------------------------------
   Holdings
--------------------------------------------------------------------------- */

function HoldingsCard({ wallet }: { wallet: WalletDashboard }) {
  const openSheet = useElyraStore((state) => state.setWalletSheetOpen);
  const now = useSecond();
  const snapshot = wallet.snapshot;
  const uncounted = snapshot === null ? 0 : snapshot.uncounted.unpriced + snapshot.uncounted.unverified;

  return (
    <DrawerCard
      icon={WalletCards}
      title="Holdings"
      right={
        snapshot === null ? (
          wallet.isLoading ? <span aria-hidden className="skeleton h-6 w-16 rounded-pill" /> : null
        ) : (
          <span className="type-label rounded-pill border border-border-subtle px-2.5 py-1 tabular-nums text-text-secondary">
            {snapshot.tokenCount} {snapshot.tokenCount === 1 ? "token" : "tokens"}
          </span>
        )
      }
    >
      <p className="type-label text-text-secondary">Total balance</p>
      <div className="mt-1 min-h-9">
        {snapshot === null ? (
          wallet.isLoading ? (
            <span aria-busy="true" aria-label="Reading balance" className="skeleton block h-9 w-36 rounded-control" />
          ) : (
            <InlineRetry
              message={wallet.error ?? "The balance could not be read."}
              onRetry={wallet.refetch}
              busy={wallet.refreshing}
            />
          )
        ) : snapshot.usdValue === null ? (
          <p>
            <span className="type-display text-text-muted">—</span>
            <span className="type-label mt-1 block text-text-muted">
              No SOL price right now, so the total can&rsquo;t be valued. Balances below are exact.
            </span>
          </p>
        ) : (
          <p className="type-display font-sans tabular-nums text-text-primary">{formatUsd(snapshot.usdValue)}</p>
        )}
      </div>
      {snapshot !== null && (wallet.stale || snapshot.usdValue === 0 || uncounted > 0) && (
        <p className="type-label mt-1 text-text-muted">
          {wallet.stale ? (
            <span className="text-caution">
              Last known balance{wallet.fetchedAt !== null && now !== null ? ` · read ${formatAge(wallet.fetchedAt, now)}` : ""}
            </span>
          ) : snapshot.usdValue === 0 && snapshot.tokenCount === 0 ? (
            "Nothing held yet — fund the wallet to see it here."
          ) : null}
          {uncounted > 0 && (
            <span className="block">
              {uncounted} {uncounted === 1 ? "token isn't" : "tokens aren't"} counted — unpriced or unverified.
            </span>
          )}
        </p>
      )}

      <div className="mt-3 flex flex-wrap items-center gap-3 border-t border-border-subtle pt-3">
        <ChainMark symbol="SOL" size={36} />
        <div className="min-w-0 flex-1">
          <p className="type-label text-text-secondary">SOL balance</p>
          {snapshot === null ? (
            wallet.isLoading ? (
              <span aria-hidden className="skeleton mt-1 block h-5 w-24" />
            ) : (
              <p className="type-body font-medium text-text-muted">—</p>
            )
          ) : (
            <p className="type-body font-medium tabular-nums text-text-primary">{formatQty(snapshot.sol, 4)} SOL</p>
          )}
        </div>
        <button type="button" onClick={() => openSheet(true)} className={outlined}>
          View holdings
          <ArrowRight size={14} strokeWidth={1.5} aria-hidden />
        </button>
      </div>
    </DrawerCard>
  );
}

/* ---------------------------------------------------------------------------
   Network
--------------------------------------------------------------------------- */

/** What the connection is, in words the data supports — never "Connected" on a failed read. */
function connection(wallet: WalletDashboard): { tone: "positive" | "caution" | "negative" | "muted"; label: string } {
  if (wallet.unconfigured) return { tone: "muted", label: "Not configured" };
  if (wallet.wrongChain) return { tone: "negative", label: "Wrong cluster" };
  if (wallet.snapshot === null) {
    return wallet.isLoading ? { tone: "muted", label: "Checking…" } : { tone: "negative", label: "Unreachable" };
  }
  if (wallet.stale) return { tone: "caution", label: "Last read failed" };
  return { tone: "positive", label: "Connected" };
}

function NetworkCard({ wallet }: { wallet: WalletDashboard }) {
  const now = useSecond();
  const status = connection(wallet);
  const snapshot = wallet.snapshot;
  const loading = snapshot === null && wallet.isLoading;
  const pending = <span aria-hidden className="skeleton mt-0.5 block h-5 w-20" />;

  return (
    <DrawerCard icon={Network} title="Network" right={<StatusDot tone={status.tone}>{status.label}</StatusDot>}>
      <div className="grid grid-cols-2 border-t border-border-subtle">
        <Metric label="Cluster" className="border-r border-border-subtle py-3 pr-3">
          {loading ? (
            pending
          ) : (
            <span className={cn("flex min-w-0 items-center gap-2", wallet.wrongChain && "text-negative")}>
              <ChainMark symbol="SOL" size={22} />
              <span className="min-w-0 break-words">{wallet.cluster === null ? "—" : CLUSTER_LABEL[wallet.cluster]}</span>
            </span>
          )}
        </Metric>
        <Metric label="SOL price" className="py-3 pl-4">
          {loading ? (
            pending
          ) : snapshot?.solUsd == null ? (
            <span className="text-text-muted" title="The price feed did not answer">—</span>
          ) : (
            formatPriceUsd(snapshot.solUsd)
          )}
        </Metric>
      </div>

      <div className="mt-1 flex items-center gap-2 border-t border-border-subtle pt-2">
        <p className="type-label min-w-0 flex-1 truncate text-text-muted" aria-live="polite">
          {wallet.refreshing
            ? "Refreshing…"
            : wallet.fetchedAt === null || now === null
              ? wallet.unconfigured
                ? "SOLANA_RPC_URL is not set"
                : wallet.error ?? "Not read yet"
              : wallet.stale
                ? `Last good read ${formatAge(wallet.fetchedAt, now)}`
                : `Updated ${formatAge(wallet.fetchedAt, now)}`}
        </p>
        <IconButton
          label={wallet.refreshing ? "Refreshing network data" : "Refresh network data"}
          onClick={wallet.refetch}
          disabled={wallet.refreshing || wallet.unconfigured}
          className="-mr-1.5"
        >
          <RefreshCw size={15} strokeWidth={1.5} aria-hidden className={cn(wallet.refreshing && "motion-safe:animate-spin")} />
        </IconButton>
      </div>
    </DrawerCard>
  );
}

/* ---------------------------------------------------------------------------
   Account
--------------------------------------------------------------------------- */

function formatJoined(iso: string): string {
  return new Date(iso).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" });
}

function formatWhen(iso: string): string {
  return new Date(iso).toLocaleString("en-GB", {
    day: "numeric",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

const OAUTH_ICON: Record<string, LucideIcon> = { email: Mail, phone: Phone, passkey: KeyRound, wallet: Wallet };

/** How a linked account is named, drawn and copied. */
function describe(entry: LinkedAccountSummary): {
  label: string;
  mark: React.ReactNode;
  value: string | null;
  display: string | null;
  mono: boolean;
  copyLabel: string;
} {
  if (entry.type === "wallet" || entry.type === "smart_wallet") {
    const chain = entry.chainType === "ethereum" ? "Ethereum" : entry.chainType === "solana" ? "Solana" : null;
    const base = entry.type === "smart_wallet" ? "Smart wallet" : chain === null ? "Wallet" : `${chain} wallet`;
    return {
      label: base,
      mark:
        chain === "Ethereum" ? <ChainMark symbol="ETH" /> : chain === "Solana" ? <ChainMark symbol="SOL" /> : <IconTile icon={Wallet} />,
      value: entry.detail,
      display: entry.detail === null ? null : truncateMiddle(entry.detail, 6, 6),
      mono: true,
      copyLabel: `${base.toLowerCase()} address`,
    };
  }
  const label = methodLabel(entry.type);
  return {
    label,
    mark: <IconTile icon={OAUTH_ICON[entry.type] ?? AtSign} />,
    value: entry.detail,
    display: entry.detail,
    mono: false,
    copyLabel: label.toLowerCase(),
  };
}

/** Only an email or phone number Privy says it verified carries the badge. */
function verifiedAt(entry: LinkedAccountSummary): string | null {
  return entry.type === "email" || entry.type === "phone" ? entry.verifiedAt : null;
}

function AccountRow({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex min-h-11 items-center justify-between gap-3 border-b border-border-subtle py-1.5 @max-[360px]:flex-col @max-[360px]:items-start @max-[360px]:gap-0.5">
      <span className="type-body-sm shrink-0 text-text-secondary">{label}</span>
      <div className="flex min-w-0 items-center gap-1 @max-[360px]:w-full">{children}</div>
    </div>
  );
}

function LinkedRow({ entry }: { entry: LinkedAccountSummary }) {
  const shown = describe(entry);
  const verified = verifiedAt(entry);
  return (
    <li
      className={cn(
        "group -mx-2 flex items-center gap-3 rounded-control border border-transparent px-2 py-1.5",
        "transition-colors duration-[var(--dur-fast)] ease-brand",
        "hover:border-sage/50 hover:bg-surface-hover focus-within:border-sage/50 focus-within:bg-surface-hover",
      )}
    >
      {shown.mark}
      <div className="flex min-w-0 flex-1 items-center justify-between gap-x-3 @max-[380px]:flex-col @max-[380px]:items-start">
        <span className="type-body-sm shrink-0 text-text-primary">{shown.label}</span>
        <span
          className={cn(
            "min-w-0 max-w-full truncate text-text-secondary",
            shown.mono ? "type-mono-addr" : "type-body-sm",
          )}
          title={shown.value ?? undefined}
        >
          {shown.value === null ? "—" : shown.display}
          {shown.value !== null && shown.display !== shown.value && <span className="sr-only"> ({shown.value})</span>}
        </span>
      </div>
      {verified !== null ? (
        <Tip openOnTap label={`Verified by sign-in provider · ${formatWhen(verified)}`}>
          <span tabIndex={0} aria-label="Verified" className={cn("grid size-8 shrink-0 place-items-center rounded-control text-positive")}>
            <BadgeCheck size={17} strokeWidth={1.75} aria-hidden />
          </span>
        </Tip>
      ) : shown.value !== null ? (
        <CopyButton value={shown.value} label={shown.copyLabel} className="group-hover:text-text-primary" />
      ) : (
        <span aria-hidden className="size-8 shrink-0" />
      )}
    </li>
  );
}

function AccountCard({ auth }: { auth: ElyraAuth }) {
  const account = auth.account;
  if (!auth.ready || account === null) {
    return (
      <DrawerCard id="account" icon={CircleUserRound} title="Account" className="scroll-mt-3">
        <div aria-busy="true" aria-label="Reading account" className="flex flex-col gap-2">
          {[0, 1, 2, 3].map((index) => (
            <span key={index} aria-hidden className="skeleton h-8 w-full rounded-control" />
          ))}
        </div>
      </DrawerCard>
    );
  }

  /* Wallets first — on a Solana account they are what you came to check —
     each group in the order it was linked. */
  const ordered = [...account.accounts].sort((a, b) => Number(b.type === "wallet") - Number(a.type === "wallet"));
  const method = account.loginMethod;
  const MethodIcon = method === null ? null : (OAUTH_ICON[method.type] ?? AtSign);

  return (
    <DrawerCard id="account" icon={CircleUserRound} title="Account" className="scroll-mt-3">
      <div className="border-t border-border-subtle">
        <AccountRow label="User ID">
          <span className="type-mono-addr min-w-0 truncate text-text-primary" title={account.id}>
            {truncateMiddle(account.id, 14, 6)}
            <span className="sr-only"> ({account.id})</span>
          </span>
          <CopyButton value={account.id} label="user ID" className="-mr-1.5" />
        </AccountRow>
        {account.createdAt !== null && (
          <AccountRow label="Created">
            <span className="type-body-sm tabular-nums text-text-primary">{formatJoined(account.createdAt)}</span>
          </AccountRow>
        )}
        {method !== null && MethodIcon !== null && (
          <AccountRow label="Sign-in method">
            <MethodIcon size={15} strokeWidth={1.5} aria-hidden className="shrink-0 text-text-secondary" />
            <span className="type-body-sm text-text-primary">{methodLabel(method.type)}</span>
          </AccountRow>
        )}
      </div>

      <div className="mb-1.5 mt-3 flex items-baseline justify-between gap-2">
        <h3 className="type-body-sm font-medium text-text-primary">Linked accounts</h3>
        <span className="type-label tabular-nums text-text-secondary">{ordered.length} linked</span>
      </div>
      {ordered.length === 0 ? (
        <p className="type-body-sm text-text-muted">No accounts are linked.</p>
      ) : (
        <ul className="flex list-none flex-col gap-0.5">
          {ordered.map((entry, index) => (
            <LinkedRow key={`${entry.type}-${entry.detail ?? index}`} entry={entry} />
          ))}
        </ul>
      )}
    </DrawerCard>
  );
}

/* ---------------------------------------------------------------------------
   Recent activity
--------------------------------------------------------------------------- */

const STATUS: Record<ActivityStatus, { label: string; icon: LucideIcon; tone: string }> = {
  confirmed: { label: "Confirmed", icon: CircleCheck, tone: "text-positive" },
  pending: { label: "Pending", icon: Clock3, tone: "text-neutral-flat" },
  failed: { label: "Failed", icon: CircleX, tone: "text-negative" },
};

function ActivityRow({ item, now, cluster }: { item: WalletActivity; now: number | null; cluster: WalletDashboard["cluster"] }) {
  const status = STATUS[item.status];
  const StatusIcon = status.icon;
  const when = item.at === null ? null : formatWhen(item.at);
  return (
    <li className="flex h-14 items-center gap-3 border-b border-border-subtle last:border-b-0">
      <StatusIcon size={20} strokeWidth={1.5} aria-hidden className={cn("shrink-0", status.tone)} />
      <div className="min-w-0 flex-1">
        <p className="type-mono-addr truncate text-text-primary" title={item.signature}>
          {truncateMiddle(item.signature, 6, 6)}
        </p>
        <p className={cn("type-label", status.tone)}>{status.label}</p>
      </div>
      {when === null ? (
        <span className="type-label shrink-0 text-text-muted">In flight</span>
      ) : (
        <Tip openOnTap label={when}>
          <time
            dateTime={item.at ?? undefined}
            tabIndex={0}
            aria-label={`${status.label} ${when}`}
            className={cn("type-label shrink-0 rounded-chip tabular-nums text-text-secondary")}
          >
            {now === null || item.at === null ? "—" : formatRelativeTime(item.at, now)}
          </time>
        </Tip>
      )}
      <Tip label={item.href ? "Open in the explorer" : "Open in Solscan"}>
        <a
          href={item.href ?? txExplorerUrl(item.signature, cluster)}
          target="_blank"
          rel="noopener noreferrer"
          aria-label={`Open transaction ${truncateMiddle(item.signature, 6, 6)} in ${item.href ? "the explorer" : "Solscan"}`}
          className={cn(
            "-mr-1.5 grid size-8 shrink-0 place-items-center rounded-control text-text-muted",
            "transition-colors duration-[var(--dur-fast)] ease-brand hover:bg-surface-hover hover:text-text-primary",
          )}
        >
          <ExternalLink size={15} strokeWidth={1.5} aria-hidden />
        </a>
      </Tip>
    </li>
  );
}

function RecentActivityCard({ feed, cluster }: { feed: ActivityFeed; cluster: WalletDashboard["cluster"] }) {
  const now = useMinute();

  return (
    <DrawerCard icon={History} title="Recent activity" right={<span className="type-label text-text-secondary">Newest first</span>}>
      <div className="border-t border-border-subtle">
        {feed.unconfigured ? (
          <p className="type-body-sm py-4 text-text-muted">
            Transaction history needs <code>SOLANA_RPC_URL</code>, which is not set.
          </p>
        ) : feed.error !== null && feed.items.length === 0 ? (
          <div className="py-3">
            <InlineRetry message={feed.error} onRetry={() => void feed.refetch()} busy={feed.refreshing} />
          </div>
        ) : feed.isLoading ? (
          <ul aria-busy="true" aria-label="Reading transactions" className="flex list-none flex-col">
            {[0, 1, 2, 3, 4].map((index) => (
              <li key={index} aria-hidden className="flex h-14 items-center gap-3 border-b border-border-subtle last:border-b-0">
                <span className="skeleton size-5 rounded-pill" />
                <span className="flex flex-1 flex-col gap-1.5">
                  <span className="skeleton h-3 w-32" />
                  <span className="skeleton h-2.5 w-16" />
                </span>
                <span className="skeleton h-3 w-12" />
              </li>
            ))}
          </ul>
        ) : feed.items.length === 0 ? (
          <div className="flex flex-col items-center gap-1 py-6 text-center">
            <IconTile icon={History} size={36} />
            <p className="type-body-sm mt-1.5 font-medium text-text-primary">No transactions yet</p>
            <p className="type-label max-w-64 text-text-muted">
              Transactions this wallet signs or receives appear here, newest first.
            </p>
          </div>
        ) : (
          <ul className="flex list-none flex-col">
            {feed.items.map((item) => (
              <ActivityRow key={item.signature} item={item} now={now} cluster={cluster} />
            ))}
          </ul>
        )}
      </div>
      <Link href="/assets" className={cn(outlined, "mt-3 h-10 w-full")}>
        View all activity
        <ArrowRight size={14} strokeWidth={1.5} aria-hidden />
      </Link>
    </DrawerCard>
  );
}

/* ---------------------------------------------------------------------------
   The drawer's body
--------------------------------------------------------------------------- */

export function DashboardCards() {
  return <DashboardView auth={useElyraAuth()} wallet={useWalletDashboard()} activity={useWalletActivity(5)} />;
}

/** The cards with their data passed in, so they render the same from fixtures. */
export function DashboardView({ auth, wallet, activity }: { auth: ElyraAuth; wallet: WalletDashboard; activity: ActivityFeed }) {
  if (!auth.available) {
    return (
      <DrawerCard icon={CircleUserRound} title="Account">
        <p className="type-body-sm text-text-secondary">
          Sign-in is not configured on this deployment, so there is no account to show.
        </p>
      </DrawerCard>
    );
  }

  if (auth.ready && !auth.authenticated) {
    return (
      <DrawerCard icon={WalletCards} title="Connect your wallet">
        <p className="type-body-sm text-text-secondary">
          Sign in to see your balance, the network it&rsquo;s read from, your linked accounts and recent transactions.
        </p>
        <button
          type="button"
          onClick={auth.login}
          className={cn(
            "type-label mt-3 inline-flex h-9 items-center gap-1.5 rounded-control bg-accent px-3.5 text-text-on-accent",
            "transition-colors duration-[var(--dur-fast)] ease-brand hover:bg-accent-hover",
          )}
        >
          Connect wallet
          <ArrowRight size={14} strokeWidth={1.5} aria-hidden />
        </button>
      </DrawerCard>
    );
  }

  return (
    <>
      <HoldingsCard wallet={wallet} />
      <NetworkCard wallet={wallet} />
      <AccountCard auth={auth} />
      <RecentActivityCard feed={activity} cluster={wallet.cluster} />
    </>
  );
}
