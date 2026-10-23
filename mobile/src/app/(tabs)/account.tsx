import { useState } from "react";
import { Pressable, StyleSheet, View } from "react-native";
import { router, type Href } from "expo-router";
import {
  Bell,
  ChevronRight,
  CircleHelp,
  Gift,
  LayoutDashboard,
  Link2,
  LogOut,
  Settings,
  Wallet,
  Zap,
  type LucideIcon,
} from "lucide-react-native";
import { AccountIdentity } from "~/components/account/Identity";
import { Panel, Screen } from "~/components/ui/layout";
import { Text } from "~/components/ui/Text";
import { useElyraAuth } from "~/lib/auth/AuthProvider";
import { useAlerts } from "~/lib/stores/alerts";
import { color, radius, TOUCH_TARGET } from "~/theme/tokens";

/* ---------------------------------------------------------------------------
   The Account tab — the website's rail account menu and its Account card,
   with everything a person manages about their Elyra account one tap away.

   Who is signed in first (the same identity the account sheet shows), then
   the account's parts — wallet, notifications, rules, connections,
   referrals — then the app's own settings, help and legal, and signing out.
--------------------------------------------------------------------------- */

interface Row {
  href: Href;
  label: string;
  note: string;
  icon: LucideIcon;
}

const ACCOUNT: Row[] = [
  { href: "/wallet", label: "Wallet", note: "Balance, assets and actions", icon: Wallet },
  { href: "/notification-settings", label: "Notifications", note: "Push, inbox and the updates you want", icon: Bell },
  { href: "/automation", label: "Alerts & automation", note: "The price rules Elyra watches for you", icon: Zap },
  { href: "/connections", label: "Connections", note: "Hyperliquid, Binance and Polymarket — read-only", icon: Link2 },
  { href: "/referrals", label: "Referrals", note: "Your invite link, points and who joined", icon: Gift },
  { href: "/dashboard", label: "Dashboard", note: "Holdings, network, account and linked logins", icon: LayoutDashboard },
];

const APP: Row[] = [
  { href: "/settings", label: "Settings", note: "Privacy, signing, defaults and about", icon: Settings },
  { href: "/legal", label: "Help & legal", note: "Support, policies, disclosures and licences", icon: CircleHelp },
];

function Rows({ rows, meta }: { rows: Row[]; meta?: Partial<Record<string, string>> }) {
  return (
    <View style={styles.links}>
      {rows.map((row, index) => (
        <Pressable
          key={row.label}
          onPress={() => router.push(row.href)}
          accessibilityRole="button"
          accessibilityHint={row.note}
          android_ripple={{ color: color["surface-hover"] }}
          style={[styles.link, index < rows.length - 1 && styles.ruled]}
        >
          <row.icon size={18} strokeWidth={1.5} color={color["text-secondary"]} />
          <View style={styles.flex}>
            <Text variant="body">{row.label}</Text>
            <Text variant="label" tone="muted">
              {row.note}
            </Text>
          </View>
          {meta?.[row.label] !== undefined && (
            <Text variant="data-sm" tone="secondary">
              {meta[row.label]}
            </Text>
          )}
          <ChevronRight size={16} strokeWidth={1.5} color={color["text-muted"]} />
        </Pressable>
      ))}
    </View>
  );
}

export default function AccountScreen() {
  const auth = useElyraAuth();
  const alerts = useAlerts();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const armed = alerts.alerts.filter((alert) => alert.triggeredAt === null).length;

  const signOut = async () => {
    if (busy) return;
    setBusy(true);
    setError(null);
    try {
      await auth.logout();
    } catch (failure) {
      setError(failure instanceof Error ? failure.message : "Signing out failed. Try again.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <Screen>
      <Panel style={styles.identity}>
        <AccountIdentity />
      </Panel>

      <Rows rows={ACCOUNT} meta={alerts.loading || alerts.error !== null ? {} : { "Alerts & automation": `${armed} armed` }} />
      <Rows rows={APP} />

      <View style={styles.links}>
        <Pressable
          onPress={() => void signOut()}
          accessibilityRole="button"
          accessibilityState={{ busy }}
          android_ripple={{ color: color["surface-hover"] }}
          style={styles.link}
        >
          <LogOut size={18} strokeWidth={1.5} color={color.negative} />
          <Text variant="body" tone="negative" style={styles.flex}>
            {busy ? "Signing out…" : "Sign out"}
          </Text>
        </Pressable>
      </View>
      {error !== null && (
        <Text variant="label" tone="negative" accessibilityLiveRegion="polite">
          {error}
        </Text>
      )}
    </Screen>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1, minWidth: 0 },
  identity: { padding: 16 },
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
    paddingVertical: 8,
  },
  ruled: {
    borderBottomWidth: StyleSheet.hairlineWidth * 2,
    borderBottomColor: color["border-subtle"],
  },
});
