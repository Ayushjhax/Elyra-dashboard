import { Pressable, StyleSheet, View } from "react-native";
import { router, type Href } from "expo-router";
import { ChevronRight, LayoutDashboard, Wallet, type LucideIcon } from "lucide-react-native";
import { EmptyState, Screen } from "~/components/ui/layout";
import { Text } from "~/components/ui/Text";
import { color, radius, TOUCH_TARGET } from "~/theme/tokens";

/* Account settings arrive with a later prompt. The dashboard — holdings,
   network, the account and its linked logins — is already real, so it is
   reachable from here. */

const ROWS: { href: Href; label: string; note: string; icon: LucideIcon }[] = [
  { href: "/dashboard", label: "Dashboard", note: "Holdings, network, account and linked logins", icon: LayoutDashboard },
  { href: "/wallet", label: "Wallet", note: "Balance, assets and actions", icon: Wallet },
];

export default function AccountScreen() {
  return (
    <Screen>
      <View style={styles.links}>
        {ROWS.map((row) => (
          <Pressable key={row.label} onPress={() => router.push(row.href)} accessibilityRole="button" accessibilityHint={row.note} style={styles.link}>
            <row.icon size={18} strokeWidth={1.5} color={color["text-secondary"]} />
            <View style={styles.flex}>
              <Text variant="body">{row.label}</Text>
              <Text variant="label" tone="muted">
                {row.note}
              </Text>
            </View>
            <ChevronRight size={16} strokeWidth={1.5} color={color["text-muted"]} />
          </Pressable>
        ))}
      </View>
      <EmptyState title="Settings" body="Notifications, alerts, connections, security and deletion arrive here." />
    </Screen>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1, minWidth: 0 },
  links: {
    borderRadius: radius.panel,
    borderWidth: 1,
    borderColor: color["border-subtle"],
    backgroundColor: color["surface-panel"],
    overflow: "hidden",
  },
  link: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    minHeight: TOUCH_TARGET + 8,
    paddingHorizontal: 16,
    borderBottomWidth: StyleSheet.hairlineWidth * 2,
    borderBottomColor: color["border-subtle"],
  },
});
