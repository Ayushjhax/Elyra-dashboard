import { useMemo, useState } from "react";
import { RefreshControl, SectionList, StyleSheet, View } from "react-native";
import { DEFAULT_FILTERS, type ActivityFilters } from "@/lib/activity/filter";
import { formatRelativeTime } from "@/lib/format";
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
import { SheetHeader } from "~/components/wallet/parts";
import { useWalletDashboard } from "~/lib/stores/wallet";
import { useMinute } from "~/lib/useClock";
import { color, radius } from "~/theme/tokens";

/* ---------------------------------------------------------------------------
   Wallet activity — the website's Activity widget: the Solana wallet's
   transactions and the actions awaiting review, filterable, in day groups.

   One virtualised list: the filters are its header, and each day is a
   section, so a long history scrolls without rendering it all.
--------------------------------------------------------------------------- */

export default function ActivityScreen() {
  const now = useMinute();
  const { feed, events } = useActivityEvents();
  const wallet = useWalletDashboard();
  const [filters, setFilters] = useState<ActivityFilters>(DEFAULT_FILTERS);

  const shown = useMemo(() => filtered(events, filters, now), [events, filters, now]);
  const sections = useMemo(() => groupByDay(shown, now), [shown, now]);
  const isFiltered = filters.direction !== "all" || filters.range !== "all" || filters.network !== "all";

  const header = (
    <View style={styles.header}>
      <View style={styles.activityHead}>
        <Text variant="label" tone="muted" style={styles.flex}>
          The wallet&apos;s transactions and actions awaiting review.
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
    <View style={styles.screen}>
    <SheetHeader title="Wallet activity" back closeLabel="Back" />
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
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: color["surface-base"] },
  content: { paddingHorizontal: 16, paddingBottom: 32 },
  flex: { flex: 1 },
  header: { gap: 16, paddingTop: 16, paddingBottom: 4 },
  activityHead: { flexDirection: "row", alignItems: "baseline", gap: 8, marginTop: 4 },
  skeletons: { paddingVertical: 8 },
  skeletonRow: { flexDirection: "row", alignItems: "center", gap: 10, paddingVertical: 10 },
  empty: { alignItems: "center", gap: 8, paddingVertical: 24 },
});
