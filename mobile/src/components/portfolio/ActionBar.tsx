import { Pressable, StyleSheet, View } from "react-native";
import { router } from "expo-router";
import { ArrowLeftRight, ArrowUpRight, QrCode, Send, type LucideIcon } from "lucide-react-native";
import { Button } from "~/components/ui/controls";
import { InfoTip } from "~/components/ui/InfoTip";
import { Text } from "~/components/ui/Text";
import { useWalletDashboard } from "~/lib/stores/wallet";
import { color, radius, TOUCH_TARGET } from "~/theme/tokens";

/* ---------------------------------------------------------------------------
   The four capital actions — the website's AssetActionBar. Receive, and
   the three that sign in the wallet: Swap, Transfer, Withdraw. An action
   that cannot be used says why rather than going quiet.
--------------------------------------------------------------------------- */

function CapitalAction({
  icon: Icon,
  label,
  primary = false,
  compact = false,
  reason,
  onPress,
}: {
  icon: LucideIcon;
  label: string;
  primary?: boolean;
  compact?: boolean;
  /** Why it cannot be used right now. Null when it can. */
  reason: string | null;
  onPress: () => void;
}) {
  if (compact) {
    return (
      <Pressable
        onPress={onPress}
        disabled={reason !== null}
        accessibilityRole="button"
        accessibilityLabel={reason === null ? label : `${label} — ${reason}`}
        accessibilityState={{ disabled: reason !== null }}
        style={({ pressed }) => [styles.compactAction, pressed && styles.pressed]}
      >
        <View style={[styles.actionIcon, primary && reason === null && styles.primaryIcon]}>
          <Icon size={20} strokeWidth={1.5} color={reason !== null ? color["text-muted"] : primary ? color["text-on-accent"] : color["text-primary"]} />
        </View>
        <Text variant="label" tone={reason !== null ? "muted" : "primary"} style={styles.actionLabel}>{label}</Text>
      </Pressable>
    );
  }
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

export function ActionBar({ compact = false }: { compact?: boolean }) {
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
        <CapitalAction icon={QrCode} label="Receive" compact={compact} primary={!compact || !funded} reason={wallet.address === null ? "Link a Solana wallet to receive into." : null} onPress={() => router.push("/receive")} />
        <CapitalAction icon={ArrowLeftRight} label="Swap" compact={compact} primary={compact && funded} reason={signReason} onPress={() => router.push("/swap")} />
        <CapitalAction icon={Send} label="Transfer" compact={compact} reason={signReason} onPress={() => router.push("/transfer")} />
        <CapitalAction
          icon={ArrowUpRight}
          label="Withdraw"
          compact={compact}
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
  compactAction: { flex: 1, minHeight: 80, alignItems: "center", justifyContent: "center", gap: 8, borderRadius: radius.card },
  actionIcon: { width: TOUCH_TARGET, height: TOUCH_TARGET, borderRadius: radius.sheet, backgroundColor: color["surface-raised"], borderWidth: 1, borderColor: color["border-subtle"], alignItems: "center", justifyContent: "center" },
  primaryIcon: { backgroundColor: color.accent, borderColor: color.accent },
  actionLabel: { alignSelf: "stretch", textAlign: "center" },
  pressed: { backgroundColor: color["surface-hover"] },
  reason: { flexDirection: "row", alignItems: "center", gap: 4 },
});
