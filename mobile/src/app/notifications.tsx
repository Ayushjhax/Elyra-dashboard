import { useMemo, useState } from "react";
import { Text as NativeText, Pressable, SectionList, StyleSheet, View } from "react-native";
import { router, type Href } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import {
  Activity,
  ArrowRight,
  Bell,
  BellRing,
  CalendarDays,
  ChevronRight,
  CircleAlert,
  CircleCheck,
  Settings,
  SlidersHorizontal,
  TrendingUp,
  Vote,
  type LucideIcon,
} from "lucide-react-native";
import { formatDayGroup, formatRelativeTime } from "@/lib/format";
import { notificationRoute } from "@/lib/notifications/routes";
import type { InboxEntry, NotificationKind } from "@/lib/notifications/types";
import { FlowBar, FlowTitle, IconTile } from "~/components/shell/flow";
import { Button } from "~/components/ui/controls";
import { Skeleton } from "~/components/ui/layout";
import { Text } from "~/components/ui/Text";
import { useInbox } from "~/lib/notifications/stores";
import { useMinute } from "~/lib/useClock";
import { currentAccount, sessionVersion } from "~/lib/session";
import { useAppStore } from "~/lib/store";
import { formatAnswerText } from "~/lib/personalized/format";
import { DISPLAY_SERIF, fontFamily } from "~/theme/fonts";
import { TOUCH_TARGET, color, radius } from "~/theme/tokens";

/* ---------------------------------------------------------------------------
   The inbox — every alert and update, whether or not push reached this
   phone. Grouped by day, newest first, paged as it scrolls.

   A card's destination is untrusted payload data: it goes through
   notificationRoute's allowlist, and anything unsupported falls back to the
   inbox itself — which is why such a card has no chevron and opening it
   only marks it read.

   "All caught up" means nothing is unread, not that there is no history, so
   it sits after the read notifications rather than replacing them.
--------------------------------------------------------------------------- */

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

const INBOX = "/notifications";

export default function NotificationsScreen() {
  const feed = useInbox();
  const now = useMinute();
  const insets = useSafeAreaInsets();
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
      /* A read row needs no write; it still opens. */
      if (!entry || !entry.readAt) await feed.markRead(entry ? [entry.id] : undefined);
      if (entry && currentAccount() === account && sessionVersion() === ticket) {
        const route = notificationRoute(entry.data.route);
        if (route === INBOX) return;
        if (entry.data.route === "/agent") useAppStore.getState().setAgentTab("actions");
        if (entry.data.route === "/personalized") useAppStore.getState().setAgentTab("capital-intelligence");
        router.push(route as Href);
      }
    } catch {
      /* The feed carries the failure and keeps the row unread. */
    } finally {
      setBusy(null);
    }
  };

  const unreadText = `${feed.unread > 99 ? "99+" : feed.unread} unread`;
  const header = (
    <View style={styles.header}>
      <FlowTitle title="Notifications" subtitle="Your updates, in one place." />
      <View style={styles.toolbar}>
        <View style={styles.pill} accessible accessibilityLabel={unreadText}>
          <Text variant="body" tone={feed.unread > 0 ? "primary" : "secondary"}>
            {unreadText}
          </Text>
        </View>
        <View style={styles.flex} />
        <Pressable
          onPress={() => router.push("/notification-settings")}
          accessibilityRole="button"
          accessibilityLabel="Notification settings"
          style={({ pressed }) => [styles.tool, pressed && { opacity: 0.7 }]}
        >
          <Settings size={22} strokeWidth={1.5} color={color["text-primary"]} />
          <Text variant="body" style={styles.toolLabel}>
            Settings
          </Text>
        </Pressable>
        <View style={styles.toolRule} />
        <Pressable
          onPress={() => void read()}
          disabled={feed.unread === 0 || busy !== null}
          accessibilityRole="button"
          accessibilityState={{ disabled: feed.unread === 0 || busy !== null, busy: busy === "all" }}
          style={({ pressed }) => [styles.tool, pressed && { opacity: 0.7 }]}
        >
          <Text variant="body" tone={feed.unread === 0 || busy !== null ? "muted" : "accent"} style={styles.toolLabel}>
            {busy === "all" ? "Marking…" : "Mark all read"}
          </Text>
        </Pressable>
      </View>
      {feed.error && (
        <View style={styles.error}>
          <Text tone="negative" accessibilityLiveRegion="polite">
            {feed.error}
          </Text>
          <Button label="Try again" onPress={feed.refetch} />
        </View>
      )}
    </View>
  );

  const preferences = (
    <Pressable
      onPress={() => router.push("/notification-settings")}
      accessibilityRole="button"
      accessibilityLabel="Choose what reaches you. Notification settings"
      style={({ pressed }) => [styles.prefs, pressed && styles.cardPressed]}
    >
      <IconTile icon={SlidersHorizontal} size={56} />
      <View style={styles.flex}>
        <Text variant="body" style={styles.cardTitle}>
          Choose what reaches you
        </Text>
        <Text variant="body" tone="muted">
          Manage your notification preferences.
        </Text>
        <View style={styles.inline}>
          <Text variant="body" tone="accent" style={styles.toolLabel}>
            Notification settings
          </Text>
          <ArrowRight size={18} strokeWidth={1.5} color={color.accent} />
        </View>
      </View>
    </Pressable>
  );

  const hasEntries = feed.entries.length > 0;
  const footer = feed.loadingMore ? (
    <Text tone="muted" style={styles.more}>
      Loading older notifications…
    </Text>
  ) : hasEntries ? (
    <View style={styles.footer}>
      {feed.unread === 0 && (
        <View style={styles.caughtUp} accessible accessibilityLabel="You're all caught up. New updates will appear here.">
          <CircleCheck size={28} strokeWidth={1.5} color={color["text-secondary"]} />
          <NativeText maxFontSizeMultiplier={1.25} style={styles.caughtTitle}>
            You&apos;re all caught up
          </NativeText>
          <Text variant="body" tone="muted">
            New updates will appear here.
          </Text>
        </View>
      )}
      {preferences}
      <Text variant="body-sm" tone="muted">
        Your inbox works even when push is off.
      </Text>
    </View>
  ) : undefined;

  return (
    <View style={styles.screen}>
      <FlowBar closeLabel="Close notifications" />
      {feed.loading ? (
        <View style={styles.content}>
          {header}
          <View style={styles.error} accessibilityLabel="Loading notifications">
            <Skeleton height={96} rounded={radius.sheet} />
            <Skeleton height={96} rounded={radius.sheet} />
          </View>
        </View>
      ) : (
        <SectionList
          sections={sections}
          keyExtractor={(entry) => entry.id}
          contentContainerStyle={[styles.content, { paddingBottom: insets.bottom + 32 }]}
          refreshing={feed.refreshing}
          onRefresh={feed.refetch}
          onEndReached={() => void feed.more()}
          onEndReachedThreshold={0.4}
          stickySectionHeadersEnabled={false}
          ListHeaderComponent={header}
          ListFooterComponent={footer}
          ListEmptyComponent={
            !feed.error ? (
              <View style={styles.footer}>
                <View style={styles.caughtUp}>
                  <Bell size={28} strokeWidth={1.5} color={color["text-secondary"]} />
                  <NativeText maxFontSizeMultiplier={1.25} style={styles.caughtTitle}>
                    No notifications yet
                  </NativeText>
                  <Text variant="body" tone="muted" style={styles.center}>
                    Alerts and updates appear here, even when push notifications are off.
                  </Text>
                </View>
                {preferences}
              </View>
            ) : undefined
          }
          renderSectionHeader={({ section }) => (
            <Text variant="eyebrow" tone="secondary" style={styles.day}>
              {section.title}
            </Text>
          )}
          renderItem={({ item }) => {
            const Icon = ICON[item.kind] ?? Bell;
            const unread = !item.readAt;
            const goes = notificationRoute(item.data.route) !== INBOX;
            return (
              <Pressable
                accessibilityRole="button"
                accessibilityLabel={`${formatAnswerText(item.title)}, ${unread ? "unread" : "read"}, ${formatRelativeTime(item.createdAt, now)}`}
                accessibilityHint={goes ? "Opens it" : unread ? "Marks it read" : undefined}
                accessibilityState={{ disabled: busy !== null }}
                disabled={busy !== null}
                onPress={() => void read(item)}
                style={({ pressed }) => [styles.card, unread && styles.unread, pressed && styles.cardPressed]}
              >
                <IconTile icon={Icon} tint={item.kind === "liquidation" ? color.negative : unread ? color.accent : color["text-secondary"]} />
                <View style={styles.flex}>
                  <View style={styles.inline}>
                    <Text variant="body" style={[styles.cardTitle, styles.flex]}>
                      {formatAnswerText(item.title)}
                    </Text>
                    {unread && <View style={styles.dot} accessible={false} />}
                  </View>
                  <Text variant="body" tone="muted">
                    {formatAnswerText(item.body)}
                  </Text>
                  <Text variant="body-sm" tone="muted" style={styles.time}>
                    {formatRelativeTime(item.createdAt, now)}
                  </Text>
                </View>
                {goes && <ChevronRight size={22} strokeWidth={1.5} color={color["text-secondary"]} />}
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
  content: { paddingHorizontal: 20, paddingTop: 4 },
  header: { gap: 16, paddingBottom: 4 },
  flex: { flex: 1, minWidth: 0, gap: 2 },
  center: { textAlign: "center" },
  inline: { flexDirection: "row", alignItems: "center", gap: 8 },
  toolbar: { flexDirection: "row", alignItems: "center", gap: 4, flexWrap: "wrap" },
  pill: {
    minHeight: 40,
    justifyContent: "center",
    paddingHorizontal: 16,
    borderRadius: radius.pill,
    borderWidth: 1,
    borderColor: color["border-strong"],
  },
  tool: { minHeight: TOUCH_TARGET, flexDirection: "row", alignItems: "center", gap: 8, paddingHorizontal: 10 },
  toolLabel: { fontFamily: fontFamily("sans", 500), fontSize: 16, lineHeight: 22 },
  toolRule: { width: 1, height: 28, backgroundColor: color["border-subtle"] },
  error: { gap: 12, paddingTop: 8 },
  day: { paddingTop: 20, paddingBottom: 10 },
  card: {
    flexDirection: "row",
    alignItems: "center",
    gap: 14,
    padding: 16,
    marginBottom: 10,
    borderRadius: radius.sheet,
    borderWidth: 1,
    borderColor: color["border-subtle"],
    backgroundColor: color["surface-panel"],
  },
  unread: { borderColor: color["border-accent"] },
  cardPressed: { backgroundColor: color["surface-hover"] },
  cardTitle: { fontFamily: fontFamily("sans", 500), fontSize: 17, lineHeight: 23 },
  time: { marginTop: 4 },
  dot: { width: 8, height: 8, borderRadius: radius.pill, backgroundColor: color.accent },
  more: { paddingVertical: 16, textAlign: "center" },
  footer: { gap: 16, paddingTop: 12 },
  caughtUp: { alignItems: "center", gap: 6, paddingVertical: 20 },
  caughtTitle: { fontFamily: DISPLAY_SERIF, fontSize: 26, lineHeight: 32, color: color["text-primary"], textAlign: "center" },
  prefs: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 16,
    padding: 18,
    borderRadius: radius.sheet,
    borderWidth: 1,
    borderColor: color["border-subtle"],
    backgroundColor: color["surface-panel"],
  },
});
