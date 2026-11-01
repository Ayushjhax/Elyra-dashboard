import type { ReactNode } from "react";
import { ActivityIndicator, Keyboard, Text as NativeText, Pressable, StyleSheet, View, useWindowDimensions, type ViewStyle } from "react-native";
import { router } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { ArrowLeft, ChevronRight, RefreshCw, X, type LucideIcon } from "lucide-react-native";
import { Emblem, Glow } from "~/components/ui/brand";
import { IconButton } from "~/components/ui/controls";
import { Text } from "~/components/ui/Text";
import { DISPLAY_SERIF, fontFamily } from "~/theme/fonts";
import { color, radius } from "~/theme/tokens";

/* ---------------------------------------------------------------------------
   The shell of a focused flow opened over the tabs — search, the inbox,
   notification settings, the wallet, alerts & automation: the gold emblem
   and wordmark with a close or back button (and refresh, where there is
   something to read again), a serif page title, and the tile, row and
   button pieces those screens share.

   Close leaves the way Android's back does: the keyboard goes first, then
   the screen pops back to wherever it was opened from.
--------------------------------------------------------------------------- */

export function closeFlow() {
  Keyboard.dismiss();
  if (router.canGoBack()) router.back();
  else router.replace("/");
}

function BarButton({ label, round, onPress, disabled = false, children }: { label: string; round: boolean; onPress: () => void; disabled?: boolean; children: ReactNode }) {
  return (
    <IconButton accessibilityLabel={label} onPress={onPress} disabled={disabled}>
      <View style={round ? styles.round : undefined}>{children}</View>
    </IconButton>
  );
}

/**
 * The top bar: emblem, wordmark and close, over the faint olive glow.
 * `back` puts a back arrow first instead of a close at the end (a pushed
 * screen); `onRefresh` adds refresh; `round` rings the buttons, as the
 * wallet draws them.
 */
export function FlowBar({
  closeLabel,
  onClose = closeFlow,
  back = false,
  onRefresh,
  refreshing = false,
  round = false,
}: {
  closeLabel: string;
  onClose?: () => void;
  back?: boolean;
  onRefresh?: () => void;
  refreshing?: boolean;
  round?: boolean;
}) {
  const insets = useSafeAreaInsets();
  const { width } = useWindowDimensions();
  const ink = color["text-primary"];
  return (
    <View style={[styles.bar, back && styles.barBack, { paddingTop: insets.top + 4 }]}>
      <Glow size={width * 1.1} strength={0.7} style={{ top: -width * 0.66, left: width * -0.05 }} />
      {back && (
        <BarButton label={closeLabel} round={round} onPress={onClose}>
          <ArrowLeft size={24} strokeWidth={1.5} color={color["text-secondary"]} />
        </BarButton>
      )}
      <View style={styles.brand} accessible accessibilityLabel="Elyra">
        <Emblem size={34} />
        <NativeText maxFontSizeMultiplier={1.2} style={styles.wordmark}>
          Elyra
        </NativeText>
      </View>
      {onRefresh !== undefined && (
        <BarButton label={refreshing ? "Refreshing" : "Refresh"} round={round} onPress={onRefresh} disabled={refreshing}>
          {refreshing ? (
            <ActivityIndicator size="small" color={color["text-secondary"]} />
          ) : (
            <RefreshCw size={round ? 20 : 22} strokeWidth={1.5} color={round ? ink : color["text-secondary"]} />
          )}
        </BarButton>
      )}
      {!back && (
        <BarButton label={closeLabel} round={round} onPress={onClose}>
          <X size={round ? 22 : 24} strokeWidth={1.5} color={ink} />
        </BarButton>
      )}
    </View>
  );
}

/**
 * A pushed screen's bar with its title in it: a round back button, the
 * serif title, and a round refresh where there is something to read again
 * (the dashboard, a report). The title shrinks rather than wraps.
 */
export function TitleBar({
  title,
  onRefresh,
  refreshing = false,
  backLabel = "Back",
}: {
  title: string;
  onRefresh?: () => void;
  refreshing?: boolean;
  backLabel?: string;
}) {
  const insets = useSafeAreaInsets();
  const { width } = useWindowDimensions();
  return (
    <View style={[styles.titleBar, { paddingTop: insets.top + 6 }]}>
      <Glow size={width * 1.1} strength={0.6} style={{ top: -width * 0.7, left: width * -0.05 }} />
      <BarButton label={backLabel} round onPress={closeFlow}>
        <ArrowLeft size={22} strokeWidth={1.5} color={color["text-primary"]} />
      </BarButton>
      <NativeText
        accessibilityRole="header"
        numberOfLines={1}
        adjustsFontSizeToFit
        minimumFontScale={0.7}
        maxFontSizeMultiplier={1.2}
        style={styles.titleBarText}
      >
        {title}
      </NativeText>
      {onRefresh !== undefined && (
        <BarButton label={refreshing ? "Refreshing" : "Refresh"} round onPress={onRefresh} disabled={refreshing}>
          {refreshing ? (
            <ActivityIndicator size="small" color={color["text-secondary"]} />
          ) : (
            <RefreshCw size={20} strokeWidth={1.5} color={color["text-primary"]} />
          )}
        </BarButton>
      )}
    </View>
  );
}

/** The serif page title, with an optional line under it — in the serif too when `serifSubtitle`. */
export function FlowTitle({ title, subtitle, serifSubtitle = false, style }: { title: string; subtitle?: string; serifSubtitle?: boolean; style?: ViewStyle }) {
  const { width } = useWindowDimensions();
  const size = Math.min(48, Math.max(36, Math.round(width * 0.105)));
  return (
    <View style={[styles.titleBlock, style]}>
      <NativeText
        accessibilityRole="header"
        maxFontSizeMultiplier={1.2}
        style={[styles.title, { fontSize: size, lineHeight: Math.round(size * 1.15) }]}
      >
        {title}
      </NativeText>
      {subtitle !== undefined &&
        (serifSubtitle ? (
          <NativeText maxFontSizeMultiplier={1.25} style={styles.serifSubtitle}>
            {subtitle}
          </NativeText>
        ) : (
          <Text variant="body" tone="muted" style={styles.subtitle}>
            {subtitle}
          </Text>
        ))}
    </View>
  );
}

/** A serif section heading inside a flow, e.g. "Updates you want"; `small` heads a card ("Assets"). */
export function FlowHeading({ children, small = false }: { children: string; small?: boolean }) {
  return (
    <NativeText accessibilityRole="header" maxFontSizeMultiplier={1.25} style={[styles.heading, small && styles.headingSmall]}>
      {children}
    </NativeText>
  );
}

/** A small rounded tag: a count, a source, "Read-only". `accent` is the lime outline of a live count. */
export function Pill({ children, tone = "neutral", accessibilityLabel }: { children: ReactNode; tone?: "neutral" | "accent" | "positive" | "caution"; accessibilityLabel?: string }) {
  const ink = tone === "accent" ? "accent" : tone === "positive" ? "positive" : tone === "caution" ? "caution" : "secondary";
  return (
    <View
      accessibilityLabel={accessibilityLabel}
      style={[styles.pill, tone === "accent" && styles.pillAccent, tone === "positive" && styles.pillPositive, tone === "caution" && styles.pillCaution]}
    >
      {typeof children === "string" ? (
        <Text variant="body-sm" tone={ink} numberOfLines={1} maxFontSizeMultiplier={1.3} style={tone === "accent" ? styles.pillAccentText : styles.pillText}>
          {children}
        </Text>
      ) : (
        children
      )}
    </View>
  );
}

/** The full-width button of a flow: lime for the one primary action, outlined otherwise. */
export function WideButton({
  label,
  variant,
  leading: Leading,
  trailing: Trailing,
  busy = false,
  disabled = false,
  accessibilityHint,
  onPress,
}: {
  label: string;
  variant: "accent" | "outline";
  leading?: LucideIcon;
  trailing?: LucideIcon;
  busy?: boolean;
  disabled?: boolean;
  accessibilityHint?: string;
  onPress: () => void;
}) {
  const accent = variant === "accent";
  const inactive = busy || disabled;
  const ink = accent ? color["text-on-accent"] : color["text-primary"];
  return (
    <Pressable
      onPress={onPress}
      disabled={inactive}
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityHint={accessibilityHint}
      accessibilityState={{ disabled: inactive, busy }}
      style={({ pressed }) => [
        styles.wide,
        accent ? styles.wideAccent : styles.wideOutline,
        pressed && (accent ? styles.wideAccentPressed : styles.wideOutlinePressed),
        disabled && !busy && { opacity: 0.5 },
      ]}
    >
      {busy ? <ActivityIndicator size="small" color={ink} /> : Leading ? <Leading size={22} strokeWidth={1.75} color={ink} /> : null}
      <Text variant="body" tone={accent ? "on-accent" : "primary"} style={styles.wideLabel} maxFontSizeMultiplier={1.4}>
        {label}
      </Text>
      {Trailing && <Trailing size={24} strokeWidth={1.5} color={ink} style={styles.trailing} />}
    </Pressable>
  );
}

/** A line icon in a small rounded tile. */
export function IconTile({ icon: Icon, size = 48, tint = color["text-secondary"], badge }: { icon: LucideIcon; size?: number; tint?: string; badge?: ReactNode }) {
  return (
    <View style={[styles.tile, { width: size, height: size, borderRadius: size >= 56 ? radius.pill : radius.panel }]}>
      <Icon size={Math.round(size * 0.46)} strokeWidth={1.5} color={tint} />
      {badge !== undefined && <View style={styles.tileBadge}>{badge}</View>}
    </View>
  );
}

/** A bordered row that goes somewhere: tile, title, hint and a chevron. The whole row is the target. */
export function ActionRow({
  icon,
  title,
  hint,
  onPress,
  accessibilityHint,
  trailing,
}: {
  icon: LucideIcon;
  title: string;
  hint?: string;
  onPress: () => void;
  accessibilityHint?: string;
  trailing?: ReactNode;
}) {
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={hint ? `${title}, ${hint}` : title}
      accessibilityHint={accessibilityHint}
      android_ripple={{ color: color["surface-hover"] }}
      style={({ pressed }) => [styles.action, pressed && styles.actionPressed]}
    >
      <IconTile icon={icon} />
      <View style={styles.flex}>
        <Text variant="body" style={styles.actionTitle} numberOfLines={2}>
          {title}
        </Text>
        {hint !== undefined && (
          <Text variant="body-sm" tone="muted" style={styles.actionHint}>
            {hint}
          </Text>
        )}
      </View>
      {trailing ?? <ChevronRight size={22} strokeWidth={1.5} color={color["text-secondary"]} />}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1, minWidth: 0, gap: 2 },
  bar: {
    flexDirection: "row",
    alignItems: "center",
    paddingLeft: 20,
    paddingRight: 8,
    paddingBottom: 4,
    backgroundColor: color["surface-base"],
    overflow: "hidden",
  },
  barBack: { paddingLeft: 4 },
  titleBar: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingLeft: 8,
    paddingRight: 8,
    paddingBottom: 8,
    backgroundColor: color["surface-base"],
    overflow: "hidden",
  },
  titleBarText: { flex: 1, minWidth: 0, fontFamily: DISPLAY_SERIF, fontSize: 34, lineHeight: 42, color: color["text-primary"], letterSpacing: -0.4, marginLeft: 8 },
  round: {
    width: 44,
    height: 44,
    borderRadius: radius.pill,
    borderWidth: 1,
    borderColor: color["border-strong"],
    alignItems: "center",
    justifyContent: "center",
  },
  brand: { flex: 1, flexDirection: "row", alignItems: "center", gap: 10 },
  wordmark: { fontFamily: DISPLAY_SERIF, fontSize: 26, lineHeight: 32, color: color["text-primary"] },
  titleBlock: { gap: 4 },
  title: { fontFamily: DISPLAY_SERIF, color: color["text-primary"], letterSpacing: -0.4 },
  subtitle: { fontSize: 17, lineHeight: 24 },
  serifSubtitle: { fontFamily: DISPLAY_SERIF, fontSize: 24, lineHeight: 30, color: color["text-muted"], marginTop: -2 },
  heading: { fontFamily: DISPLAY_SERIF, color: color["text-primary"], fontSize: 30, lineHeight: 36, letterSpacing: -0.3 },
  headingSmall: { fontSize: 25, lineHeight: 31, letterSpacing: -0.2 },
  pill: {
    minHeight: 30,
    paddingHorizontal: 10,
    borderRadius: radius.pill,
    borderWidth: 1,
    borderColor: color["border-strong"],
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
  },
  pillAccent: { borderColor: color["accent-hover"], minHeight: 32, paddingHorizontal: 12 },
  pillPositive: { borderColor: color["border-subtle"], backgroundColor: color["positive-bg"] },
  pillCaution: { borderColor: color["border-subtle"], backgroundColor: color["caution-bg"] },
  pillText: { fontSize: 14, lineHeight: 18 },
  pillAccentText: { fontSize: 15, lineHeight: 20, fontFamily: fontFamily("sans", 500), color: color["accent-hover"] },
  wide: {
    minHeight: 56,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 12,
    paddingHorizontal: 18,
    borderRadius: radius.panel,
  },
  wideAccent: { backgroundColor: color["accent-hover"] },
  wideAccentPressed: { backgroundColor: color.accent },
  wideOutline: { borderWidth: 1, borderColor: color["border-strong"] },
  wideOutlinePressed: { backgroundColor: color["surface-hover"] },
  wideLabel: { fontFamily: fontFamily("sans", 500), fontSize: 17, lineHeight: 22, flexShrink: 1, textAlign: "center" },
  trailing: { position: "absolute", right: 20 },
  tile: {
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1,
    borderColor: color["border-subtle"],
    backgroundColor: color["surface-raised"],
  },
  tileBadge: { position: "absolute", right: 6, bottom: 6 },
  action: {
    flexDirection: "row",
    alignItems: "center",
    gap: 16,
    minHeight: 76,
    paddingHorizontal: 14,
    paddingVertical: 12,
    borderRadius: radius.sheet,
    borderWidth: 1,
    borderColor: color["border-subtle"],
    backgroundColor: color["surface-panel"],
    overflow: "hidden",
  },
  actionPressed: { backgroundColor: color["surface-hover"] },
  actionTitle: { fontFamily: fontFamily("sans", 500), fontSize: 17, lineHeight: 23 },
  actionHint: { fontSize: 15, lineHeight: 20 },
});
