import type { ReactNode } from "react";
import { StyleSheet, View, type StyleProp, type ViewStyle } from "react-native";
import { AlertTriangle, CircleAlert } from "lucide-react-native";
import { Text } from "~/components/ui/Text";
import { fontFamily } from "~/theme/fonts";
import { color, radius } from "~/theme/tokens";

/* ---------------------------------------------------------------------------
   The redesigned data screens' surfaces — the dashboard and research
   reports: a flat card on a hairline, its spaced uppercase heading, a state
   told by a dot AND its word, and a boxed notice with a title.

   Presentational only; every value is handed in.
--------------------------------------------------------------------------- */

export function SurfaceCard({ children, style, label }: { children: ReactNode; style?: StyleProp<ViewStyle>; label?: string }) {
  return (
    <View accessibilityLabel={label} style={[styles.card, style]}>
      {children}
    </View>
  );
}

/** A card's spaced uppercase heading, with something on the right (a count, a state, a link). */
export function CardEyebrow({ children, right }: { children: string; right?: ReactNode }) {
  return (
    <View style={styles.eyebrowRow}>
      <Text variant="eyebrow" accessibilityRole="header" style={styles.eyebrow}>
        {children}
      </Text>
      {right}
    </View>
  );
}

export type StatusTone = "positive" | "caution" | "negative" | "muted";

const DOT: Record<StatusTone, string> = {
  positive: color.positive,
  caution: color.caution,
  negative: color.negative,
  muted: color["text-muted"],
};

/** A state as a dot and its word, so it is never told by colour alone. */
export function StatusText({ tone, label, size = "md" }: { tone: StatusTone; label: string; size?: "md" | "sm" }) {
  return (
    <View style={styles.status}>
      <View style={[styles.dot, size === "sm" && styles.dotSmall, { backgroundColor: DOT[tone] }]} />
      <Text variant="body" tone={tone === "negative" ? "negative" : tone === "caution" ? "caution" : "secondary"} style={size === "sm" ? styles.statusSmall : styles.statusText}>
        {label}
      </Text>
    </View>
  );
}

/** A hairline between parts of a card. */
export function Rule({ style }: { style?: StyleProp<ViewStyle> }) {
  return <View style={[styles.rule, style]} />;
}

/** A boxed notice with a title — a report's verification warning, say. Read out as it appears. */
export function CalloutNotice({ tone = "caution", title, body }: { tone?: "caution" | "negative"; title?: string; body: string }) {
  const Icon = tone === "caution" ? AlertTriangle : CircleAlert;
  const ink = tone === "caution" ? color.caution : color.negative;
  return (
    <View
      accessible
      accessibilityRole={tone === "negative" ? "alert" : undefined}
      accessibilityLiveRegion="polite"
      accessibilityLabel={title === undefined ? body : `${title}. ${body}`}
      style={[styles.callout, { borderColor: ink, backgroundColor: tone === "caution" ? color["caution-bg"] : color["negative-bg"] }]}
    >
      <Icon size={26} strokeWidth={1.75} color={ink} />
      <View style={styles.flex}>
        {title !== undefined && (
          <Text variant="body" tone={tone} style={styles.calloutTitle}>
            {title}
          </Text>
        )}
        <Text variant="body" tone={tone} style={styles.calloutBody}>
          {body}
        </Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1, minWidth: 0, gap: 2 },
  card: {
    gap: 16,
    padding: 20,
    borderRadius: radius.sheet,
    borderWidth: 1,
    borderColor: color["border-subtle"],
    backgroundColor: color["surface-panel"],
  },
  eyebrowRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 12, minHeight: 32 },
  eyebrow: { fontSize: 13, lineHeight: 17, letterSpacing: 3, color: color["text-primary"], flexShrink: 1 },
  status: { flexDirection: "row", alignItems: "center", gap: 8 },
  dot: { width: 10, height: 10, borderRadius: 5 },
  dotSmall: { width: 8, height: 8, borderRadius: 4 },
  statusText: { fontSize: 16, lineHeight: 22 },
  statusSmall: { fontSize: 14, lineHeight: 19 },
  rule: { height: StyleSheet.hairlineWidth * 2, backgroundColor: color["border-subtle"] },
  callout: { flexDirection: "row", alignItems: "flex-start", gap: 14, padding: 16, borderRadius: radius.panel, borderWidth: 1 },
  calloutTitle: { fontFamily: fontFamily("sans", 500), fontSize: 16, lineHeight: 22 },
  calloutBody: { fontSize: 14, lineHeight: 20 },
});
