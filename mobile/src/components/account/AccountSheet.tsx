import { forwardRef, useImperativeHandle, useRef } from "react";
import { StyleSheet, View } from "react-native";
import { router } from "expo-router";
import { UserRound, Wallet } from "lucide-react-native";
import { AccountIdentityCard } from "~/components/account/Identity";
import { AccountMenuRow, SignOutRow } from "~/components/account/menu";
import { BottomSheet, type BottomSheetHandle } from "~/components/ui/overlays";
import { color } from "~/theme/tokens";

/* ---------------------------------------------------------------------------
   The account sheet — the website's rail account menu, as a bottom sheet
   over whatever screen the avatar was pressed on (which keeps its place).

   Who is signed in and how, which network, whether the wallet read is
   healthy, the address with copy, and three ways on: account settings, the
   wallet, and signing out. Every line reads the same stores the rest of the
   app does, so the status here and on the wallet screen cannot disagree.
   The backdrop, a swipe down, the close button and Android's back all
   dismiss it.
--------------------------------------------------------------------------- */

export interface AccountSheetHandle {
  open: () => void;
}

export const AccountSheet = forwardRef<AccountSheetHandle>(function AccountSheet(_props, ref) {
  const sheet = useRef<BottomSheetHandle>(null);

  useImperativeHandle(ref, () => ({ open: () => sheet.current?.present() }));

  const go = (href: "/account" | "/wallet") => {
    sheet.current?.dismiss();
    router.push(href);
  };

  return (
    <BottomSheet ref={sheet} title="Your account" display>
      <View style={styles.identity}>
        <AccountIdentityCard />
      </View>
      <View style={styles.rule} />
      <View style={styles.rows}>
        <AccountMenuRow icon={UserRound} label="Account settings" first onPress={() => go("/account")} />
        <AccountMenuRow icon={Wallet} label="Open wallet" onPress={() => go("/wallet")} />
      </View>
      <View style={styles.rule} />
      <SignOutRow framed={false} onDone={() => sheet.current?.dismiss()} />
    </BottomSheet>
  );
});

const styles = StyleSheet.create({
  identity: { paddingHorizontal: 20, paddingTop: 4, paddingBottom: 20 },
  rows: { paddingHorizontal: 0 },
  rule: { height: StyleSheet.hairlineWidth * 2, backgroundColor: color["border-subtle"] },
});
