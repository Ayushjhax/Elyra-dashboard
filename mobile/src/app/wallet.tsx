import { useRef, useState, type ComponentRef } from "react";
import { RefreshControl, ScrollView, StyleSheet, View } from "react-native";
import { useReducedMotion } from "react-native-reanimated";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { FlowBar, FlowTitle } from "~/components/shell/flow";
import { EvmSection } from "~/components/wallet/EvmSection";
import {
  WalletBalanceCard,
  WalletDetailsSection,
  WalletHoldings,
  WalletIdentityCard,
} from "~/components/wallet/WalletSections";
import { useWalletDashboard } from "~/lib/stores/wallet";
import { color } from "~/theme/tokens";

/* ---------------------------------------------------------------------------
   The wallet — the website's wallet drawer (components/wallet/
   WalletSheet.tsx), as one scrolling screen: who and where, the total with
   Fund wallet, the assets and any unverified mints, the EVM wallet on
   the EVM networks (EvmSection), and the wallet's details folded
   behind one row until asked for.

   It reads the same wallet store as every other balance, so opening it
   costs no request: the poll is already running for the header.

   Fund wallet opens "Add funds": a deposit to this address (Receive), or
   a card purchase through Privy's on-ramp (useFundSolanaWallet) with an
   explicit amount — see FundWallet. The app never renders a key itself:
   export is said where it happens (WalletDetailsSection).
--------------------------------------------------------------------------- */

export default function WalletScreen() {
  const wallet = useWalletDashboard();
  const insets = useSafeAreaInsets();
  const reduced = useReducedMotion();
  const scroll = useRef<ComponentRef<typeof ScrollView>>(null);
  const detailsY = useRef(0);
  /* With no wallet there is nothing above the details but the notice, so
     Disconnect starts in view. */
  const [details, setDetails] = useState(false);
  const detailsOpen = details || (wallet.address === null && !wallet.isLoading);

  return (
    <View style={styles.screen}>
      <FlowBar closeLabel="Close wallet" onRefresh={wallet.refetch} refreshing={wallet.refreshing} round />
      <ScrollView
        ref={scroll}
        contentContainerStyle={[styles.content, { paddingBottom: insets.bottom + 32 }]}
        refreshControl={
          <RefreshControl
            refreshing={false}
            onRefresh={wallet.refetch}
            tintColor={color.accent}
            colors={[color.accent]}
            progressBackgroundColor={color["surface-raised"]}
          />
        }
      >
        <FlowTitle title="Wallet" />
        <WalletIdentityCard wallet={wallet} />
        {wallet.address !== null && (
          <>
            <WalletBalanceCard wallet={wallet} />
            <WalletHoldings wallet={wallet} />
          </>
        )}
        <EvmSection />
        <View onLayout={(event) => (detailsY.current = event.nativeEvent.layout.y)}>
          <WalletDetailsSection
            wallet={wallet}
            open={detailsOpen}
            onToggle={(open) => {
              setDetails(open);
              /* After the opened section has laid out. */
              if (open) setTimeout(() => scroll.current?.scrollTo({ y: Math.max(0, detailsY.current - 12), animated: !reduced }), 60);
            }}
          />
        </View>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: color["surface-base"] },
  content: { paddingHorizontal: 20, paddingTop: 4, gap: 16 },
});
