import type { ReactNode } from "react";
import { ActivityIndicator, Linking, Pressable, StyleSheet, View } from "react-native";
import * as Clipboard from "expo-clipboard";
import * as Haptics from "expo-haptics";
import { router } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { AlertTriangle, Check, ChevronRight, Info, RefreshCw, X, type LucideIcon } from "lucide-react-native";
import { IconButton } from "~/components/ui/controls";
import { useToast } from "~/components/ui/overlays";
import { Text, type TextTone } from "~/components/ui/Text";
import { color, radius, TOUCH_TARGET } from "~/theme/tokens";

/* ---------------------------------------------------------------------------
   The pieces the wallet's screens share — the sheet's header, an action row,
   a notice, a label/value line — and the three device calls they make:
   copy, open a link outside the app, and a haptic on an outcome.
--------------------------------------------------------------------------- */

/** The header of a wallet screen: an icon, the title, refresh (optional) and close. */
export function SheetHeader({
  title,
  icon: Icon,
  onRefresh,
  refreshing = false,
  closeLabel,
}: {
  title: string;
  icon?: LucideIcon;
  onRefresh?: () => void;
  refreshing?: boolean;
  closeLabel: string;
}) {
  const insets = useSafeAreaInsets();
  return (
    <View style={[styles.header, { paddingTop: insets.top }]}>
      {Icon !== undefined && <Icon size={18} strokeWidth={1.5} color={color["text-secondary"]} />}
      <Text variant="h2" accessibilityRole="header" numberOfLines={1} style={styles.flex}>
        {title}
      </Text>
      {onRefresh !== undefined && (
        <IconButton
          accessibilityLabel={refreshing ? "Refreshing" : "Refresh"}
          onPress={onRefresh}
          disabled={refreshing}
        >
          {refreshing ? (
            <ActivityIndicator size="small" color={color["text-secondary"]} />
          ) : (
            <RefreshCw size={18} strokeWidth={1.5} color={color["text-secondary"]} />
          )}
        </IconButton>
      )}
      <IconButton accessibilityLabel={closeLabel} onPress={() => (router.canGoBack() ? router.back() : router.replace("/"))}>
        <X size={20} strokeWidth={1.5} color={color["text-secondary"]} />
      </IconButton>
    </View>
  );
}

/** One row of the wallet's actions: an icon, what it does, a note under it. */
export function ActionRow({
  icon: Icon,
  label,
  note,
  onPress,
  tone = "primary",
  disabled = false,
  accessibilityLabel,
}: {
  icon: LucideIcon;
  label: string;
  note?: string;
  onPress?: () => void;
  tone?: "primary" | "negative" | "muted";
  disabled?: boolean;
  accessibilityLabel?: string;
}) {
  const iconColor = tone === "negative" ? color.negative : tone === "muted" ? color["text-muted"] : color["text-secondary"];
  const body = (
    <>
      <Icon size={18} strokeWidth={1.5} color={iconColor} />
      <View style={styles.flex}>
        <Text variant="body" tone={tone === "muted" ? "secondary" : tone}>
          {label}
        </Text>
        {note !== undefined && (
          <Text variant="label" tone="muted">
            {note}
          </Text>
        )}
      </View>
      {onPress !== undefined && (
        <ChevronRight size={16} strokeWidth={1.5} color={tone === "negative" ? color.negative : color["text-muted"]} />
      )}
    </>
  );
  if (onPress === undefined) return <View style={styles.row}>{body}</View>;
  return (
    <Pressable
      onPress={onPress}
      disabled={disabled}
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel}
      accessibilityState={{ disabled }}
      android_ripple={{ color: color["surface-hover"] }}
      style={({ pressed }) => [styles.row, { opacity: disabled ? 0.6 : pressed ? 0.8 : 1 }]}
    >
      {body}
    </Pressable>
  );
}

type NoticeTone = "negative" | "positive" | "caution" | "neutral";

const NOTICE: Record<NoticeTone, { border: string; background: string; icon: LucideIcon; iconColor: string; text: TextTone }> = {
  negative: { border: color.negative, background: color["negative-bg"], icon: AlertTriangle, iconColor: color.negative, text: "negative" },
  positive: { border: color.positive, background: color["positive-bg"], icon: Check, iconColor: color.positive, text: "positive" },
  caution: { border: color.caution, background: color["caution-bg"], icon: AlertTriangle, iconColor: color.caution, text: "secondary" },
  neutral: { border: color["border-subtle"], background: color["surface-raised"], icon: Info, iconColor: color["text-muted"], text: "secondary" },
};

/** A boxed line that says how something stands. Negative and positive are read out as they appear. */
export function Notice({
  tone,
  children,
  icon,
}: {
  tone: NoticeTone;
  children: ReactNode;
  /** Replaces the tone's own icon — a spinner while waiting, say. */
  icon?: ReactNode;
}) {
  const look = NOTICE[tone];
  const Icon = look.icon;
  return (
    <View
      accessibilityRole={tone === "negative" ? "alert" : undefined}
      accessibilityLiveRegion={tone === "neutral" ? undefined : "polite"}
      style={[styles.notice, { borderColor: look.border, backgroundColor: look.background }]}
    >
      {icon ?? <Icon size={14} strokeWidth={1.75} color={look.iconColor} style={styles.noticeIcon} />}
      <Text variant="label" tone={look.text} style={styles.flex}>
        {children}
      </Text>
    </View>
  );
}

/** A label and its value on one line; the value wraps rather than truncating. */
export function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <View style={styles.field}>
      <Text variant="label" tone="muted">
        {label}
      </Text>
      <View style={styles.fieldValue}>
        {typeof children === "string" ? (
          <Text variant="data-sm" style={styles.right}>
            {children}
          </Text>
        ) : (
          children
        )}
      </View>
    </View>
  );
}

/** Copies, with a haptic and a toast that says what was copied. */
export function useCopy(): (value: string, what: string) => Promise<void> {
  const toast = useToast();
  return async (value, what) => {
    await Clipboard.setStringAsync(value);
    void Haptics.selectionAsync();
    toast(`Copied the ${what}`, "positive");
  };
}

/** Opens a link in the phone's browser — the explorer, never a WebView. */
export function openExternal(url: string): void {
  void Linking.openURL(url);
}

/** The haptic for how something ended. */
export function outcomeHaptic(outcome: "success" | "warning" | "error"): void {
  void Haptics.notificationAsync(
    outcome === "success"
      ? Haptics.NotificationFeedbackType.Success
      : outcome === "warning"
        ? Haptics.NotificationFeedbackType.Warning
        : Haptics.NotificationFeedbackType.Error,
  );
}

const styles = StyleSheet.create({
  header: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    paddingLeft: 20,
    paddingRight: 4,
    paddingBottom: 4,
    backgroundColor: color["surface-base"],
    borderBottomColor: color["border-subtle"],
    borderBottomWidth: StyleSheet.hairlineWidth * 2,
  },
  flex: { flex: 1 },
  row: { flexDirection: "row", alignItems: "center", gap: 12, minHeight: TOUCH_TARGET, paddingVertical: 8 },
  notice: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 8,
    borderWidth: 1,
    borderRadius: radius.card,
    paddingHorizontal: 12,
    paddingVertical: 10,
  },
  noticeIcon: { marginTop: 1 },
  field: { flexDirection: "row", alignItems: "baseline", justifyContent: "space-between", gap: 12, paddingVertical: 6 },
  fieldValue: { flexShrink: 1, alignItems: "flex-end" },
  right: { textAlign: "right" },
});
