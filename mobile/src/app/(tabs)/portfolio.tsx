import { useMemo, useState } from "react";
import { RefreshControl, SectionList, StyleSheet, View } from "react-native";
import { router } from "expo-router";
import { ArrowLeftRight, ArrowUpRight, QrCode, Send, type LucideIcon } from "lucide-react-native";
import { DEFAULT_FILTERS, type ActivityFilters } from "@/lib/activity/filter";
import { formatRelativeTime } from "@/lib/format";
import { ReviewCards } from "~/components/actions/ReviewCards";
import { Button } from "~/components/ui/controls";
import { Skeleton } from "~/components/ui/layout";
import { Text } from "~/components/ui/Text";
import {
  ActivityFilterBar,
  ActivityRow,
  DayHeader,
  emptyMessage,
  filtered,
  groupByDay,
  useActivityEvents,
} from "~/components/wallet/Activity";
import { InfoTip } from "~/components/ui/InfoTip";
import { useWalletDashboard } from "~/lib/stores/wallet";
import { useMinute } from "~/lib/useClock";
import { color, radius, TOUCH_TARGET } from "~/theme/tokens";

/* ---------------------------------------------------------------------------
   Portfolio — for now, the wallet's side of it: the four capital actions
   (the website's AssetActionBar), actions awaiting review, and the wallet's
   activity. Venue positions join this screen when the portfolio store does.

   One virtualised list: the actions and the filters are its header, and
   each day is a section, so a long history scrolls without rendering it all.
--------------------------------------------------------------------------- */

function CapitalAction({
  icon: Icon,
  label,
  primary = false,
  reason,
  onPress,
}: {
  icon: LucideIcon;
  label: string;
  primary?: boolean;
  /** Why it cannot be used right now. Null when it can. */
  reason: string | null;
  onPress: () => void;
}) {
  return (
    <View style={styles.action}>
      <Button
        label={label}
        variant={primary ? "accent" : "quiet"}
        disabled={reason !== null}
        accessibilityLabel={reason === null ? label : `${label} — ${reason}`}
        icon={<Icon size={16} strokeWidth={1.5} color={reason !== null ? color["text-muted"] : primary ? color["text-on-accent"] : color["text-primary"]} />}
        onPress={onPress}
      />
    </View>
  );
}

function ActionBar() {
  const wallet = useWalletDashboard();
  /* A wallet with nothing counted in it has nothing to move yet. */
  const funded = (wallet.snapshot?.sol ?? 0) > 0 || (wallet.snapshot?.tokenCount ?? 0) > 0;
  const signReason =
    wallet.address === null
      ? "Link a Solana wallet first."
      : wallet.snapshot === null
        ? wallet.isLoading
          ? "Reading the wallet…"
          : "The wallet couldn't be read."
        : !funded
          ? "The wallet holds nothing to move yet — receive first."
          : null;

  return (
    <View style={styles.actionsBlock}>
      <View style={styles.actions}>
        <CapitalAction icon={QrCode} label="Receive" primary reason={wallet.address === null ? "Link a Solana wallet to receive into." : null} onPress={() => router.push("/receive")} />
        <CapitalAction icon={ArrowLeftRight} label="Swap" reason={signReason} onPress={() => router.push("/swap")} />
        <CapitalAction icon={Send} label="Transfer" reason={signReason} onPress={() => router.push("/transfer")} />
        <CapitalAction
          icon={ArrowUpRight}
          label="Withdraw"
          reason={signReason}
          onPress={() => router.push({ pathname: "/transfer", params: { intent: "withdraw" } })}
        />
      </View>
      {signReason !== null && wallet.address !== null && (
        <View style={styles.reason}>
          <Text variant="label" tone="muted" style={styles.flex}>
            Swap, Transfer and Withdraw: {signReason}
          </Text>
          <InfoTip text="Each of these signs in your wallet. Nothing is sent without your signature." />
        </View>
      )}
    </View>
  );
}

export default function PortfolioScreen() {
  const now = useMinute();
  const { feed, events } = useActivityEvents();
  const wallet = useWalletDashboard();
  const [filters, setFilters] = useState<ActivityFilters>(DEFAULT_FILTERS);

  const shown = useMemo(() => filtered(events, filters, now), [events, filters, now]);
  const sections = useMemo(() => groupByDay(shown, now), [shown, now]);
  const isFiltered = filters.direction !== "all" || filters.range !== "all" || filters.network !== "all";

  const header = (
    <View style={styles.header}>
      <ActionBar />
      <ReviewCards />
      <View style={styles.activityHead}>
        <Text variant="h2" accessibilityRole="header" style={styles.flex}>
          Activity
        </Text>
        <Text variant="label" tone="muted" accessibilityLiveRegion="polite">
          {feed.refreshing
            ? "Updating…"
            : feed.fetchedAt !== null
              ? `Updated ${formatRelativeTime(new Date(feed.fetchedAt).toISOString(), Math.max(now, feed.fetchedAt))}`
              : feed.error !== null
                ? "Not updated"
                : ""}
        </Text>
      </View>
      <ActivityFilterBar filters={filters} onChange={setFilters} />
    </View>
  );

  let empty: React.ReactNode = null;
  if (feed.loading) {
    empty = (
      <View accessibilityLabel="Loading activity" style={styles.skeletons}>
        {[0, 1, 2, 3].map((row) => (
          <View key={row} style={styles.skeletonRow}>
            <Skeleton width={30} height={30} rounded={radius.pill} />
            <View style={styles.flex}>
              <Skeleton width={110} />
            </View>
            <Skeleton width={70} />
          </View>
        ))}
      </View>
    );
  } else if (feed.error !== null && events.length === 0) {
    empty = (
      <View accessibilityRole="alert" style={styles.empty}>
        <Text variant="body-sm" tone="secondary">
          Activity could not be loaded.
        </Text>
        <Text variant="label" tone="muted">
          {feed.error}
        </Text>
        <Button label={feed.refreshing ? "Retrying…" : "Retry"} size="sm" disabled={feed.refreshing} onPress={feed.refetch} />
      </View>
    );
  } else if (shown.length === 0) {
    empty = (
      <View style={styles.empty}>
        <Text variant="body-sm" tone="secondary">
          {events.length === 0 ? "No activity yet. Transfers and swaps from this wallet land here." : emptyMessage(filters)}
        </Text>
        {isFiltered && events.length > 0 && <Button label="Clear filters" size="sm" onPress={() => setFilters(DEFAULT_FILTERS)} />}
      </View>
    );
  }

  return (
    <SectionList
      style={styles.screen}
      contentContainerStyle={styles.content}
      sections={sections}
      keyExtractor={(event) => event.id}
      renderItem={({ item }) => <ActivityRow event={item} />}
      renderSectionHeader={({ section }) => <DayHeader title={section.title} />}
      ListHeaderComponent={header}
      ListEmptyComponent={empty === null ? undefined : <>{empty}</>}
      stickySectionHeadersEnabled
      initialNumToRender={12}
      refreshControl={
        <RefreshControl
          refreshing={false}
          onRefresh={() => {
            feed.refetch();
            wallet.refetch();
          }}
          tintColor={color.accent}
          colors={[color.accent]}
          progressBackgroundColor={color["surface-raised"]}
        />
      }
    />
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: color["surface-base"] },
  content: { paddingHorizontal: 16, paddingBottom: 32 },
  flex: { flex: 1 },
  header: { gap: 16, paddingTop: 16, paddingBottom: 4 },
  actionsBlock: { gap: 8 },
  actions: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  action: { flexGrow: 1, flexBasis: "45%", minHeight: TOUCH_TARGET },
  reason: { flexDirection: "row", alignItems: "center", gap: 4 },
  activityHead: { flexDirection: "row", alignItems: "baseline", gap: 8, marginTop: 4 },
  skeletons: { paddingVertical: 8 },
  skeletonRow: { flexDirection: "row", alignItems: "center", gap: 10, paddingVertical: 10 },
  empty: { alignItems: "center", gap: 8, paddingVertical: 24 },
});
