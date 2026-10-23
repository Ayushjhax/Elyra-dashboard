import { StyleSheet, View } from "react-native";
import { router } from "expo-router";
import { ArrowLeftRight, ArrowUpRight, QrCode, Send, type LucideIcon } from "lucide-react-native";
import { Button } from "~/components/ui/controls";
import { InfoTip } from "~/components/ui/InfoTip";
import { Text } from "~/components/ui/Text";
import { useWalletDashboard } from "~/lib/stores/wallet";
import { color, TOUCH_TARGET } from "~/theme/tokens";

/* ---------------------------------------------------------------------------
   The four capital actions — the website's AssetActionBar. Receive, and
   the three that sign in the wallet: Swap, Transfer, Withdraw. An action
   that cannot be used says why rather than going quiet.
--------------------------------------------------------------------------- */

function CapitalAction({
  icon: Icon,
  label,
  primary = false,
  reason,
  onPress,
}: {
  icon: LucideIcon;
  label: string;
  primary?: boolean;
  /** Why it cannot be used right now. Null when it can. */
  reason: string | null;
  onPress: () => void;
}) {
  return (
    <View style={styles.action}>
      <Button
        label={label}
        variant={primary ? "accent" : "quiet"}
        disabled={reason !== null}
        accessibilityLabel={reason === null ? label : `${label} — ${reason}`}
        icon={<Icon size={16} strokeWidth={1.5} color={reason !== null ? color["text-muted"] : primary ? color["text-on-accent"] : color["text-primary"]} />}
        onPress={onPress}
      />
    </View>
  );
}

export function ActionBar() {
  const wallet = useWalletDashboard();
  /* A wallet with nothing counted in it has nothing to move yet. */
  const funded = (wallet.snapshot?.sol ?? 0) > 0 || (wallet.snapshot?.tokenCount ?? 0) > 0;
  const signReason =
    wallet.address === null
      ? "Link a Solana wallet first."
      : wallet.snapshot === null
        ? wallet.isLoading
          ? "Reading the wallet…"
          : "The wallet couldn't be read."
        : !funded
          ? "The wallet holds nothing to move yet — receive first."
          : null;

  return (
    <View style={styles.actionsBlock}>
      <View style={styles.actions}>
        <CapitalAction icon={QrCode} label="Receive" primary reason={wallet.address === null ? "Link a Solana wallet to receive into." : null} onPress={() => router.push("/receive")} />
        <CapitalAction icon={ArrowLeftRight} label="Swap" reason={signReason} onPress={() => router.push("/swap")} />
        <CapitalAction icon={Send} label="Transfer" reason={signReason} onPress={() => router.push("/transfer")} />
        <CapitalAction
          icon={ArrowUpRight}
          label="Withdraw"
          reason={signReason}
          onPress={() => router.push({ pathname: "/transfer", params: { intent: "withdraw" } })}
        />
      </View>
      {signReason !== null && wallet.address !== null && (
        <View style={styles.reason}>
          <Text variant="label" tone="muted" style={styles.flex}>
            Swap, Transfer and Withdraw: {signReason}
          </Text>
          <InfoTip text="Each of these signs in your wallet. Nothing is sent without your signature." />
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  actionsBlock: { gap: 8 },
  actions: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  action: { flexGrow: 1, flexBasis: "45%", minHeight: TOUCH_TARGET },
  reason: { flexDirection: "row", alignItems: "center", gap: 4 },
});
