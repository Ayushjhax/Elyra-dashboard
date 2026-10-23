import { ScrollView, StyleSheet, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Wallet } from "lucide-react-native";
import { SheetHeader } from "~/components/wallet/parts";
import {
  FundWallet,
  WalletActions,
  WalletAssets,
  WalletIdentity,
  WalletSync,
  WalletTotal,
} from "~/components/wallet/WalletSections";
import { useWalletDashboard } from "~/lib/stores/wallet";
import { color } from "~/theme/tokens";

/* ---------------------------------------------------------------------------
   The wallet sheet — the website's wallet drawer (components/wallet/
   WalletSheet.tsx), full height on a phone: it holds an address, a token
   list of unbounded length and several actions.

   It reads the same wallet store as every other balance, so opening it
   costs no request: the poll is already running for the header.

   Fund wallet is Privy's own on-ramp (useFundSolanaWallet, which this
   version of @privy-io/expo provides). Export is not offered here: this
   version has no export flow, and the app never renders a key itself.
--------------------------------------------------------------------------- */

export default function WalletScreen() {
  const wallet = useWalletDashboard();
  const insets = useSafeAreaInsets();
  return (
    <View style={styles.screen}>
      <SheetHeader title="Wallet" icon={Wallet} closeLabel="Close wallet" onRefresh={wallet.refetch} refreshing={wallet.refreshing} />
      <ScrollView contentContainerStyle={{ paddingBottom: insets.bottom + 24 }}>
        <WalletIdentity wallet={wallet} />
        {wallet.address !== null && (
          <>
            <WalletTotal wallet={wallet} />
            <FundWallet address={wallet.address} />
            <WalletAssets wallet={wallet} />
          </>
        )}
        <WalletActions wallet={wallet} />
        {wallet.address !== null && <WalletSync wallet={wallet} />}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: color["surface-base"] },
});
