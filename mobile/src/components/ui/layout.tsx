import { useEffect, useState, type ReactNode } from "react";
import { Pressable, ScrollView, StyleSheet, View, type ScrollViewProps, type ViewProps } from "react-native";
import Animated, {
  useAnimatedStyle,
  useReducedMotion,
  useSharedValue,
  withRepeat,
  withTiming,
} from "react-native-reanimated";
import { SafeAreaView, type Edge } from "react-native-safe-area-context";
import { ChevronRight } from "lucide-react-native";
import { Text } from "~/components/ui/Text";
import { color, motion, radius, space, TOUCH_TARGET } from "~/theme/tokens";

/* ---------------------------------------------------------------------------
   The surfaces every screen is built from.

   Flat, as the brand is: elevation is a surface value plus a 1px border,
   never a shadow (§3). The forest ground, a panel on it, a card in a list.
--------------------------------------------------------------------------- */

/** A screen: the forest ground, inside the safe area. Scrolls unless told not to. */
export function Screen({
  children,
  scroll = true,
  edges = ["left", "right"],
  contentStyle,
  ...props
}: {
  children: ReactNode;
  scroll?: boolean;
  edges?: Edge[];
  contentStyle?: ScrollViewProps["contentContainerStyle"];
} & Omit<ScrollViewProps, "children" | "contentContainerStyle">) {
  return (
    <SafeAreaView edges={edges} style={styles.screen}>
      {scroll ? (
        <ScrollView
          {...props}
          contentContainerStyle={[styles.screenContent, contentStyle]}
          keyboardShouldPersistTaps="handled"
        >
          {children}
        </ScrollView>
      ) : (
        <View style={[styles.screenContent, styles.fill, contentStyle]}>{children}</View>
      )}
    </SafeAreaView>
  );
}

/** A panel: --surface-panel on a hairline, at the panel radius. */
export function Panel({ style, ...props }: ViewProps) {
  return <View {...props} style={[styles.panel, style]} />;
}

/** A card in a list: the same surface at the card radius. */
export function Card({ style, ...props }: ViewProps) {
  return <View {...props} style={[styles.panel, styles.card, style]} />;
}

/** The section label style: uppercase, letterspaced, muted (§2.2). */
export function Eyebrow({ children }: { children: ReactNode }) {
  return (
    <Text variant="eyebrow" tone="muted" accessibilityRole="header">
      {children}
    </Text>
  );
}

export function Divider({ style }: { style?: ViewProps["style"] }) {
  return <View style={[styles.divider, style]} />;
}

/**
 * A titled section that can fold away. The whole header is the control, at
 * least a touch target tall.
 */
export function Section({
  title,
  meta,
  action,
  children,
  initiallyOpen = true,
}: {
  title: string;
  meta?: string;
  action?: ReactNode;
  children: ReactNode;
  initiallyOpen?: boolean;
}) {
  const [open, setOpen] = useState(initiallyOpen);
  return (
    <Panel>
      <View style={styles.sectionHead}>
        <Pressable
          onPress={() => setOpen((value) => !value)}
          accessibilityRole="button"
          accessibilityState={{ expanded: open }}
          accessibilityLabel={title}
          style={styles.sectionToggle}
        >
          <ChevronRight
            size={16}
            strokeWidth={1.5}
            color={color["text-muted"]}
            style={{ transform: [{ rotate: open ? "90deg" : "0deg" }] }}
          />
          <Text variant="panel-title">{title}</Text>
          {meta !== undefined && (
            <Text variant="label" tone="muted">
              {meta}
            </Text>
          )}
        </Pressable>
        {action}
      </View>
      {open && <View style={styles.sectionBody}>{children}</View>}
    </Panel>
  );
}

/** A placeholder while something loads. Pulses unless reduced motion is on. */
export function Skeleton({
  width = "100%",
  height = 14,
  rounded = radius.control,
}: {
  width?: number | `${number}%`;
  height?: number;
  rounded?: number;
}) {
  const reduced = useReducedMotion();
  const opacity = useSharedValue(1);
  useEffect(() => {
    if (reduced) return;
    opacity.value = withRepeat(withTiming(0.45, { duration: motion["dur-slow"] * 3 }), -1, true);
  }, [opacity, reduced]);
  const animated = useAnimatedStyle(() => ({ opacity: opacity.value }));
  return (
    <Animated.View
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
      style={[{ width, height, borderRadius: rounded, backgroundColor: color["surface-hover"] }, animated]}
    />
  );
}

/** Nothing to show — said plainly, with what to do about it when there is something. */
export function EmptyState({
  title,
  body,
  icon,
  action,
}: {
  title: string;
  body?: string;
  icon?: ReactNode;
  action?: ReactNode;
}) {
  return (
    <View style={styles.empty}>
      {icon}
      <Text variant="h2" style={styles.center}>
        {title}
      </Text>
      {body !== undefined && (
        <Text variant="body-sm" tone="secondary" style={styles.center}>
          {body}
        </Text>
      )}
      {action}
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: color["surface-base"] },
  screenContent: { padding: 16, gap: space["gap-shell"] },
  fill: { flex: 1 },
  panel: {
    backgroundColor: color["surface-panel"],
    borderColor: color["border-subtle"],
    borderWidth: StyleSheet.hairlineWidth * 2,
    borderRadius: radius.panel,
    overflow: "hidden",
  },
  card: { borderRadius: radius.card, padding: space["pad-panel-sm"] },
  divider: { height: StyleSheet.hairlineWidth * 2, backgroundColor: color["border-subtle"] },
  sectionHead: { flexDirection: "row", alignItems: "center", paddingRight: 8 },
  sectionToggle: {
    flex: 1,
    minHeight: TOUCH_TARGET,
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    paddingHorizontal: space["pad-panel"],
  },
  sectionBody: {
    borderTopColor: color["border-subtle"],
    borderTopWidth: StyleSheet.hairlineWidth * 2,
    padding: space["pad-panel"],
    gap: 12,
  },
  empty: { alignItems: "center", gap: 8, paddingVertical: 32, paddingHorizontal: 24 },
  center: { textAlign: "center" },
});
