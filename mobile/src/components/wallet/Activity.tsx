import { useMemo, useState } from "react";
import { Pressable, StyleSheet, View } from "react-native";
import {
  ArrowDownLeft,
  ArrowLeftRight,
  ArrowUpRight,
  BellRing,
  CheckCircle2,
  ChevronDown,
  Clock3,
  Coins,
  ExternalLink,
  KeyRound,
  Sparkles,
  XCircle,
  Zap,
  type LucideIcon,
} from "lucide-react-native";
import { EVM_CHAINS } from "@/lib/evm/chains";
import { accountEvents, type AccountEvent } from "@/lib/activity/events";
import {
  directionOf,
  filterEvents,
  formatTokenAmount,
  RANGE_LABEL,
  type ActivityFilters,
  type DateRange,
  type Direction,
  type Network,
} from "@/lib/activity/filter";
import { formatClock, formatDayGroup, formatTimestamp } from "@/lib/format";
import { txExplorerUrl } from "@/lib/solana/address";
import { assetName, type TxAmount } from "@/lib/wallet/summarise";
import { IconButton, OptionMenu, SegmentedControl } from "~/components/ui/controls";
import { Text } from "~/components/ui/Text";
import { openExternal } from "~/components/wallet/parts";
import { useOpenActions } from "~/lib/stores/actions";
import { useWalletActivity, type ActivityFeed } from "~/lib/stores/activity";
import { color, radius, TOUCH_TARGET } from "~/theme/tokens";

/* ---------------------------------------------------------------------------
   Wallet activity — the website's Activity widget, as a phone list.

   The account's transactions and its actions awaiting review, newest first:
   All / Received / Sent, a date range and the network; day groups on the
   shared clock; each row's real status (pending, confirmed, failed) and
   its full signed amount, never cut short. A row opens its details in
   place; the explorer link beside it opens the explorer and nothing else.

   Everything is the wallet's own data (lib/wallet/summarise.ts decodes what
   each transaction did). Fired alerts join this list when the alerts store
   does.
--------------------------------------------------------------------------- */

export interface DayGroup {
  title: string;
  data: AccountEvent[];
}

/** The account's events, through the shared activity rules. */
export function useActivityEvents(): { feed: ActivityFeed; events: AccountEvent[] } {
  const feed = useWalletActivity(25);
  const actions = useOpenActions();
  const events = useMemo(
    () =>
      accountEvents({
        wallet: feed.items,
        venue: [],
        alerts: [],
        actions: actions.actions,
        explorer: (signature) => txExplorerUrl(signature),
        alertNote: "alert fired",
      }),
    [feed.items, actions.actions],
  );
  return { feed, events };
}

/** Newest first, not-yet-in-a-block before everything, one group per day. */
export function groupByDay(events: readonly AccountEvent[], now: number): DayGroup[] {
  const ordered = [...events].sort(
    (a, b) => (b.at === null ? Infinity : Date.parse(b.at)) - (a.at === null ? Infinity : Date.parse(a.at)),
  );
  const groups: DayGroup[] = [];
  for (const event of ordered) {
    const title = event.at === null ? "Processing" : formatDayGroup(event.at, now);
    const last = groups.at(-1);
    if (last !== undefined && last.title === title) last.data.push(event);
    else groups.push({ title, data: [event] });
  }
  return groups;
}

export function filtered(events: readonly AccountEvent[], filters: ActivityFilters, now: number): AccountEvent[] {
  return filterEvents(events, filters, now);
}

export function emptyMessage(filters: ActivityFilters): string {
  const what = filters.direction === "received" ? "received transactions" : filters.direction === "sent" ? "sent transactions" : "activity";
  const when = filters.range === "all" ? "" : ` ${RANGE_LABEL[filters.range].toLowerCase()}`;
  return `No ${what}${when}.`;
}

/* ---- the filters ---- */

export function ActivityFilterBar({
  filters,
  onChange,
}: {
  filters: ActivityFilters;
  onChange: (next: ActivityFilters) => void;
}) {
  const set = <K extends keyof ActivityFilters>(key: K, value: ActivityFilters[K]) => onChange({ ...filters, [key]: value });
  return (
    <View style={styles.filters}>
      <SegmentedControl<Direction>
        accessibilityLabel="Direction"
        value={filters.direction}
        onChange={(value) => set("direction", value)}
        choices={[
          { value: "all", label: "All" },
          { value: "received", label: "Received" },
          { value: "sent", label: "Sent" },
        ]}
      />
      <View style={styles.filterRow}>
        <OptionMenu<DateRange>
          label="Date range"
          value={filters.range}
          onChange={(value) => set("range", value)}
          choices={(Object.keys(RANGE_LABEL) as DateRange[]).map((range) => ({ value: range, label: RANGE_LABEL[range] }))}
        />
        <OptionMenu<Network>
          label="Network"
          value={filters.network}
          onChange={(value) => set("network", value)}
          choices={[
            { value: "all", label: "All networks" },
            { value: "solana", label: "Solana" },
            { value: "ethereum", label: "Ethereum" },
            { value: "robinhood", label: "Robinhood Chain" },
          ]}
        />
      </View>
    </View>
  );
}

/* ---- a row ---- */

function primarySymbol(amounts: TxAmount[], sign: 1 | -1): string | null {
  const entry = amounts.find((amount) => Math.sign(amount.amount) === sign);
  return entry ? assetName(entry) : null;
}

/** "Sent SOL", "Received USDC", "Swapped SOL → USDC" — the amount sits on the right. */
function actionLabel(event: AccountEvent): string {
  const summary = event.summary;
  if (event.kind !== "transaction" || !summary) return event.text;
  const incoming = primarySymbol(summary.amounts, 1);
  const outgoing = primarySymbol(summary.amounts, -1);
  switch (summary.kind) {
    case "receive":
      return summary.unverifiedOnly ? "Received unverified token" : `Received ${incoming ?? ""}`.trim();
    case "send":
      return `Sent ${outgoing ?? ""}`.trim();
    case "swap":
      return `Swapped ${outgoing ?? "?"} → ${incoming ?? "?"}`;
    case "stake":
      return `Staked ${outgoing ?? ""}`.trim();
    case "unstake":
      return `Withdrew ${incoming ?? ""}`.trim();
    default:
      return summary.title;
  }
}

const STATUS: Record<AccountEvent["status"], { label: string; icon: LucideIcon; tone: "secondary" | "primary" | "negative" }> = {
  confirmed: { label: "Confirmed", icon: CheckCircle2, tone: "secondary" },
  pending: { label: "Pending", icon: Clock3, tone: "primary" },
  failed: { label: "Failed", icon: XCircle, tone: "negative" },
};

function statusOf(event: AccountEvent): { label: string; icon: LucideIcon; tone: "secondary" | "primary" | "negative" } {
  if (event.kind === "alert") return { label: "Alert fired", icon: BellRing, tone: "secondary" };
  if (event.kind === "action") return { label: "Awaiting review", icon: Sparkles, tone: "primary" };
  return STATUS[event.status];
}

function DirectionMark({ event }: { event: AccountEvent }) {
  const direction = directionOf(event);
  const kind = event.summary?.kind;
  const Icon: LucideIcon =
    event.status === "failed"
      ? XCircle
      : event.status === "pending" && event.kind === "transaction"
        ? Clock3
        : event.kind === "alert"
          ? BellRing
          : event.kind === "action"
            ? Sparkles
            : direction === "received"
              ? ArrowDownLeft
              : direction === "sent"
                ? ArrowUpRight
                : kind === "swap"
                  ? ArrowLeftRight
                  : kind === "account"
                    ? KeyRound
                    : kind === "stake" || kind === "unstake"
                      ? Coins
                      : Zap;
  const look =
    event.status === "failed"
      ? { background: color["negative-bg"], border: color.negative, icon: color.negative }
      : direction === "received"
        ? { background: color["positive-bg"], border: color["border-subtle"], icon: color.positive }
        : event.agent
          ? { background: color["surface-active"], border: color["border-subtle"], icon: color["agent-accent"] }
          : { background: color["surface-raised"], border: color["border-subtle"], icon: color["text-secondary"] };
  return (
    <View style={[styles.mark, { backgroundColor: look.background, borderColor: look.border }]}>
      <Icon size={14} strokeWidth={2} color={look.icon} />
    </View>
  );
}

/** The signed amounts, in full. Wraps rather than cutting a digit. */
function Amounts({ event }: { event: AccountEvent }) {
  const amounts = event.summary?.amounts ?? [];
  const incoming = amounts.filter((entry) => entry.amount > 0).slice(0, 1);
  const outgoing = amounts.filter((entry) => entry.amount < 0).slice(0, 1);
  if (incoming.length === 0 && outgoing.length === 0) return null;
  const failed = event.status === "failed";
  return (
    <View style={styles.amounts}>
      {incoming.map((entry) => (
        <Text
          key={`+${entry.mint ?? "sol"}`}
          variant="mono-addr"
          tone={failed ? "muted" : event.summary?.unverifiedOnly ? "primary" : "positive"}
          style={[styles.amount, failed && styles.struck]}
        >
          +{formatTokenAmount(entry.amount)} {assetName(entry)}
        </Text>
      ))}
      {outgoing.map((entry) => (
        <Text key={`-${entry.mint ?? "sol"}`} variant="mono-addr" tone={failed ? "muted" : "primary"} style={[styles.amount, failed && styles.struck]}>
          −{formatTokenAmount(entry.amount)} {assetName(entry)}
        </Text>
      ))}
    </View>
  );
}

function Details({ event }: { event: AccountEvent }) {
  const summary = event.summary ?? null;
  const signature = event.id.startsWith("tx:") ? event.id.slice(3) : null;
  const rows: [string, string, "positive" | "secondary"][] = [];
  if (summary) {
    for (const entry of summary.amounts) {
      rows.push([
        entry.amount > 0 ? "In" : "Out",
        `${entry.amount > 0 ? "+" : "−"}${formatTokenAmount(entry.amount)} ${assetName(entry)}${entry.symbol === null ? " (unverified)" : ""}`,
        entry.amount > 0 ? "positive" : "secondary",
      ]);
    }
    if (summary.counterparty) rows.push([summary.kind === "receive" ? "From" : "To", summary.counterparty, "secondary"]);
    if (summary.via) rows.push(["Via", summary.via, "secondary"]);
    if (summary.feeSol !== null) rows.push(["Network fee", `${formatTokenAmount(summary.feeSol)} SOL`, "secondary"]);
  }
  if (event.kind === "transaction" && event.network !== undefined && event.network !== "solana") {
    rows.push(["Network", EVM_CHAINS[event.network].name, "secondary"]);
  }
  rows.push(["Status", statusOf(event).label, "secondary"]);
  rows.push(["Time", event.at === null ? "Not yet in a block" : `${formatTimestamp(event.at)} UTC`, "secondary"]);
  if (signature) rows.push([event.network === undefined || event.network === "solana" ? "Signature" : "Transaction hash", signature, "secondary"]);
  if (event.kind === "transaction" && !summary) {
    rows.push(["Details", "This transaction could not be decoded; the explorer has the full record.", "secondary"]);
  }
  return (
    <View style={styles.details}>
      {rows.map(([label, value, tone]) => (
        <View key={label} style={styles.detailRow}>
          <Text variant="label" tone="muted" style={styles.detailLabel}>
            {label}
          </Text>
          <Text variant={label === "Signature" || label === "Transaction hash" || label === "To" || label === "From" ? "mono-addr" : "label"} tone={tone} selectable style={styles.flex}>
            {value}
          </Text>
        </View>
      ))}
    </View>
  );
}

export function ActivityRow({ event }: { event: AccountEvent }) {
  const [open, setOpen] = useState(false);
  const status = statusOf(event);
  const StatusIcon = status.icon;
  const statusColor = status.tone === "negative" ? color.negative : status.tone === "primary" ? color["text-primary"] : color["text-secondary"];

  return (
    <View style={[styles.row, open && styles.rowOpen]}>
      <View style={styles.rowTop}>
        <Pressable
          onPress={() => setOpen((value) => !value)}
          accessibilityRole="button"
          accessibilityState={{ expanded: open }}
          accessibilityHint="Shows the transaction's details"
          android_ripple={{ color: color["surface-hover"] }}
          style={styles.rowMain}
        >
          <DirectionMark event={event} />
          <View style={styles.flex}>
            <View style={styles.labelLine}>
              <Text variant="body-sm" style={styles.rowLabel}>
                {actionLabel(event)}
              </Text>
              <Amounts event={event} />
            </View>
            <View style={styles.statusLine}>
              <StatusIcon size={12} strokeWidth={2} color={statusColor} />
              <Text variant="label" tone={status.tone}>
                {status.label}
              </Text>
              {event.at !== null && (
                <Text variant="label" tone="muted">
                  · {formatClock(event.at)}
                </Text>
              )}
            </View>
          </View>
          <ChevronDown
            size={16}
            strokeWidth={1.5}
            color={color["text-secondary"]}
            style={{ transform: [{ rotate: open ? "180deg" : "0deg" }] }}
          />
        </Pressable>
        {event.href !== null && (
          <IconButton
            accessibilityLabel={`Open in ${event.network === undefined || event.network === "solana" ? "Solscan" : EVM_CHAINS[event.network].explorer.name}`}
            onPress={() => openExternal(event.href as string)}
          >
            <ExternalLink size={15} strokeWidth={1.5} color={color["text-muted"]} />
          </IconButton>
        )}
      </View>
      {open && <Details event={event} />}
    </View>
  );
}

export function DayHeader({ title }: { title: string }) {
  return (
    <View style={styles.dayHeader}>
      <Text variant="eyebrow" tone="muted" accessibilityRole="header">
        {title}
      </Text>
      <View style={styles.dayRule} />
    </View>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1, minWidth: 0 },
  filters: { gap: 8 },
  filterRow: { flexDirection: "row", gap: 8, flexWrap: "wrap" },
  row: { borderBottomWidth: StyleSheet.hairlineWidth * 2, borderBottomColor: color["border-subtle"] },
  rowOpen: { backgroundColor: color["surface-panel"] },
  rowTop: { flexDirection: "row", alignItems: "flex-start" },
  rowMain: { flex: 1, flexDirection: "row", alignItems: "flex-start", gap: 10, paddingVertical: 10, minHeight: TOUCH_TARGET },
  mark: { width: 30, height: 30, borderRadius: radius.pill, borderWidth: 1, alignItems: "center", justifyContent: "center" },
  labelLine: { flexDirection: "row", flexWrap: "wrap", alignItems: "baseline", columnGap: 8, rowGap: 2 },
  rowLabel: { flexShrink: 1 },
  amounts: { marginLeft: "auto", alignItems: "flex-end", maxWidth: "100%" },
  amount: { textAlign: "right" },
  struck: { textDecorationLine: "line-through" },
  statusLine: { flexDirection: "row", alignItems: "center", gap: 4, marginTop: 2, flexWrap: "wrap" },
  details: {
    marginBottom: 10,
    marginLeft: 40,
    marginRight: 8,
    padding: 10,
    gap: 6,
    borderWidth: 1,
    borderColor: color["border-subtle"],
    borderRadius: radius.control,
    backgroundColor: color["surface-raised"],
  },
  detailRow: { flexDirection: "row", gap: 12 },
  detailLabel: { width: 84 },
  dayHeader: { flexDirection: "row", alignItems: "center", gap: 8, paddingTop: 14, paddingBottom: 4, backgroundColor: color["surface-base"] },
  dayRule: { flex: 1, height: StyleSheet.hairlineWidth * 2, backgroundColor: color["border-subtle"] },
});
