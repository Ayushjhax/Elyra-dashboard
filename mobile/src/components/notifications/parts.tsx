import type { ReactNode } from "react";
import { Pressable, StyleSheet, Switch, View } from "react-native";
import { ArrowRight, Bell, BellOff, CircleAlert, CircleCheck, ExternalLink, RefreshCw, type LucideIcon } from "lucide-react-native";
import type { PushStatus } from "~/lib/notifications/push";
import { IconTile, WideButton } from "~/components/shell/flow";
import { Text } from "~/components/ui/Text";
import { fontFamily } from "~/theme/fonts";
import { TOUCH_TARGET, color, radius } from "~/theme/tokens";

/* ---------------------------------------------------------------------------
   Notification settings pieces: the push card and the switch groups.

   Presentational only. The push status comes from usePushState, which says
   "on" only once this device's token is registered with Elyra's server
   (lib/notifications/push.ts) — permission alone is "not registered" — and
   the actions are handed in, so nothing here talks to the network.
--------------------------------------------------------------------------- */

interface CardCopy {
  icon: LucideIcon;
  badge: "check" | "alert" | null;
  title: string;
  status: string;
  tone: "positive" | "caution" | "muted";
  body: string;
}

const COPY: Record<PushStatus, CardCopy> = {
  checking: { icon: Bell, badge: null, title: "Checking push…", status: "Checking", tone: "muted", body: "Your inbox works with push on or off." },
  on: { icon: Bell, badge: "check", title: "Push is on", status: "Connected", tone: "positive", body: "Your inbox works with push on or off." },
  "not-registered": { icon: Bell, badge: "alert", title: "Push not registered", status: "Action needed", tone: "caution", body: "Your inbox still receives updates." },
  off: { icon: BellOff, badge: null, title: "Push is off", status: "Blocked in system settings", tone: "caution", body: "Your inbox still receives updates." },
};

export function PushStatusCard({
  status,
  busy,
  error,
  granted,
  channelBlocked,
  onFix,
  onCheck,
  onSystemSettings,
}: {
  status: PushStatus;
  busy: boolean;
  error: string | null;
  granted: boolean;
  /** Android's price-alert channel is switched off for this app. */
  channelBlocked: boolean;
  onFix: () => void;
  onCheck: () => void;
  onSystemSettings: () => void;
}) {
  const copy = COPY[status];
  const badge =
    copy.badge === "check" ? (
      <CircleCheck size={18} strokeWidth={2} color={color["text-on-accent"]} fill={color.positive} />
    ) : copy.badge === "alert" ? (
      <CircleAlert size={18} strokeWidth={2} color={color["text-on-accent"]} fill={color.caution} />
    ) : undefined;
  const tint = status === "on" ? color.positive : status === "checking" ? color["text-secondary"] : color.caution;
  return (
    <View style={styles.panel} accessibilityLiveRegion="polite">
      <View style={styles.statusRow}>
        <IconTile icon={copy.icon} size={64} tint={tint} badge={badge} />
        <View style={styles.flex}>
          <Text variant="body" style={styles.statusTitle}>
            {copy.title}
          </Text>
          <Text variant="body" tone={copy.tone} style={styles.statusWord}>
            {copy.status}
          </Text>
          <Text variant="body" tone="secondary">
            {copy.body}
          </Text>
        </View>
      </View>
      {error !== null && status !== "on" && (
        <Text variant="body-sm" tone="negative">
          {error}
        </Text>
      )}
      {channelBlocked && (
        <Text variant="body-sm" tone="caution">
          Price alerts are blocked in Android&apos;s notification channel settings.
        </Text>
      )}
      {status === "not-registered" || status === "off" ? (
        <WideButton
          label={status === "off" ? "Open system settings" : "Fix push notifications"}
          variant="accent"
          trailing={ArrowRight}
          busy={busy}
          onPress={onFix}
        />
      ) : (
        <WideButton label="Check push status" variant="outline" leading={RefreshCw} busy={busy || status === "checking"} onPress={onCheck} />
      )}
      {granted && (
        <Pressable
          onPress={onSystemSettings}
          accessibilityRole="link"
          accessibilityHint="Opens Android's notification settings for Elyra"
          style={({ pressed }) => [styles.link, pressed && { opacity: 0.7 }]}
        >
          <Text variant="body" tone="secondary">
            System notification settings
          </Text>
          <ExternalLink size={18} strokeWidth={1.5} color={color["text-secondary"]} />
        </Pressable>
      )}
    </View>
  );
}

/** A bordered group of switch rows, with an optional uppercase label. */
export function PreferenceGroup({ label, children }: { label?: string; children: ReactNode }) {
  return (
    <View style={styles.group}>
      {label !== undefined && (
        <Text variant="eyebrow" tone="secondary" accessibilityRole="header" style={styles.groupLabel}>
          {label}
        </Text>
      )}
      {children}
    </View>
  );
}

/** Icon, label and description on the left; the switch on the right. The whole row toggles. */
export function SwitchRow({
  icon,
  label,
  detail,
  value,
  saving,
  disabled = false,
  first = false,
  onToggle,
}: {
  icon: LucideIcon;
  label: string;
  detail: string;
  value: boolean;
  saving: boolean;
  disabled?: boolean;
  first?: boolean;
  onToggle: () => void;
}) {
  return (
    <Pressable
      onPress={onToggle}
      disabled={disabled}
      accessibilityRole="switch"
      accessibilityLabel={label}
      accessibilityHint={detail}
      accessibilityState={{ checked: value, disabled, busy: saving }}
      android_ripple={{ color: color["surface-hover"] }}
      style={[styles.row, !first && styles.rowRule]}
    >
      <IconTile icon={icon} />
      <View style={styles.flex}>
        <Text variant="body" style={styles.rowLabel}>
          {label}
        </Text>
        <Text variant="body" tone="muted">
          {saving ? "Saving…" : detail}
        </Text>
      </View>
      <Switch
        value={value}
        pointerEvents="none"
        accessible={false}
        disabled={disabled}
        trackColor={{ false: color["border-strong"], true: color["accent-quiet"] }}
        thumbColor={value ? color["accent-hover"] : color["text-secondary"]}
      />
    </Pressable>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1, minWidth: 0, gap: 2 },
  panel: {
    gap: 16,
    padding: 18,
    borderRadius: radius.sheet,
    borderWidth: 1,
    borderColor: color["border-subtle"],
    backgroundColor: color["surface-panel"],
  },
  statusRow: { flexDirection: "row", alignItems: "flex-start", gap: 16 },
  statusTitle: { fontFamily: fontFamily("sans", 500), fontSize: 19, lineHeight: 25 },
  statusWord: { fontFamily: fontFamily("sans", 500) },
  link: { minHeight: TOUCH_TARGET, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 10, marginTop: -4 },
  group: {
    borderRadius: radius.sheet,
    borderWidth: 1,
    borderColor: color["border-subtle"],
    backgroundColor: color["surface-panel"],
    overflow: "hidden",
  },
  groupLabel: { paddingHorizontal: 20, paddingTop: 16, paddingBottom: 12 },
  row: { flexDirection: "row", alignItems: "center", gap: 16, minHeight: 80, paddingHorizontal: 16, paddingVertical: 12 },
  rowRule: { borderTopWidth: StyleSheet.hairlineWidth * 2, borderTopColor: color["border-subtle"], marginHorizontal: 0 },
  rowLabel: { fontFamily: fontFamily("sans", 500), fontSize: 17, lineHeight: 23 },
});
