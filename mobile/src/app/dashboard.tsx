import { useState } from "react";
import { StyleSheet, View } from "react-native";
import { router } from "expo-router";
import { useLinkWithPasskey } from "@privy-io/expo/passkey";
import { ArrowRight, AtSign, BadgeCheck, Copy, Fingerprint, KeyRound, Mail, Phone, RefreshCw, Wallet, type LucideIcon } from "lucide-react-native";
import { methodLabel, type LinkedAccountSummary } from "@/lib/account";
import { formatAge, formatPriceUsd, formatQty, formatRelativeTime, formatUsd, truncateMiddle } from "@/lib/format";
import { hyperliquidIcon } from "@/lib/market/tickerLogoData";
import { CLUSTER_LABEL } from "@/lib/solana/cluster";
import { walletStatus } from "@/lib/wallet/status";
import { Block, DetailScreen } from "~/components/portfolio/parts";
import { Button, IconButton } from "~/components/ui/controls";
import { InfoTip } from "~/components/ui/InfoTip";
import { Skeleton } from "~/components/ui/layout";
import { useToast } from "~/components/ui/overlays";
import { CoinMark } from "~/components/ui/marks";
import { Text } from "~/components/ui/Text";
import { useCopy } from "~/components/wallet/parts";
import { useElyraAuth } from "~/lib/auth/AuthProvider";
import { useBalancesHidden } from "~/lib/store";
import { useWalletActivity } from "~/lib/stores/activity";
import { useWalletDashboard } from "~/lib/stores/wallet";
import { APP_IDENTITY } from "~/lib/wallet/mwa";
import { useMinute, useSecond } from "~/lib/useClock";
import { color, radius } from "~/theme/tokens";

/* ---------------------------------------------------------------------------
   The account dashboard — the website's DashboardDrawer: the wallet's
   holdings in one figure, the network it is read from, the account itself
   (user id, when it was created, how it signs in, every linked account),
   and the latest transactions.

   Reached from the Account tab. Every figure reads the same stores the rest
   of the app does.
--------------------------------------------------------------------------- */

const TONE = { positive: color.positive, caution: color.caution, negative: color.negative, muted: color["text-muted"] };
const METHOD_ICON: Record<string, LucideIcon> = { email: Mail, phone: Phone, passkey: KeyRound, wallet: Wallet };

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <View style={styles.row}>
      <Text variant="body-sm" tone="secondary">
        {label}
      </Text>
      <View style={styles.rowValue}>{children}</View>
    </View>
  );
}

function describe(entry: LinkedAccountSummary): { label: string; display: string | null; value: string | null; mono: boolean } {
  if (entry.type === "wallet" || entry.type === "smart_wallet") {
    const chain = entry.chainType === "ethereum" ? "Ethereum" : entry.chainType === "solana" ? "Solana" : null;
    const label = entry.type === "smart_wallet" ? "Smart wallet" : chain === null ? "Wallet" : `${chain} wallet`;
    return { label, display: entry.detail === null ? null : truncateMiddle(entry.detail, 6, 6), value: entry.detail, mono: true };
  }
  return { label: methodLabel(entry.type), display: entry.detail, value: entry.detail, mono: false };
}

export default function DashboardScreen() {
  const auth = useElyraAuth();
  const wallet = useWalletDashboard();
  const activity = useWalletActivity(5);
  const hidden = useBalancesHidden();
  const copy = useCopy();
  const now = useSecond();
  const minute = useMinute();
  const snapshot = wallet.snapshot;
  const status = walletStatus(wallet);
  const account = auth.account;
  const toast = useToast();
  const [addingPasskey, setAddingPasskey] = useState(false);
  /* A passkey added here is how this account signs in with one later — the
     sign-in screen's passkey sign-up always makes a new account instead. */
  const passkey = useLinkWithPasskey();
  const addPasskey = async () => {
    setAddingPasskey(true);
    try {
      await passkey.linkWithPasskey({ relyingParty: APP_IDENTITY.uri });
      toast("Passkey added. Use it to sign in on this phone.", "positive");
    } catch {
      toast("No passkey was added.", "negative");
    } finally {
      setAddingPasskey(false);
    }
  };
  const uncounted = snapshot === null ? 0 : snapshot.uncounted.unpriced + snapshot.uncounted.unverified;

  return (
    <DetailScreen
      title="Dashboard"
      refreshing={wallet.refreshing}
      onRefresh={() => {
        wallet.refetch();
        activity.refetch();
      }}
    >
      {/* ---- holdings ---- */}
      <Block label="Holdings">
        <View style={styles.between}>
          <Text variant="h2">Holdings</Text>
          {snapshot !== null && (
            <Text variant="label" tone="secondary">
              {snapshot.tokenCount} {snapshot.tokenCount === 1 ? "token" : "tokens"}
            </Text>
          )}
        </View>
        <Text variant="label" tone="secondary">
          Total balance
        </Text>
        {snapshot === null ? (
          wallet.isLoading ? (
            <Skeleton width={150} height={32} />
          ) : (
            <View style={styles.inline}>
              <Text variant="body-sm" tone="negative" style={styles.flex}>
                {wallet.error ?? "The balance could not be read."}
              </Text>
              <Button label={wallet.refreshing ? "Trying…" : "Try again"} size="sm" onPress={wallet.refetch} />
            </View>
          )
        ) : snapshot.usdValue === null ? (
          <Text variant="body-sm" tone="muted">
            — No SOL price right now, so the total can&apos;t be valued. Balances below are exact.
          </Text>
        ) : (
          <Text variant="display">{hidden ? "▒▒▒▒▒▒" : formatUsd(snapshot.usdValue)}</Text>
        )}
        {snapshot !== null && (wallet.stale || (snapshot.usdValue === 0 && snapshot.tokenCount === 0) || uncounted > 0) && (
          <Text variant="label" tone={wallet.stale ? "caution" : "muted"}>
            {wallet.stale
              ? `Last known balance${wallet.fetchedAt !== null ? ` · read ${formatAge(wallet.fetchedAt, now)}` : ""}. `
              : snapshot.usdValue === 0 && snapshot.tokenCount === 0
                ? "Nothing held yet — fund the wallet to see it here. "
                : ""}
            {uncounted > 0 ? `${uncounted} ${uncounted === 1 ? "token isn't" : "tokens aren't"} counted — unpriced or unverified.` : ""}
          </Text>
        )}
        <View style={styles.split}>
          <CoinMark symbol="SOL" logo={hyperliquidIcon("SOL")} size={32} />
          <View style={styles.flex}>
            <Text variant="label" tone="secondary">
              SOL balance
            </Text>
            <Text variant="data">{snapshot === null ? "—" : hidden ? "▒▒▒▒" : `${formatQty(snapshot.sol, 4)} SOL`}</Text>
          </View>
          <Button
            label="View holdings"
            size="sm"
            icon={<ArrowRight size={14} strokeWidth={1.5} color={color["text-primary"]} />}
            onPress={() => router.push("/wallet")}
          />
        </View>
      </Block>

      {/* ---- network ---- */}
      <Block label="Network">
        <View style={styles.between}>
          <Text variant="h2">Network</Text>
          <View style={styles.inline}>
            <View style={[styles.dot, { backgroundColor: TONE[status.tone] }]} />
            <Text variant="label" tone="secondary">
              {status.label}
            </Text>
          </View>
        </View>
        <View style={styles.split}>
          <View style={styles.flex}>
            <Text variant="label" tone="muted">
              Cluster
            </Text>
            <Text variant="data" tone={wallet.wrongChain ? "negative" : "primary"}>
              {wallet.cluster === null ? "—" : CLUSTER_LABEL[wallet.cluster]}
            </Text>
          </View>
          <View style={styles.flex}>
            <Text variant="label" tone="muted">
              SOL price
            </Text>
            <Text variant="data">{snapshot?.solUsd == null ? "—" : formatPriceUsd(snapshot.solUsd)}</Text>
          </View>
        </View>
        <View style={styles.between}>
          <Text variant="label" tone="muted" style={styles.flex}>
            {wallet.refreshing
              ? "Refreshing…"
              : wallet.fetchedAt === null
                ? wallet.unconfigured
                  ? "The server has no Solana RPC configured"
                  : (wallet.error ?? "Not read yet")
                : wallet.stale
                  ? `Last good read ${formatAge(wallet.fetchedAt, now)}`
                  : `Updated ${formatAge(wallet.fetchedAt, now)}`}
          </Text>
          <IconButton accessibilityLabel="Refresh network data" onPress={wallet.refetch} disabled={wallet.refreshing || wallet.unconfigured}>
            <RefreshCw size={16} strokeWidth={1.5} color={color["text-secondary"]} />
          </IconButton>
        </View>
      </Block>

      {/* ---- account ---- */}
      <Block label="Account">
        <Text variant="h2">Account</Text>
        {account === null ? (
          <>
            <Skeleton />
            <Skeleton />
          </>
        ) : (
          <>
            <Row label="User ID">
              <Text variant="mono-addr" numberOfLines={1} style={styles.shrink}>
                {truncateMiddle(account.id, 14, 6)}
              </Text>
              <IconButton accessibilityLabel="Copy the user ID" onPress={() => void copy(account.id, "user ID")}>
                <Copy size={15} strokeWidth={1.5} color={color["text-secondary"]} />
              </IconButton>
            </Row>
            {account.createdAt !== null && (
              <Row label="Created">
                <Text variant="data-sm">
                  {new Date(account.createdAt).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" })}
                </Text>
              </Row>
            )}
            {account.loginMethod !== null && (
              <Row label="Sign-in method">
                {(() => {
                  const Icon = METHOD_ICON[account.loginMethod.type] ?? AtSign;
                  return <Icon size={15} strokeWidth={1.5} color={color["text-secondary"]} />;
                })()}
                <Text variant="body-sm">{methodLabel(account.loginMethod.type)}</Text>
              </Row>
            )}
            <View style={styles.between}>
              <Text variant="body-sm">Linked accounts</Text>
              <Text variant="label" tone="secondary">
                {account.accounts.length} linked
              </Text>
            </View>
            {[...account.accounts]
              .sort((a, b) => Number(b.type === "wallet") - Number(a.type === "wallet"))
              .map((entry, index) => {
                const shown = describe(entry);
                const verified = entry.type === "email" || entry.type === "phone" ? entry.verifiedAt : null;
                return (
                  <View key={`${entry.type}-${entry.detail ?? index}`} style={styles.linked}>
                    {entry.type === "wallet" ? (
                      <CoinMark symbol={entry.chainType === "ethereum" ? "ETH" : "SOL"} logo={hyperliquidIcon(entry.chainType === "ethereum" ? "ETH" : "SOL")} size={28} />
                    ) : (
                      (() => {
                        const Icon = METHOD_ICON[entry.type] ?? AtSign;
                        return <Icon size={20} strokeWidth={1.5} color={color["text-secondary"]} />;
                      })()
                    )}
                    <View style={styles.flex}>
                      <Text variant="body-sm">{shown.label}</Text>
                      <Text variant={shown.mono ? "mono-addr" : "body-sm"} tone="secondary" numberOfLines={1}>
                        {shown.display ?? "—"}
                      </Text>
                    </View>
                    {verified !== null ? (
                      <InfoTip
                        label="Verified"
                        text={`Verified by the sign-in provider · ${new Date(verified).toLocaleString("en-GB")}`}
                        icon={<BadgeCheck size={17} strokeWidth={1.75} color={color.positive} />}
                      />
                    ) : shown.value !== null ? (
                      <IconButton accessibilityLabel={`Copy the ${shown.label.toLowerCase()}`} onPress={() => void copy(shown.value as string, shown.label.toLowerCase())}>
                        <Copy size={15} strokeWidth={1.5} color={color["text-secondary"]} />
                      </IconButton>
                    ) : null}
                  </View>
                );
              })}
            <Button
              label="Add a passkey"
              size="sm"
              icon={<Fingerprint size={16} strokeWidth={1.5} color={color["text-primary"]} />}
              loading={addingPasskey}
              onPress={() => void addPasskey()}
            />
          </>
        )}
      </Block>

      {/* ---- recent activity ---- */}
      <Block label="Recent activity">
        <View style={styles.between}>
          <Text variant="h2">Recent activity</Text>
          <Button label="All" size="sm" variant="ghost" onPress={() => router.push("/activity")} />
        </View>
        {activity.loading ? (
          <>
            <Skeleton />
            <Skeleton />
          </>
        ) : activity.error !== null && activity.items.length === 0 ? (
          <Text variant="body-sm" tone="negative">
            {activity.error}
          </Text>
        ) : activity.items.length === 0 ? (
          <Text variant="body-sm" tone="secondary">
            No transactions yet.
          </Text>
        ) : (
          activity.items.map((item) => (
            <View key={item.signature} style={styles.between}>
              <Text variant="body-sm" numberOfLines={1} style={styles.flex}>
                {item.summary?.title ?? (item.status === "failed" ? "Transaction failed" : "Transaction")}
              </Text>
              <Text variant="label" tone={item.status === "failed" ? "negative" : "muted"}>
                {item.status} · {item.at === null ? "processing" : formatRelativeTime(item.at, minute)}
              </Text>
            </View>
          ))
        )}
      </Block>
    </DetailScreen>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1, minWidth: 0 },
  shrink: { flexShrink: 1 },
  inline: { flexDirection: "row", alignItems: "center", gap: 6 },
  between: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 12, minHeight: 32 },
  split: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    paddingTop: 10,
    borderTopWidth: StyleSheet.hairlineWidth * 2,
    borderTopColor: color["border-subtle"],
  },
  dot: { width: 8, height: 8, borderRadius: radius.pill },
  row: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 12,
    minHeight: 44,
    borderBottomWidth: StyleSheet.hairlineWidth * 2,
    borderBottomColor: color["border-subtle"],
  },
  rowValue: { flexDirection: "row", alignItems: "center", gap: 4, flexShrink: 1 },
  linked: { flexDirection: "row", alignItems: "center", gap: 12, minHeight: 48 },
});
