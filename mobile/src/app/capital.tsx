import { useMemo, useState } from "react";
import { StyleSheet, View } from "react-native";
import { router } from "expo-router";
import Svg, { Circle } from "react-native-svg";
import { ArrowRight, Eye, EyeOff, RefreshCw } from "lucide-react-native";
import {
  ALL_ACCOUNTS,
  capitalAllocation,
  change24hOf,
  deriveAccounts,
  scopeSnapshot,
  syncSummary,
  type CapitalAllocation,
} from "@/lib/assets/derive";
import type { AssetAccount } from "@/lib/assets/types";
import { formatAge, formatPct } from "@/lib/format";
import { ActionBar } from "~/components/portfolio/ActionBar";
import { Block, DetailScreen, HoldingsList, PerpsList, ReadState } from "~/components/portfolio/parts";
import { Button, IconButton, OptionMenu, SegmentedControl } from "~/components/ui/controls";
import { InfoTip } from "~/components/ui/InfoTip";
import { EmptyState } from "~/components/ui/layout";
import { Text } from "~/components/ui/Text";
import { Delta, Money } from "~/components/ui/values";
import { useAppStore, useBalancesHidden } from "~/lib/store";
import { usePortfolio, type PortfolioFeed } from "~/lib/stores/portfolio";
import { useSecond } from "~/lib/useClock";
import { color, palette, radius } from "~/theme/tokens";

/* ---------------------------------------------------------------------------
   Capital accounts — the website's /assets (components/assets/
   CapitalAccounts.tsx): equity, where it is held, each venue's state, and
   the balances, positions and activity behind it, through the same
   derivations (lib/assets/derive.ts) so every figure matches the website's.

   Choosing an account — from the selector or a venue card — filters the
   screen rather than navigating, as on the website.
--------------------------------------------------------------------------- */

/* Tokens, in order — lime first, then the forest's greens and neutrals. */
const SLICE_COLOURS = [color.accent, palette.sage, color["accent-quiet"], color.positive, color["text-secondary"], color["border-strong"]];

function Ring({ allocation, size = 100 }: { allocation: CapitalAllocation | null; size?: number }) {
  const r = 42;
  const circumference = 2 * Math.PI * r;
  let offset = 0;
  const label =
    allocation === null ? "No allocation yet" : `Allocation: ${allocation.slices.map((slice) => `${slice.label} ${slice.pct.toFixed(1)}%`).join(", ")}`;
  return (
    <View accessible accessibilityRole="image" accessibilityLabel={label}>
      <Svg width={size} height={size} viewBox="0 0 100 100" style={{ transform: [{ rotate: "-90deg" }] }}>
        <Circle cx={50} cy={50} r={r} fill="none" strokeWidth={9} stroke={color["border-subtle"]} />
        {allocation?.slices.map((slice, index) => {
          const length = (slice.pct / 100) * circumference;
          const gap = allocation.slices.length > 1 ? Math.min(1.5, length / 3) : 0;
          const segment = (
            <Circle
              key={slice.key}
              cx={50}
              cy={50}
              r={r}
              fill="none"
              strokeWidth={9}
              strokeDasharray={`${Math.max(0, length - gap)} ${circumference}`}
              strokeDashoffset={-offset}
              stroke={SLICE_COLOURS[index % SLICE_COLOURS.length]}
            />
          );
          offset += length;
          return segment;
        })}
      </Svg>
    </View>
  );
}

function badgeFor(account: AssetAccount, feed: PortfolioFeed): { label: string; tone: "negative" | "muted" | "secondary" | "caution" | "positive" } {
  if (account.status === "error") return { label: "Sync failed", tone: "negative" };
  if (account.connection === "unsupported") return { label: "Not available", tone: "muted" };
  if (account.connection === "disconnected") return { label: "Not connected", tone: "secondary" };
  if (feed.refreshing) return { label: "Syncing", tone: "secondary" };
  if (feed.stale) return { label: "Stale", tone: "caution" };
  return { label: "Synced", tone: "positive" };
}

const VENUE_COPY: Record<AssetAccount["type"], string> = {
  spot: "Wallet token balances",
  "solana-perps": "Perpetual positions on Solana",
  hyperliquid: "Perpetuals and balances on Hyperliquid",
  prediction: "Prediction market balances",
};

type Tab = "holdings" | "positions" | "activity";

export default function CapitalScreen() {
  const feed = usePortfolio();
  const hidden = useBalancesHidden();
  const setHidden = useAppStore((state) => state.setBalancesHidden);
  const now = useSecond();
  const [scope, setScope] = useState<string>(ALL_ACCOUNTS);
  const [tab, setTab] = useState<Tab>("holdings");
  const snapshot = feed.snapshot;

  const accounts = useMemo(() => (snapshot === null ? [] : deriveAccounts(snapshot)), [snapshot]);
  /* A scope whose account has gone falls back to all. */
  const scoped = accounts.find((entry) => entry.id === scope) ?? null;
  const shownScope = scoped === null ? ALL_ACCOUNTS : scope;
  const view = useMemo(() => (snapshot === null ? null : scopeSnapshot(snapshot, shownScope)), [snapshot, shownScope]);
  const allocation = useMemo(() => (snapshot === null ? null : capitalAllocation(snapshot, shownScope)), [snapshot, shownScope]);
  const sync = syncSummary(accounts);

  const options = [
    { value: ALL_ACCOUNTS, label: "All accounts" },
    ...accounts.filter((entry) => entry.connection === "connected").map((entry) => ({ value: entry.id as string, label: entry.label })),
  ];

  return (
    <DetailScreen title="Capital accounts" onRefresh={feed.refetch} refreshing={feed.refreshing}>
      <ReadState loading={feed.loading} error={feed.error} stale={false} hasData={snapshot !== null} onRetry={feed.refetch} refreshing={feed.refreshing} />

      {snapshot !== null && view !== null && (
        <>
          <View style={styles.controls}>
            <View style={styles.flex}>
              <OptionMenu label="Account" value={shownScope} choices={options} onChange={setScope} />
            </View>
            <IconButton accessibilityLabel={hidden ? "Show balances" : "Hide balances"} onPress={() => setHidden(!hidden)}>
              {hidden ? <EyeOff size={18} strokeWidth={1.5} color={color.accent} /> : <Eye size={18} strokeWidth={1.5} color={color["text-secondary"]} />}
            </IconButton>
          </View>
          <Text variant="label" tone={feed.stale ? "caution" : "secondary"} accessibilityLiveRegion="polite">
            {feed.refreshing
              ? "Refreshing…"
              : feed.stale
                ? `Refresh failed · showing the reading from ${feed.fetchedAt === null ? "earlier" : formatAge(feed.fetchedAt, now)}`
                : feed.fetchedAt !== null
                  ? `Updated ${formatAge(feed.fetchedAt, now)}`
                  : ""}
          </Text>

          {/* ---- equity ---- */}
          <Equity snapshot={snapshot} accounts={accounts} scope={shownScope} connected={sync.connected} total={sync.total} />

          {/* ---- allocation ---- */}
          <Block label="Allocation">
            <Text variant="h2" accessibilityRole="header">
              Allocation
            </Text>
            <Text variant="body-sm" tone="secondary">
              {scoped === null ? "Where your capital is held." : `What ${scoped.label} holds.`}
            </Text>
            <View style={styles.allocation}>
              <Ring allocation={allocation} />
              {allocation === null ? (
                <Text variant="body-sm" tone="secondary" style={styles.flex}>
                  Allocation appears once funded.
                </Text>
              ) : (
                <View style={styles.legend}>
                  {allocation.slices.map((slice, index) => (
                    <View key={slice.key} style={styles.legendRow}>
                      <View style={[styles.swatch, { backgroundColor: SLICE_COLOURS[index % SLICE_COLOURS.length] }]} />
                      <Text variant="body-sm" numberOfLines={1} style={styles.flex}>
                        {slice.label}
                      </Text>
                      <Text variant="data-sm" tone="secondary">
                        {slice.pct < 0.05 ? "<0.1" : slice.pct.toFixed(1)}%
                      </Text>
                    </View>
                  ))}
                  <Text variant="label" tone="muted">
                    {allocation.by === "account" ? "Share of total equity, by account." : "Share of this account, by holding."}
                  </Text>
                </View>
              )}
            </View>
          </Block>

          {/* ---- venues ---- */}
          <Text variant="h2" accessibilityRole="header">
            Venues
          </Text>
          {accounts.map((account) => {
            const badge = badgeFor(account, feed);
            const connected = account.connection === "connected" && account.status !== "error";
            const selected = scoped?.id === account.id;
            return (
              <Block key={account.id} label={account.label}>
                <View style={styles.between}>
                  <Text variant="h2" numberOfLines={1} style={styles.flex}>
                    {account.label}
                  </Text>
                  <Text variant="label" tone={badge.tone}>
                    {badge.label}
                  </Text>
                </View>
                {account.status === "error" ? (
                  <Text variant="body-sm" tone="negative">
                    {account.errorReason ?? "The last read failed."}
                  </Text>
                ) : connected ? (
                  <>
                    <Money value={account.valueUsd} reason={account.errorReason ?? "Not valued."} variant="h1" />
                    <Text variant="body-sm" tone="secondary">
                      {account.detail ?? VENUE_COPY[account.type]}
                    </Text>
                  </>
                ) : (
                  <Text variant="body-sm" tone="secondary">
                    {account.detail ?? VENUE_COPY[account.type]}
                  </Text>
                )}
                {account.status === "error" ? (
                  <Button
                    label="Retry sync"
                    size="sm"
                    icon={<RefreshCw size={14} strokeWidth={1.5} color={color["text-primary"]} />}
                    onPress={feed.refetch}
                  />
                ) : connected ? (
                  <Button
                    label={selected ? "Viewing this account" : "View account"}
                    size="sm"
                    variant={selected ? "accent" : "quiet"}
                    icon={<ArrowRight size={14} strokeWidth={1.5} color={selected ? color["text-on-accent"] : color["text-primary"]} />}
                    onPress={() => setScope(selected ? ALL_ACCOUNTS : account.id)}
                  />
                ) : account.connection === "disconnected" ? (
                  <Button label="Manage connections" size="sm" onPress={() => router.push("/account")} />
                ) : null}
              </Block>
            );
          })}

          {/* ---- the data ---- */}
          <SegmentedControl<Tab>
            accessibilityLabel="Account data"
            value={tab}
            onChange={setTab}
            choices={[
              { value: "holdings", label: `Holdings ${view.spot.length}` },
              { value: "positions", label: `Positions ${view.perps.length + (shownScope === ALL_ACCOUNTS ? snapshot.defi.length : 0)}` },
              { value: "activity", label: "Activity" },
            ]}
          />
          <Block padded={false} label="Account data">
            {tab === "holdings" ? (
              view.spot.length > 0 ? (
                <HoldingsList holdings={view.spot} />
              ) : (
                <EmptyState
                  title="Your assets will appear here"
                  body={scoped === null ? "Deposit funds to a connected account to see your balances and allocation." : `${scoped.label} holds no spot tokens here.`}
                  action={shownScope === ALL_ACCOUNTS || shownScope === "spot" ? <Button label="View deposit address" size="sm" onPress={() => router.push("/receive")} /> : undefined}
                />
              )
            ) : tab === "positions" ? (
              view.perps.length > 0 || (shownScope === ALL_ACCOUNTS && snapshot.defi.length > 0) ? (
                <View>
                  {view.perps.length > 0 && <PerpsList positions={view.perps} />}
                  {shownScope === ALL_ACCOUNTS &&
                    snapshot.defi.map((position) => (
                      <View key={position.id} style={styles.defiRow}>
                        <View style={styles.flex}>
                          <Text variant="body-sm" numberOfLines={1}>
                            {position.label}
                          </Text>
                          <Text variant="label" tone="secondary">
                            {position.protocol} · DeFi
                            {position.apyPct !== null ? ` · ${formatPct(position.apyPct, { sign: false })} APY, variable` : ""}
                          </Text>
                        </View>
                        <Money value={position.valueUsd} reason="The protocol reported no value." />
                      </View>
                    ))}
                </View>
              ) : (
                <EmptyState
                  title="No open positions"
                  body="Perpetuals at connected venues, DeFi deposits and prediction-market shares appear here with their value and open PnL."
                />
              )
            ) : shownScope === ALL_ACCOUNTS || shownScope === "spot" ? (
              <EmptyState
                title="The wallet's transactions"
                body="Every send, receive and swap, with its status and explorer link."
                action={<Button label="Open wallet activity" size="sm" onPress={() => router.push("/activity")} />}
              />
            ) : (
              <EmptyState
                title={`${scoped?.label ?? "This venue"} keeps its own history`}
                body="Activity here is the Solana wallet's transactions. Choose All accounts or Spot to see them."
                action={<Button label="Show all accounts" size="sm" onPress={() => setScope(ALL_ACCOUNTS)} />}
              />
            )}
          </Block>
        </>
      )}
    </DetailScreen>
  );
}

function Equity({
  snapshot,
  accounts,
  scope,
  connected,
  total,
}: {
  snapshot: NonNullable<PortfolioFeed["snapshot"]>;
  accounts: AssetAccount[];
  scope: string;
  connected: number;
  total: number;
}) {
  const scoped = accounts.find((entry) => entry.id === scope) ?? null;
  const view = scopeSnapshot(snapshot, scope);
  const value = scoped === null ? snapshot.summary.totalValueUsd : scoped.valueUsd;
  const available = scoped === null ? snapshot.summary.availableCapitalUsd : scoped.availableUsd;
  const positions =
    scoped === null
      ? snapshot.perps.length + snapshot.defi.length + (snapshot.prediction.connected ? (snapshot.prediction.activeMarkets ?? 0) : 0)
      : scoped.positions;
  const change = change24hOf(view.spot);
  const nothingHeld = value === 0 && view.spot.length === 0 && view.perps.length === 0 && (scoped !== null || snapshot.defi.length === 0);

  return (
    <Block label="Total equity">
      <View style={styles.between}>
        <Text variant="body">{scoped === null ? "Total equity" : `${scoped.label} equity`}</Text>
        <View style={styles.pill}>
          <View style={[styles.swatch, { backgroundColor: connected > 0 ? palette.sage : color["text-muted"] }]} />
          <Text variant="label" tone="secondary">
            {connected} of {total} venues connected
          </Text>
        </View>
      </View>
      <Money value={value} reason={scoped?.errorReason ?? "No source returned a value that could be totalled."} variant="display" />
      {nothingHeld ? (
        <Text variant="body-sm" tone="secondary">
          No performance history yet.
        </Text>
      ) : change === null ? (
        <Text variant="body-sm" tone="muted">
          {scoped !== null && view.spot.length === 0
            ? "24h change is measured for wallet balances."
            : "No 24h price for what's held, so change can't be measured."}
        </Text>
      ) : (
        <View style={styles.inline}>
          <Delta pct={change.pnlPct} usd={change.pnlUsd} />
          <Text variant="body-sm" tone="secondary">
            past 24h{change.coveragePct < 95 ? ` · over ${change.coveragePct.toFixed(0)}% of value` : ""}
          </Text>
        </View>
      )}
      {snapshot.partial && scoped === null && (
        <Text variant="label" tone="caution">
          Partial total — {snapshot.notes.filter((note) => note.kind === "failed").map((note) => note.reason).join(" ")}
        </Text>
      )}
      <View style={styles.split}>
        <View style={styles.flex}>
          <View style={styles.inline}>
            <Text variant="body-sm" tone="secondary">
              Available to deploy
            </Text>
            <InfoTip text="Stablecoins held plus free collateral at connected venues — what could be deployed without selling anything." />
          </View>
          <Money value={available ?? (value === 0 ? 0 : null)} reason="No stablecoin balance or venue collateral was readable." variant="h2" />
        </View>
        <View style={styles.flex}>
          <Text variant="body-sm" tone="secondary">
            Open positions
          </Text>
          <Text variant="h2">{positions === null ? "—" : positions}</Text>
        </View>
      </View>
      <ActionBar />
    </Block>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1, minWidth: 0 },
  controls: { flexDirection: "row", alignItems: "center", gap: 8 },
  inline: { flexDirection: "row", alignItems: "center", gap: 6, flexWrap: "wrap" },
  between: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 12 },
  pill: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: radius.pill,
    borderWidth: 1,
    borderColor: color["border-subtle"],
  },
  split: { flexDirection: "row", gap: 16, paddingTop: 10, borderTopWidth: StyleSheet.hairlineWidth * 2, borderTopColor: color["border-subtle"] },
  allocation: { flexDirection: "row", alignItems: "center", gap: 16 },
  legend: { flex: 1, gap: 4 },
  legendRow: { flexDirection: "row", alignItems: "center", gap: 8 },
  swatch: { width: 10, height: 10, borderRadius: radius.pill },
  defiRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderTopWidth: StyleSheet.hairlineWidth * 2,
    borderTopColor: color["border-subtle"],
  },
});
