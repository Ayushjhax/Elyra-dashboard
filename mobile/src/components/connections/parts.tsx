import type { ReactNode } from "react";
import { StyleSheet, View } from "react-native";
import { STATUS, venueRead, type ConnectionStatus, type StatusTone } from "@/lib/connections/state";
import { Text, type TextTone } from "~/components/ui/Text";
import type { PortfolioFeed } from "~/lib/stores/portfolio";
import { color, radius } from "~/theme/tokens";

/* ---------------------------------------------------------------------------
   What every connection card shares — the website's connections
   primitives, for a phone.

   One status vocabulary (lib/connections/state.ts): Not connected,
   Checking, Connecting, Connected, Needs attention. The words carry the
   meaning and the colour only echoes them, and nothing is "Connected" until
   the venue has actually answered in the latest portfolio reading — a
   stored key or a saved address is linked, not working.
--------------------------------------------------------------------------- */

const DOT: Record<StatusTone, string> = {
  muted: color["text-muted"],
  progress: color["text-secondary"],
  caution: color.caution,
  positive: color.positive,
  negative: color.negative,
};

const TONE: Record<StatusTone, TextTone> = {
  muted: "muted",
  progress: "secondary",
  caution: "caution",
  positive: "positive",
  negative: "negative",
};

export function StatusBadge({ status, label }: { status: ConnectionStatus; label?: string }) {
  const { tone, label: fallback } = STATUS[status];
  return (
    <View style={styles.badge} accessibilityLabel={`Status: ${label ?? fallback}`}>
      <View style={[styles.dot, { backgroundColor: DOT[tone] }]} />
      <Text variant="label" tone={TONE[tone]}>
        {label ?? fallback}
      </Text>
    </View>
  );
}

export function VenueCard({ mark, title, subtitle, status, children }: { mark: ReactNode; title: string; subtitle: string; status: ReactNode; children: ReactNode }) {
  return (
    <View style={styles.card}>
      <View style={styles.head}>
        {mark}
        <View style={styles.flex}>
          <Text variant="h2" accessibilityRole="header">
            {title}
          </Text>
          <Text variant="label" tone="muted">
            {subtitle}
          </Text>
        </View>
        {status}
      </View>
      {children}
    </View>
  );
}

/** Whether a venue answered in the latest portfolio reading, as a badge. */
export function venueStatus(feed: PortfolioFeed, venue: string): { status: ConnectionStatus; label: string; reason: string | null } {
  const read = venueRead(feed, venue);
  if (read.status === "synced") return { status: "connected", label: "Connected", reason: null };
  if (read.status === "checking") return { status: "checking", label: "Checking", reason: null };
  return { status: "attention", label: "Needs attention", reason: read.reason };
}

export const styles = StyleSheet.create({
  flex: { flex: 1, minWidth: 0 },
  card: {
    gap: 12,
    padding: 14,
    borderRadius: radius.panel,
    borderWidth: 1,
    borderColor: color["border-subtle"],
    backgroundColor: color["surface-panel"],
  },
  head: { flexDirection: "row", alignItems: "center", gap: 12 },
  badge: { flexDirection: "row", alignItems: "center", gap: 6 },
  dot: { width: 8, height: 8, borderRadius: 4 },
  address: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    paddingLeft: 12,
    borderRadius: radius.card,
    borderWidth: 1,
    borderColor: color["border-subtle"],
    backgroundColor: color["surface-base"],
  },
  tile: { width: 40, height: 40, borderRadius: radius.control, alignItems: "center", justifyContent: "center", backgroundColor: color["surface-raised"] },
});
