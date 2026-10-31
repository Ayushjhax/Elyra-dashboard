import { useState, type ReactNode } from "react";
import { Pressable, StyleSheet, TextInput, View, useWindowDimensions, type TextInputProps } from "react-native";
import { Eye, EyeOff, type LucideIcon } from "lucide-react-native";
import { STATUS, venueRead, type ConnectionStatus, type StatusTone } from "@/lib/connections/state";
import { Text, type TextTone } from "~/components/ui/Text";
import type { PortfolioFeed } from "~/lib/stores/portfolio";
import { fontFamily } from "~/theme/fonts";
import { color, radius, TOUCH_TARGET } from "~/theme/tokens";

/* ---------------------------------------------------------------------------
   What every connection card shares — the website's connections
   primitives, for a phone.

   One status vocabulary (lib/connections/state.ts): Not connected,
   Checking, Connecting, Connected, Needs attention. The words carry the
   meaning and the colour only echoes them, and nothing is "Connected" until
   the venue has actually answered in the latest portfolio reading — a
   stored key or a saved address is linked, not working.

   The fields here are for addresses and keys: never autocorrected,
   autocapitalised or offered to autofill. A secret is masked, and showing
   it is a deliberate press that says what it does.
--------------------------------------------------------------------------- */

const DOT: Record<StatusTone, string> = {
  muted: color["text-muted"],
  progress: color["text-secondary"],
  caution: color.caution,
  positive: color.positive,
  negative: color.negative,
};

const TONE: Record<StatusTone, TextTone> = {
  muted: "secondary",
  progress: "secondary",
  caution: "caution",
  positive: "positive",
  negative: "negative",
};

/** A connection's state as a pill: a dot and the word, so it is not told by colour alone. */
export function StatusBadge({ status, label }: { status: ConnectionStatus; label?: string }) {
  const { tone, label: fallback } = STATUS[status];
  return (
    <View style={styles.badge} accessible accessibilityLabel={`Status: ${label ?? fallback}`}>
      <View style={[styles.dot, { backgroundColor: DOT[tone] }]} />
      <Text variant="body-sm" tone={TONE[tone]} numberOfLines={1} maxFontSizeMultiplier={1.3} style={styles.badgeText}>
        {label ?? fallback}
      </Text>
    </View>
  );
}

/** A venue without a logo in the project: a line icon on a raised round tile. */
export function VenueTile({ icon: Icon, size = 56 }: { icon: LucideIcon; size?: number }) {
  return (
    <View style={[styles.tile, { width: size, height: size }]}>
      <Icon size={Math.round(size * 0.46)} strokeWidth={1.5} color={color["text-primary"]} />
    </View>
  );
}

/** A venue: its mark, name and what it reads, its state, then whatever the card holds. */
export function VenueCard({ mark, title, subtitle, status, children }: { mark: ReactNode; title: string; subtitle: string; status: ReactNode; children: ReactNode }) {
  /* Beside the name there is room for the status only on a wider phone (or
     at a normal font size); otherwise it sits under the subtitle, so the
     venue's name is never broken. */
  const { width, fontScale } = useWindowDimensions();
  const beside = width / Math.max(1, fontScale) >= 400;
  return (
    <View style={styles.card}>
      <View style={styles.head}>
        {mark}
        <View style={[styles.flex, styles.words]}>
          <Text variant="body" accessibilityRole="header" style={styles.title}>
            {title}
          </Text>
          <Text variant="body" tone="secondary" style={styles.subtitle}>
            {subtitle}
          </Text>
          {!beside && <View style={styles.statusBelow}>{status}</View>}
        </View>
        {beside && <View style={styles.status}>{status}</View>}
      </View>
      {children}
    </View>
  );
}

/** A labelled field for an address or a key, with a hint or an error under it. */
export function LabeledInput({
  label,
  hint,
  error,
  secret = false,
  ...props
}: { label: string; hint?: string; error?: string | null; secret?: boolean } & Omit<TextInputProps, "secureTextEntry" | "style">) {
  const [shown, setShown] = useState(false);
  return (
    <View style={styles.field}>
      <Text variant="body" style={styles.label}>
        {label}
      </Text>
      <View style={[styles.input, error ? styles.inputError : null]}>
        <TextInput
          {...props}
          accessibilityLabel={label}
          accessibilityHint={error ?? hint}
          secureTextEntry={secret && !shown}
          autoCapitalize="none"
          autoCorrect={false}
          autoComplete="off"
          importantForAutofill="no"
          textContentType="none"
          spellCheck={false}
          placeholderTextColor={color["text-muted"]}
          selectionColor={color.accent}
          style={styles.inputText}
        />
        {secret && (
          <Pressable
            onPress={() => setShown((value) => !value)}
            accessibilityRole="button"
            accessibilityLabel={shown ? `Hide the ${label.toLowerCase()}` : `Show the ${label.toLowerCase()}`}
            style={styles.reveal}
          >
            {shown ? (
              <Eye size={22} strokeWidth={1.5} color={color["text-primary"]} />
            ) : (
              <EyeOff size={22} strokeWidth={1.5} color={color["text-primary"]} />
            )}
          </Pressable>
        )}
      </View>
      {error ? (
        <Text variant="body-sm" tone="negative" accessibilityLiveRegion="polite" style={styles.hint}>
          {error}
        </Text>
      ) : hint !== undefined ? (
        <Text variant="body" tone="secondary" style={styles.hint}>
          {hint}
        </Text>
      ) : null}
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
    gap: 16,
    padding: 20,
    borderRadius: radius.sheet,
    borderWidth: 1,
    borderColor: color["border-subtle"],
    backgroundColor: color["surface-panel"],
  },
  head: { flexDirection: "row", alignItems: "flex-start", gap: 14 },
  words: { gap: 2 },
  status: { flexShrink: 0 },
  statusBelow: { flexDirection: "row", marginTop: 8 },
  title: { fontFamily: fontFamily("sans", 500), fontSize: 20, lineHeight: 26 },
  subtitle: { fontSize: 15, lineHeight: 21 },
  badge: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    minHeight: 34,
    paddingHorizontal: 12,
    borderRadius: radius.panel,
    borderWidth: 1,
    borderColor: color["border-strong"],
    backgroundColor: color["surface-raised"],
  },
  badgeText: { fontSize: 14, lineHeight: 18 },
  dot: { width: 9, height: 9, borderRadius: 5 },
  tile: { borderRadius: radius.pill, alignItems: "center", justifyContent: "center", backgroundColor: color["surface-raised"], borderWidth: 1, borderColor: color["border-strong"] },
  field: { gap: 8 },
  label: { fontSize: 16, lineHeight: 22 },
  input: {
    flexDirection: "row",
    alignItems: "center",
    minHeight: 56,
    paddingLeft: 16,
    borderRadius: radius.panel,
    borderWidth: 1,
    borderColor: color["border-strong"],
    backgroundColor: color["surface-base"],
  },
  inputError: { borderColor: color.negative },
  inputText: { flex: 1, minWidth: 0, minHeight: 54, paddingRight: 16, color: color["text-primary"], fontFamily: fontFamily("sans", 400), fontSize: 16 },
  reveal: { width: TOUCH_TARGET + 4, height: TOUCH_TARGET + 4, alignItems: "center", justifyContent: "center" },
  hint: { fontSize: 15, lineHeight: 21 },
  /* The linked account's address or key, inset. */
  address: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    minHeight: 56,
    paddingLeft: 16,
    paddingRight: 4,
    borderRadius: radius.panel,
    borderWidth: 1,
    borderColor: color["border-strong"],
    backgroundColor: color["surface-base"],
  },
  /* A preview of what an address holds, before it is saved. */
  preview: { gap: 10, padding: 16, borderRadius: radius.panel, borderWidth: 1, borderColor: color["border-accent"], backgroundColor: color["surface-base"] },
  actions: { flexDirection: "row", flexWrap: "wrap", gap: 10 },
});
