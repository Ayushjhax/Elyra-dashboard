import { Pressable, StyleSheet, View } from "react-native";
import {
  ArrowDown,
  ArrowLeftRight,
  ChevronRight,
  Image as ImageIcon,
  Layers,
  RefreshCw,
  Send,
  UserRound,
  type LucideIcon,
} from "lucide-react-native";
import { formatRelativeTime } from "@/lib/format";
import { txExplorerUrl } from "@/lib/solana/address";
import type { TxKind } from "@/lib/wallet/summarise";
import type { WalletActivity } from "@/lib/wallet/types";
import { StatusText } from "~/components/shell/surface";
import { Text } from "~/components/ui/Text";
import { openExternal } from "~/components/wallet/parts";
import { fontFamily } from "~/theme/fonts";
import { color } from "~/theme/tokens";

/* ---------------------------------------------------------------------------
   One wallet transaction in a short list — the dashboard's recent
   activity: what it did (lib/wallet/summarise.ts), its real state
   (pending, confirmed or failed, in words as well as colour) and when. It
   opens on Solscan, the transaction's real detail page.
--------------------------------------------------------------------------- */

const KIND_ICON: Record<TxKind, LucideIcon> = {
  receive: ArrowDown,
  send: Send,
  swap: RefreshCw,
  stake: Layers,
  unstake: Layers,
  nft: ImageIcon,
  account: UserRound,
  other: ArrowLeftRight,
};

const STATUS_WORD = { confirmed: "Confirmed", pending: "Pending", failed: "Failed" } as const;
const STATUS_TONE = { confirmed: "positive", pending: "caution", failed: "negative" } as const;

/** One transaction: what it did, its real state and when — opening on Solscan. */
export function ActivityRow({ item, now, first }: { item: WalletActivity; now: number; first: boolean }) {
  const Icon = KIND_ICON[item.summary?.kind ?? "other"];
  const title = item.summary?.title ?? (item.status === "failed" ? "Transaction failed" : "Transaction");
  const when = item.at === null ? "processing" : formatRelativeTime(item.at, now);
  return (
    <Pressable
      onPress={() => openExternal(txExplorerUrl(item.signature))}
      accessibilityRole="link"
      accessibilityLabel={`${title}. ${STATUS_WORD[item.status]}, ${when}`}
      accessibilityHint="Opens the transaction on Solscan"
      android_ripple={{ color: color["surface-hover"] }}
      style={({ pressed }) => [styles.tx, !first && styles.ruled, pressed && styles.pressed]}
    >
      <View style={styles.txIcon}>
        <Icon size={22} strokeWidth={1.5} color={color["text-primary"]} />
      </View>
      <View style={styles.flex}>
        <Text variant="body" numberOfLines={2} style={styles.txTitle}>
          {title}
        </Text>
        <View style={styles.inline}>
          <StatusText tone={STATUS_TONE[item.status]} label={STATUS_WORD[item.status]} size="sm" />
          <Text variant="body-sm" tone="secondary" style={styles.txWhen}>
            · {when}
          </Text>
        </View>
      </View>
      <ChevronRight size={22} strokeWidth={1.5} color={color["text-secondary"]} />
    </Pressable>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1, minWidth: 0 },
  inline: { flexDirection: "row", alignItems: "center", flexWrap: "wrap" },
  pressed: { backgroundColor: color["surface-hover"] },
  ruled: { borderTopWidth: StyleSheet.hairlineWidth * 2, borderTopColor: color["border-subtle"] },
  tx: { flexDirection: "row", alignItems: "center", gap: 14, minHeight: 72, paddingVertical: 10 },
  txIcon: {
    width: 48,
    height: 48,
    borderRadius: 24,
    borderWidth: 1,
    borderColor: color["border-strong"],
    alignItems: "center",
    justifyContent: "center",
  },
  txTitle: { fontFamily: fontFamily("sans", 500), fontSize: 16, lineHeight: 22 },
  txWhen: { fontSize: 14, lineHeight: 19, marginLeft: 6 },
});
