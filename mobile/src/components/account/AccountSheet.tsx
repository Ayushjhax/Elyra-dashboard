import { forwardRef, useImperativeHandle, useRef, useState } from "react";
import { Pressable, StyleSheet, View } from "react-native";
import { router } from "expo-router";
import { ChevronRight, LogOut, UserRound, Wallet } from "lucide-react-native";
import { AccountIdentity } from "~/components/account/Identity";
import { Divider } from "~/components/ui/layout";
import { BottomSheet, type BottomSheetHandle } from "~/components/ui/overlays";
import { Text } from "~/components/ui/Text";
import { useElyraAuth } from "~/lib/auth/AuthProvider";
import { color, TOUCH_TARGET } from "~/theme/tokens";

/* ---------------------------------------------------------------------------
   The account sheet — the website's rail account menu, as a bottom sheet.

   Who is signed in and how, which network, whether the wallet read is
   healthy, the address with copy, and three ways on: account settings, the
   wallet, and signing out. Every line reads the same stores the rest of the
   app does, so the status here and on the wallet sheet cannot disagree.
--------------------------------------------------------------------------- */

export interface AccountSheetHandle {
  open: () => void;
}

function Row({ icon, label, onPress, tone = "primary" }: { icon: React.ReactNode; label: string; onPress: () => void; tone?: "primary" | "negative" }) {
  return (
    <Pressable onPress={onPress} accessibilityRole="button" style={styles.row} android_ripple={{ color: color["surface-hover"] }}>
      {icon}
      <Text variant="body" tone={tone} style={styles.flex}>
        {label}
      </Text>
      <ChevronRight size={16} strokeWidth={1.5} color={tone === "negative" ? color.negative : color["text-muted"]} />
    </Pressable>
  );
}

export const AccountSheet = forwardRef<AccountSheetHandle>(function AccountSheet(_props, ref) {
  const sheet = useRef<BottomSheetHandle>(null);
  const auth = useElyraAuth();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useImperativeHandle(ref, () => ({ open: () => sheet.current?.present() }));

  const go = (href: "/account" | "/wallet") => {
    sheet.current?.dismiss();
    router.push(href);
  };

  const signOut = async () => {
    if (busy) return;
    setBusy(true);
    setError(null);
    try {
      await auth.logout();
      sheet.current?.dismiss();
    } catch (failure) {
      setError(failure instanceof Error ? failure.message : "Signing out failed. Try again.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <BottomSheet ref={sheet} title="Your account">
      <View style={styles.body}>
        <AccountIdentity />
      </View>

      <Divider />
      <Row icon={<UserRound size={18} strokeWidth={1.5} color={color["text-secondary"]} />} label="Account settings" onPress={() => go("/account")} />
      <Row icon={<Wallet size={18} strokeWidth={1.5} color={color["text-secondary"]} />} label="Open wallet" onPress={() => go("/wallet")} />
      <Divider />
      <Row
        icon={<LogOut size={18} strokeWidth={1.5} color={color.negative} />}
        label={busy ? "Signing out…" : "Sign out"}
        tone="negative"
        onPress={() => void signOut()}
      />
      {error !== null && (
        <Text variant="label" tone="negative" style={styles.error} accessibilityLiveRegion="polite">
          {error}
        </Text>
      )}
    </BottomSheet>
  );
});

const styles = StyleSheet.create({
  flex: { flex: 1 },
  body: { paddingHorizontal: 16, paddingBottom: 16 },
  row: { minHeight: TOUCH_TARGET + 4, flexDirection: "row", alignItems: "center", gap: 12, paddingHorizontal: 16 },
  error: { paddingHorizontal: 16, paddingBottom: 8 },
});
