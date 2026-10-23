import { StyleSheet, View } from "react-native";
import * as Clipboard from "expo-clipboard";
import * as Haptics from "expo-haptics";
import { Copy } from "lucide-react-native";
import { signInLabel } from "@/lib/account";
import { truncateMiddle } from "@/lib/format";
import { hyperliquidIcon } from "@/lib/market/tickerLogoData";
import { walletIdentity, walletStatus, type WalletTone } from "@/lib/wallet/status";
import { IconButton } from "~/components/ui/controls";
import { CoinMark, Identicon } from "~/components/ui/marks";
import { useToast } from "~/components/ui/overlays";
import { Text } from "~/components/ui/Text";
import { useElyraAuth } from "~/lib/auth/AuthProvider";
import { useWalletDashboard } from "~/lib/stores/wallet";
import { color, radius } from "~/theme/tokens";

/* ---------------------------------------------------------------------------
   Who is signed in: the wallet's identicon, how they signed in, the network
   and whether the wallet read is healthy, and the address with copy. The
   account sheet and the Account tab both show it, from the same stores, so
   the two cannot describe different wallets.
--------------------------------------------------------------------------- */

const DOT: Record<WalletTone, string> = {
  positive: color.positive,
  caution: color.caution,
  negative: color.negative,
  muted: color["text-muted"],
};

export function AccountIdentity() {
  const auth = useElyraAuth();
  const wallet = useWalletDashboard();
  const toast = useToast();

  const identity = walletIdentity(wallet);
  const status = walletStatus(wallet);
  const method = signInLabel(auth.account?.loginMethod ?? null);

  const copy = async (address: string) => {
    await Clipboard.setStringAsync(address);
    void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    toast("Copied the wallet address", "positive");
  };

  return (
    <View style={styles.body}>
      <View style={styles.identity}>
        <Identicon identity={identity?.mark ?? null} size={44} />
        <View style={styles.flex}>
          <Text variant="h2">Your account</Text>
          {method !== null && (
            <Text variant="body-sm" tone="secondary">
              {method}
            </Text>
          )}
        </View>
      </View>

      <View style={styles.network}>
        <CoinMark symbol="SOL" fallbackLogo={hyperliquidIcon("SOL")} size={18} />
        <Text variant="body-sm" style={styles.flex}>
          {identity?.networkLabel ?? "Solana"}
        </Text>
        <View style={[styles.dot, { backgroundColor: DOT[status.tone] }]} />
        <Text variant="label" tone="secondary">
          {status.tone === "positive" ? "Wallet connected" : status.label}
        </Text>
      </View>

      {identity === null ? (
        <Text variant="body-sm" tone="secondary">
          {wallet.isLoading ? "Reading your wallet…" : "This account has no Solana wallet yet."}
        </Text>
      ) : (
        <View style={styles.address}>
          <Text variant="mono-addr" style={styles.flex} accessibilityLabel={`Wallet address ${identity.address}`}>
            {truncateMiddle(identity.address, 6, 6)}
          </Text>
          <IconButton accessibilityLabel="Copy the wallet address" onPress={() => void copy(identity.address)}>
            <Copy size={16} strokeWidth={1.5} color={color["text-secondary"]} />
          </IconButton>
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  body: { gap: 14 },
  identity: { flexDirection: "row", alignItems: "center", gap: 12 },
  network: { flexDirection: "row", alignItems: "center", gap: 8 },
  dot: { width: 6, height: 6, borderRadius: 3 },
  address: {
    flexDirection: "row",
    alignItems: "center",
    paddingLeft: 12,
    borderRadius: radius.control,
    borderWidth: 1,
    borderColor: color["border-subtle"],
  },
});
