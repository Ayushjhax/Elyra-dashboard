import { useRef } from "react";
import { StyleSheet, View } from "react-native";
import { router } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Bell, Search } from "lucide-react-native";
import { walletIdentity } from "@/lib/wallet/status";
import { AccountSheet, type AccountSheetHandle } from "~/components/account/AccountSheet";
import { IconButton } from "~/components/ui/controls";
import { ElyraMark, Identicon } from "~/components/ui/marks";
import { Text } from "~/components/ui/Text";
import { useWalletDashboard } from "~/lib/stores/wallet";
import { color } from "~/theme/tokens";
import { useInbox } from "~/lib/notifications/stores";

/* ---------------------------------------------------------------------------
   The header every tab shares: the mark and the screen's name, search, the
   notifications bell (with the unread badge once the inbox exists), and the
   account's identicon, which opens the account sheet.

   The identicon is drawn from the network and the full address, and is the
   neutral mark until the wallet's address is known.
--------------------------------------------------------------------------- */

export function AppHeader({ title }: { title: string }) {
  const unread = useInbox().unread;
  const insets = useSafeAreaInsets();
  const wallet = useWalletDashboard();
  const account = useRef<AccountSheetHandle>(null);
  const identity = walletIdentity(wallet);
  return (
    <View style={[styles.header, { paddingTop: insets.top }]}>
      <View style={styles.brand}>
        <ElyraMark size={28} />
        <Text variant="h1" accessibilityRole="header" numberOfLines={1}>
          {title}
        </Text>
      </View>
      <IconButton accessibilityLabel="Search" onPress={() => router.push("/search")}>
        <Search size={20} strokeWidth={1.5} color={color["text-secondary"]} />
      </IconButton>
      <IconButton
        accessibilityLabel={unread > 0 ? `Notifications, ${unread} unread` : "Notifications"}
        onPress={() => router.push("/notifications")}
      >
        <Bell size={20} strokeWidth={1.5} color={color["text-secondary"]} />
        {unread > 0 && (
          <View style={styles.badge}>
            <Text variant="data-sm" tone="on-accent" allowFontScaling={false} style={styles.badgeText}>
              {unread > 99 ? "99+" : String(unread)}
            </Text>
          </View>
        )}
      </IconButton>
      <IconButton accessibilityLabel="Open account menu" onPress={() => account.current?.open()}>
        <Identicon identity={identity?.mark ?? null} size={30} />
      </IconButton>
      <AccountSheet ref={account} />
    </View>
  );
}

const styles = StyleSheet.create({
  header: {
    flexDirection: "row",
    alignItems: "center",
    paddingLeft: 16,
    paddingRight: 4,
    paddingBottom: 4,
    backgroundColor: color["surface-base"],
    borderBottomColor: color["border-subtle"],
    borderBottomWidth: StyleSheet.hairlineWidth * 2,
  },
  brand: { flex: 1, flexDirection: "row", alignItems: "center", gap: 10 },
  badge: {
    position: "absolute",
    top: 8,
    right: 6,
    minWidth: 18,
    height: 18,
    borderRadius: 9,
    paddingHorizontal: 4,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: color.accent,
  },
  badgeText: { fontSize: 10, lineHeight: 12 },
});
