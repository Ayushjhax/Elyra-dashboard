import { StyleSheet, View } from "react-native";
import { router, type Href } from "expo-router";
import {
  Bell,
  CircleHelp,
  Gift,
  LayoutGrid,
  Link2,
  Settings,
  Wallet,
  Zap,
  type LucideIcon,
} from "lucide-react-native";
import { AccountIdentityCard } from "~/components/account/Identity";
import { AccountMenuGroup, AccountMenuRow, SignOutRow } from "~/components/account/menu";
import { FlowTitle, Pill } from "~/components/shell/flow";
import { Screen } from "~/components/ui/layout";
import { useAlerts } from "~/lib/stores/alerts";
import { color, radius } from "~/theme/tokens";

/* ---------------------------------------------------------------------------
   The Account tab — the website's rail account menu and its Account card,
   with everything a person manages about their Elyra account one tap away.

   Who is signed in first (the same identity the account sheet shows), then
   the account's parts — wallet, notifications, rules, connections,
   referrals, the dashboard — then the app's own settings, help and legal,
   and signing out, apart in muted coral.

   Two rows carry a badge. The armed count is the account's live rules (the
   same store Alerts & automation reads), shown once the read has landed and
   only when there is one to count. "Read-only" is always true of
   connections: Elyra reads venues and places, closes or cancels nothing.
--------------------------------------------------------------------------- */

interface Row {
  href: Href;
  label: string;
  note: string;
  icon: LucideIcon;
}

const ACCOUNT: Row[] = [
  { href: "/wallet", label: "Wallet", note: "Balances, assets and actions", icon: Wallet },
  { href: "/notification-settings", label: "Notifications", note: "Inbox and push preferences", icon: Bell },
  { href: "/automation", label: "Alerts & automation", note: "Your price rules", icon: Zap },
  { href: "/connections", label: "Connections", note: "Hyperliquid, Binance and Polymarket", icon: Link2 },
  { href: "/referrals", label: "Referrals", note: "Invite link, points and friends", icon: Gift },
  { href: "/dashboard", label: "Dashboard", note: "Holdings, network and linked logins", icon: LayoutGrid },
];

const APP: Row[] = [
  { href: "/settings", label: "Settings", note: "Privacy, signing, defaults and about", icon: Settings },
  { href: "/legal", label: "Help & legal", note: "Support, policies, disclosures and licences", icon: CircleHelp },
];

function Rows({ rows, badges = {} }: { rows: Row[]; badges?: Partial<Record<string, React.ReactNode>> }) {
  return (
    <AccountMenuGroup>
      {rows.map((row, index) => (
        <AccountMenuRow
          key={row.label}
          icon={row.icon}
          label={row.label}
          note={row.note}
          badge={badges[row.label]}
          first={index === 0}
          onPress={() => router.push(row.href)}
        />
      ))}
    </AccountMenuGroup>
  );
}

export default function AccountScreen() {
  const alerts = useAlerts();
  const armed = alerts.alerts.filter((alert) => alert.triggeredAt === null).length;
  const counted = !alerts.loading && alerts.error === null;

  return (
    <Screen contentStyle={styles.content}>
      <FlowTitle title="Account" />
      <View style={styles.identity}>
        <AccountIdentityCard />
      </View>

      <Rows
        rows={ACCOUNT}
        badges={{
          "Alerts & automation":
            counted && armed > 0 ? (
              <Pill tone="accent" accessibilityLabel={`${armed} armed ${armed === 1 ? "rule" : "rules"}`}>
                {`${armed} armed`}
              </Pill>
            ) : undefined,
          Connections: <Pill accessibilityLabel="Read-only">Read-only</Pill>,
        }}
      />
      <Rows rows={APP} />
      <SignOutRow />
    </Screen>
  );
}

const styles = StyleSheet.create({
  content: { paddingHorizontal: 20, paddingTop: 4, paddingBottom: 32, gap: 16 },
  identity: {
    padding: 20,
    borderRadius: radius.sheet,
    borderWidth: 1,
    borderColor: color["border-subtle"],
    backgroundColor: color["surface-panel"],
  },
});
