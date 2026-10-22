import { forwardRef, useImperativeHandle, useRef, useState } from "react";
import { Pressable, StyleSheet, View } from "react-native";
import * as Clipboard from "expo-clipboard";
import * as Haptics from "expo-haptics";
import { router } from "expo-router";
import { ChevronRight, Copy, LogOut, UserRound, Wallet } from "lucide-react-native";
import { signInLabel } from "@/lib/account";
import { truncateMiddle } from "@/lib/format";
import { hyperliquidIcon } from "@/lib/market/tickerLogoData";
import { walletIdentity, walletStatus, type WalletTone } from "@/lib/wallet/status";
import { IconButton } from "~/components/ui/controls";
import { Divider } from "~/components/ui/layout";
import { CoinMark, Identicon } from "~/components/ui/marks";
import { BottomSheet, useToast, type BottomSheetHandle } from "~/components/ui/overlays";
import { Text } from "~/components/ui/Text";
import { useElyraAuth } from "~/lib/auth/AuthProvider";
import { useWalletDashboard } from "~/lib/stores/wallet";
import { color, radius, TOUCH_TARGET } from "~/theme/tokens";

/* ---------------------------------------------------------------------------
   The account sheet — the website's rail account menu, as a bottom sheet.

   Who is signed in and how, which network, whether the wallet read is
   healthy, the address with copy, and three ways on: account settings, the
   wallet, and signing out. Every line reads the same stores the rest of the
   app does, so the status here and on the wallet sheet cannot disagree.
--------------------------------------------------------------------------- */

const DOT: Record<WalletTone, string> = {
  positive: color.positive,
  caution: color.caution,
  negative: color.negative,
  muted: color["text-muted"],
};

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
  const wallet = useWalletDashboard();
  const toast = useToast();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useImperativeHandle(ref, () => ({ open: () => sheet.current?.present() }));

  const identity = walletIdentity(wallet);
  const status = walletStatus(wallet);
  const method = signInLabel(auth.account?.loginMethod ?? null);

  const go = (href: "/account" | "/wallet") => {
    sheet.current?.dismiss();
    router.push(href);
  };

  const copy = async (address: string) => {
    await Clipboard.setStringAsync(address);
    void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    toast("Copied the wallet address", "positive");
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
            <Text
              variant="mono-addr"
              style={styles.flex}
              accessibilityLabel={`Wallet address ${identity.address}`}
            >
              {truncateMiddle(identity.address, 6, 6)}
            </Text>
            <IconButton accessibilityLabel="Copy the wallet address" onPress={() => void copy(identity.address)}>
              <Copy size={16} strokeWidth={1.5} color={color["text-secondary"]} />
            </IconButton>
          </View>
        )}
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
  body: { paddingHorizontal: 16, paddingBottom: 16, gap: 14 },
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
  row: { minHeight: TOUCH_TARGET + 4, flexDirection: "row", alignItems: "center", gap: 12, paddingHorizontal: 16 },
  error: { paddingHorizontal: 16, paddingBottom: 8 },
});
