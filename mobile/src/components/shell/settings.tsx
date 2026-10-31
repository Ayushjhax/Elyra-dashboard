import type { ReactNode } from "react";
import { ActivityIndicator, Pressable, RefreshControl, StyleSheet, Switch, View } from "react-native";
import { KeyboardAwareScrollView } from "react-native-keyboard-controller";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { ChevronRight, ExternalLink, type LucideIcon } from "lucide-react-native";
import { FlowBar, FlowTitle } from "~/components/shell/flow";
import { Text, type TextTone } from "~/components/ui/Text";
import { fontFamily } from "~/theme/fonts";
import { color, radius, TOUCH_TARGET } from "~/theme/tokens";

/* ---------------------------------------------------------------------------
   The account's settings pages — Connections, Referrals, Settings, Help &
   legal: the flows' brand bar with back (and refresh, where there is
   something to read again), a serif title and line, and grouped rows of
   an icon, a hairline, the words and what the row does.

   The page scrolls with the keyboard (react-native-keyboard-controller):
   a focused field is lifted clear of it, with room left for the button
   under the field, so a form is never typed blind.

   Presentational only. Every value and action is handed in.
--------------------------------------------------------------------------- */

/** Room under a focused field: enough for the field's own button to show above the keyboard. */
const FIELD_CLEARANCE = 160;

export function SettingsPage({
  title,
  subtitle,
  onRefresh,
  refreshing = false,
  children,
}: {
  title: string;
  subtitle?: string;
  onRefresh?: () => void;
  refreshing?: boolean;
  children: ReactNode;
}) {
  const insets = useSafeAreaInsets();
  return (
    <View style={styles.screen}>
      <FlowBar back closeLabel="Back" onRefresh={onRefresh} refreshing={refreshing} />
      <KeyboardAwareScrollView
        bottomOffset={FIELD_CLEARANCE}
        keyboardShouldPersistTaps="handled"
        contentContainerStyle={[styles.content, { paddingBottom: insets.bottom + 32 }]}
        refreshControl={
          onRefresh === undefined ? undefined : (
            <RefreshControl
              refreshing={false}
              onRefresh={onRefresh}
              tintColor={color.accent}
              colors={[color.accent]}
              progressBackgroundColor={color["surface-raised"]}
            />
          )
        }
      >
        <FlowTitle title={title} subtitle={subtitle} serifSubtitle />
        {children}
      </KeyboardAwareScrollView>
    </View>
  );
}

/** An uppercase label over a group. */
export function GroupLabel({ children }: { children: string }) {
  return (
    <Text variant="eyebrow" tone="secondary" accessibilityRole="header" style={styles.groupLabel}>
      {children}
    </Text>
  );
}

/** A bordered panel of rows, under an optional label. `danger` is the muted-coral edge of an irreversible row. */
export function SettingsGroup({ label, children, danger = false }: { label?: string; children: ReactNode; danger?: boolean }) {
  return (
    <View style={styles.group}>
      {label !== undefined && <GroupLabel>{label}</GroupLabel>}
      <View style={[styles.panel, danger && styles.panelDanger]}>{children}</View>
    </View>
  );
}

/** The left column of a row: the icon, then a hairline. */
function Lead({ icon: Icon, tint }: { icon: LucideIcon; tint: string }) {
  return (
    <View style={styles.lead}>
      <Icon size={26} strokeWidth={1.5} color={tint} />
      <View style={styles.leadRule} />
    </View>
  );
}

type Trailing = "chevron" | "external" | "none";

/**
 * A row: icon, title, detail, and — when it goes somewhere — a chevron (in
 * the app) or the external mark (the browser, the mail app). `children`
 * sits under the words, full width, for a row that carries more.
 */
export function SettingsRow({
  icon,
  title,
  detail,
  note,
  onPress,
  trailing = onPress === undefined ? "none" : "chevron",
  accessory,
  tone = "primary",
  first = false,
  accessibilityHint,
  children,
}: {
  icon: LucideIcon;
  title: string;
  detail?: string;
  /** A smaller line under the detail. */
  note?: string;
  onPress?: () => void;
  trailing?: Trailing;
  /** A control on the right instead of the chevron — a menu, a switch. */
  accessory?: ReactNode;
  tone?: "primary" | "negative";
  first?: boolean;
  accessibilityHint?: string;
  children?: ReactNode;
}) {
  const tint = tone === "negative" ? color.negative : color["text-primary"];
  const body = (
    <View style={styles.row}>
      <Lead icon={icon} tint={tint} />
      <View style={styles.words}>
        <Text variant="body" tone={tone} style={styles.title}>
          {title}
        </Text>
        {detail !== undefined && (
          <Text variant="body" tone="secondary" style={styles.detail}>
            {detail}
          </Text>
        )}
        {note !== undefined && (
          <Text variant="body-sm" tone="secondary" style={styles.note}>
            {note}
          </Text>
        )}
      </View>
      {accessory}
      {trailing === "chevron" && <ChevronRight size={22} strokeWidth={1.5} color={tone === "negative" ? color.negative : color["text-secondary"]} />}
      {trailing === "external" && <ExternalLink size={22} strokeWidth={1.5} color={color["text-secondary"]} />}
    </View>
  );
  return (
    <View style={!first && styles.ruled}>
      {onPress === undefined ? (
        body
      ) : (
        <Pressable
          onPress={onPress}
          accessibilityRole={trailing === "external" ? "link" : "button"}
          accessibilityLabel={detail === undefined ? title : `${title}, ${detail}`}
          accessibilityHint={accessibilityHint ?? (trailing === "external" ? "Opens outside Elyra" : undefined)}
          android_ripple={{ color: color["surface-hover"] }}
          style={({ pressed }) => pressed && styles.pressed}
        >
          {body}
        </Pressable>
      )}
      {children !== undefined && <View style={styles.extra}>{children}</View>}
    </View>
  );
}

/** A preference with a switch; the whole row toggles it, and the switch's state is read out. */
export function PreferenceSwitchRow({
  icon,
  title,
  detail,
  value,
  onChange,
  disabled = false,
  busy = false,
  first = false,
}: {
  icon: LucideIcon;
  title: string;
  detail: string;
  value: boolean;
  onChange: (next: boolean) => void;
  disabled?: boolean;
  busy?: boolean;
  first?: boolean;
}) {
  return (
    <Pressable
      onPress={() => onChange(!value)}
      disabled={disabled || busy}
      accessibilityRole="switch"
      accessibilityLabel={title}
      accessibilityHint={detail}
      accessibilityState={{ checked: value, disabled: disabled || busy, busy }}
      android_ripple={{ color: color["surface-hover"] }}
      style={[styles.row, !first && styles.ruled]}
    >
      <Lead icon={icon} tint={color["text-primary"]} />
      <View style={styles.words}>
        <Text variant="body" style={styles.title}>
          {title}
        </Text>
        <Text variant="body" tone="secondary" style={styles.detail}>
          {detail}
        </Text>
      </View>
      {busy ? (
        <ActivityIndicator size="small" color={color["text-secondary"]} />
      ) : (
        <Switch
          value={value}
          pointerEvents="none"
          accessible={false}
          disabled={disabled}
          trackColor={{ false: color["border-strong"], true: color["accent-quiet"] }}
          thumbColor={value ? color["accent-hover"] : color["text-secondary"]}
        />
      )}
    </Pressable>
  );
}

const DOT: Partial<Record<TextTone, string>> = {
  positive: color.positive,
  caution: color.caution,
  negative: color.negative,
  muted: color["text-muted"],
};

/** A label and its value on one line — the About group. A status value carries a dot as well as its word. */
export function FactRow({ label, value, tone = "primary", dot = false, first = false }: { label: string; value: string; tone?: TextTone; dot?: boolean; first?: boolean }) {
  return (
    <View style={[styles.fact, !first && styles.ruled]} accessible accessibilityLabel={`${label}: ${value}`}>
      <Text variant="body" style={styles.factLabel}>
        {label}
      </Text>
      <View style={styles.factValue}>
        {dot && <View style={[styles.dot, { backgroundColor: DOT[tone] ?? color["text-muted"] }]} />}
        <Text variant="data" tone={tone} style={styles.factText}>
          {value}
        </Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: color["surface-base"] },
  content: { paddingHorizontal: 20, paddingTop: 4, gap: 20 },
  group: { gap: 10 },
  groupLabel: { fontSize: 13, lineHeight: 17, letterSpacing: 2 },
  panel: {
    borderRadius: radius.sheet,
    borderWidth: 1,
    borderColor: color["border-subtle"],
    backgroundColor: color["surface-panel"],
    overflow: "hidden",
  },
  panelDanger: { borderColor: color.negative, backgroundColor: color["negative-bg"] },
  ruled: { borderTopWidth: StyleSheet.hairlineWidth * 2, borderTopColor: color["border-subtle"] },
  pressed: { backgroundColor: color["surface-hover"] },
  row: { flexDirection: "row", alignItems: "center", gap: 16, minHeight: TOUCH_TARGET + 24, paddingLeft: 12, paddingRight: 16, paddingVertical: 14 },
  lead: { flexDirection: "row", alignItems: "center", alignSelf: "stretch", gap: 16, paddingLeft: 8 },
  leadRule: { width: StyleSheet.hairlineWidth * 2, alignSelf: "stretch", backgroundColor: color["border-subtle"] },
  words: { flex: 1, minWidth: 0, gap: 3 },
  title: { fontFamily: fontFamily("sans", 500), fontSize: 17, lineHeight: 23 },
  detail: { fontSize: 15, lineHeight: 21 },
  note: { fontSize: 14, lineHeight: 19, marginTop: 4 },
  extra: { paddingHorizontal: 16, paddingBottom: 16 },
  fact: { flexDirection: "row", alignItems: "center", gap: 16, minHeight: TOUCH_TARGET + 12, paddingHorizontal: 20, paddingVertical: 12 },
  factLabel: { fontSize: 16, lineHeight: 22 },
  factValue: { flex: 1, minWidth: 0, flexDirection: "row", alignItems: "center", justifyContent: "flex-end", gap: 8 },
  factText: { fontSize: 15, lineHeight: 21, textAlign: "right", flexShrink: 1 },
  dot: { width: 8, height: 8, borderRadius: 4 },
});
