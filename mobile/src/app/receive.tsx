import { ScrollView, Share, StyleSheet, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Copy, ExternalLink, QrCode as QrIcon, Share2 } from "lucide-react-native";
import { hyperliquidIcon } from "@/lib/market/tickerLogoData";
import { accountExplorerUrl } from "@/lib/solana/address";
import { CLUSTER_LABEL, EXPECTED_CLUSTER } from "@/lib/solana/cluster";
import { Button } from "~/components/ui/controls";
import { CoinMark, QrCode } from "~/components/ui/marks";
import { Text } from "~/components/ui/Text";
import { Notice, openExternal, SheetHeader, useCopy } from "~/components/wallet/parts";
import { useElyraAuth } from "~/lib/auth/AuthProvider";
import { useWalletDashboard } from "~/lib/stores/wallet";
import { color, radius } from "~/theme/tokens";

/* ---------------------------------------------------------------------------
   Where to send funds — the website's ReceiveDialog.

   One destination, named outright: the account's Solana wallet, on the
   cluster the node reported. The address is shown whole, never truncated,
   with copy and share beside the code, and the network is said in words —
   tokens sent from another network can be lost.
--------------------------------------------------------------------------- */

export default function ReceiveScreen() {
  const auth = useElyraAuth();
  const wallet = useWalletDashboard();
  const copy = useCopy();
  const insets = useSafeAreaInsets();
  const address = wallet.address;
  const network = CLUSTER_LABEL[wallet.cluster ?? EXPECTED_CLUSTER];
  const offMainnet = wallet.cluster !== null && wallet.cluster !== EXPECTED_CLUSTER;
  const embedded = auth.account?.solanaIsEmbedded === true;

  return (
    <View style={styles.screen}>
      <SheetHeader title="Receive" icon={QrIcon} closeLabel="Close receive" />
      {address === null ? (
        <Text variant="body-sm" tone="secondary" style={styles.empty}>
          This account has no Solana wallet to receive into. Link one from your account to get an address.
        </Text>
      ) : (
        <ScrollView contentContainerStyle={[styles.body, { paddingBottom: insets.bottom + 24 }]}>
          <Text variant="body-sm" tone="secondary">
            Send SOL or Solana tokens to this address.
          </Text>

          <View style={styles.network}>
            <CoinMark symbol="SOL" logo={hyperliquidIcon("SOL")} size={24} />
            <View style={styles.flex}>
              <Text variant="body-sm">{network}</Text>
              <Text variant="label" tone="secondary">
                {embedded ? "Your Elyra wallet" : "Your linked Solana wallet"}
              </Text>
            </View>
          </View>

          <View style={styles.qr}>
            <QrCode value={address} label="QR code of the wallet address" size={208} />
          </View>

          {/* Whole and selectable: a receiving address is never shown truncated. */}
          <Text variant="mono-addr" selectable style={styles.address}>
            {address}
          </Text>

          <View style={styles.buttons}>
            <View style={styles.flex}>
              <Button
                label="Copy address"
                icon={<Copy size={16} strokeWidth={1.5} color={color["text-primary"]} />}
                onPress={() => void copy(address, "wallet address")}
              />
            </View>
            <View style={styles.flex}>
              <Button
                label="Share"
                icon={<Share2 size={16} strokeWidth={1.5} color={color["text-primary"]} />}
                onPress={() => void Share.share({ message: address, title: "My Solana address" })}
              />
            </View>
          </View>

          <Notice tone={offMainnet ? "negative" : "caution"}>
            {offMainnet
              ? `This wallet is being read on ${network}. Funds sent on mainnet will not show here until the server reads mainnet.`
              : `Solana mainnet only. Tokens sent from another network, such as Ethereum, can be lost.`}
          </Notice>

          <Button
            label="View on Solscan"
            variant="ghost"
            size="sm"
            icon={<ExternalLink size={14} strokeWidth={1.5} color={color["text-secondary"]} />}
            onPress={() => openExternal(accountExplorerUrl(address, wallet.cluster))}
          />
        </ScrollView>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: color["surface-base"] },
  empty: { padding: 20 },
  body: { padding: 20, gap: 16 },
  flex: { flex: 1 },
  network: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    borderWidth: 1,
    borderColor: color["border-subtle"],
    borderRadius: radius.control,
    backgroundColor: color["surface-raised"],
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
  qr: { alignItems: "center", paddingVertical: 8 },
  address: {
    textAlign: "center",
    borderWidth: 1,
    borderColor: color["border-subtle"],
    borderRadius: radius.control,
    paddingHorizontal: 12,
    paddingVertical: 10,
  },
  buttons: { flexDirection: "row", gap: 8 },
});
