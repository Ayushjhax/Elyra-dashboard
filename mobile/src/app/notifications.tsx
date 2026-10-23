import { useMemo, useState } from "react";
import { Pressable, SectionList, StyleSheet, View } from "react-native";
import { router, type Href } from "expo-router";
import {
  Activity,
  Bell,
  BellRing,
  CalendarDays,
  CircleAlert,
  TrendingUp,
  Vote,
  type LucideIcon,
} from "lucide-react-native";
import { formatDayGroup, formatRelativeTime } from "@/lib/format";
import { notificationRoute } from "@/lib/notifications/routes";
import type { InboxEntry, NotificationKind } from "@/lib/notifications/types";
import { Button } from "~/components/ui/controls";
import { EmptyState, Skeleton } from "~/components/ui/layout";
import { Text } from "~/components/ui/Text";
import { SheetHeader } from "~/components/wallet/parts";
import { useInbox } from "~/lib/notifications/stores";
import { useMinute } from "~/lib/useClock";
import { currentAccount, sessionVersion } from "~/lib/session";
import { useAppStore } from "~/lib/store";
import { formatAnswerText } from "~/lib/personalized/format";
import { color, radius } from "~/theme/tokens";
const ICON: Record<NotificationKind, LucideIcon> = {
  price_alert: BellRing,
  liquidation: CircleAlert,
  large_move: TrendingUp,
  prediction_move: Vote,
  prediction_order: Activity,
  prediction_resolution: Vote,
  prediction_signal: Vote,
  daily_summary: CalendarDays,
  system: Bell,
};
export default function NotificationsScreen() {
  const feed = useInbox();
  const now = useMinute();
  const [busy, setBusy] = useState<string | null>(null);
  const sections = useMemo(() => {
    const groups: { title: string; data: InboxEntry[] }[] = [];
    for (const entry of feed.entries) {
      const title = formatDayGroup(entry.createdAt, now);
      const last = groups.at(-1);
      if (last?.title === title) last.data.push(entry);
      else groups.push({ title, data: [entry] });
    }
    return groups;
  }, [feed.entries, now]);
  const read = async (entry?: InboxEntry) => {
    if (busy) return;
    const account = currentAccount();
    const ticket = sessionVersion();
    setBusy(entry?.id ?? "all");
    try {
      await feed.markRead(entry ? [entry.id] : undefined);
      if (
        entry &&
        currentAccount() === account &&
        sessionVersion() === ticket
      ) {
        if (entry.data.route === "/agent")
          useAppStore.getState().setAgentTab("actions");
        if (entry.data.route === "/personalized")
          useAppStore.getState().setAgentTab("capital-intelligence");
        router.push(notificationRoute(entry.data.route) as Href);
      }
    } catch {
      /* The feed carries the failure and keeps the row unread. */
    } finally {
      setBusy(null);
    }
  };
  return (
    <View style={styles.screen}>
      <SheetHeader
        title="Notifications"
        icon={Bell}
        closeLabel="Close notifications"
      />
      <View style={styles.toolbar}>
        <Text variant="label" tone="muted" style={styles.flex}>
          {feed.unread > 99 ? "99+" : feed.unread} unread
        </Text>
        <Button
          label="Settings"
          variant="ghost"
          onPress={() => router.push("/notification-settings")}
        />
        <Button
          label="Mark all read"
          variant="ghost"
          disabled={feed.unread === 0 || busy !== null}
          loading={busy === "all"}
          onPress={() => void read()}
        />
      </View>
      {feed.error && (
        <View style={styles.error}>
          <Text tone="negative">{feed.error}</Text>
          <Button label="Try again" onPress={feed.refetch} />
        </View>
      )}
      {feed.loading ? (
        <View style={styles.error}>
          <Skeleton height={80} />
          <Skeleton height={80} />
        </View>
      ) : (
        <SectionList
          sections={sections}
          keyExtractor={(entry) => entry.id}
          contentContainerStyle={styles.list}
          refreshing={feed.refreshing}
          onRefresh={feed.refetch}
          onEndReached={() => void feed.more()}
          onEndReachedThreshold={0.4}
          stickySectionHeadersEnabled={false}
          ListEmptyComponent={
            !feed.error ? (
              <EmptyState
                title="You're all caught up"
                body="Alerts and updates appear here, even when push notifications are off."
              />
            ) : undefined
          }
          ListFooterComponent={
            feed.loadingMore ? (
              <Text tone="muted">Loading older notifications…</Text>
            ) : undefined
          }
          renderSectionHeader={({ section }) => (
            <Text variant="eyebrow" tone="muted" style={styles.day}>
              {section.title}
            </Text>
          )}
          renderItem={({ item }) => {
            const Icon = ICON[item.kind] ?? Bell;
            return (
              <Pressable
                accessibilityRole="button"
                accessibilityLabel={`${item.title}${item.readAt ? ", read" : ", unread"}`}
                accessibilityState={{ disabled: busy !== null }}
                disabled={busy !== null}
                onPress={() => void read(item)}
                style={[styles.row, !item.readAt && styles.unread]}
              >
                <Icon
                  size={20}
                  strokeWidth={1.5}
                  color={
                    item.kind === "liquidation" ? color.negative : color.accent
                  }
                />
                <View style={styles.flex}>
                  <Text variant="h2">{formatAnswerText(item.title)}</Text>
                  <Text variant="body-sm" tone="secondary">
                    {formatAnswerText(item.body)}
                  </Text>
                  <Text variant="label" tone="muted">
                    {formatRelativeTime(item.createdAt, now)}
                  </Text>
                </View>
                {!item.readAt && <View style={styles.dot} />}
              </Pressable>
            );
          }}
        />
      )}
    </View>
  );
}
const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: color["surface-base"] },
  toolbar: {
    flexDirection: "row",
    flexWrap: "wrap",
    alignItems: "center",
    paddingHorizontal: 16,
    gap: 8,
  },
  flex: { flex: 1, gap: 4 },
  list: { padding: 16, paddingBottom: 48 },
  day: { paddingVertical: 12 },
  row: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 12,
    minHeight: 48,
    padding: 16,
    marginBottom: 8,
    borderRadius: radius.card,
    borderWidth: 1,
    borderColor: color["border-subtle"],
    backgroundColor: color["surface-panel"],
  },
  unread: { borderLeftWidth: 2, borderLeftColor: color["agent-accent"] },
  dot: {
    width: 8,
    height: 8,
    borderRadius: radius.pill,
    backgroundColor: color.accent,
    marginTop: 8,
  },
  error: { padding: 16, gap: 12 },
});
