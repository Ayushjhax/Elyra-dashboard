import { useState } from "react";
import { Pressable, ScrollView, StyleSheet, View, useWindowDimensions } from "react-native";
import { router } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useLinkWithPasskey } from "@privy-io/expo/passkey";
import { ArrowRight, AtSign, BadgeCheck, Copy, Fingerprint, KeyRound, Mail, Phone, RefreshCw, Wallet, type LucideIcon } from "lucide-react-native";
import { methodLabel, type LinkedAccountSummary } from "@/lib/account";
import { formatAge, formatPriceUsd, truncateMiddle } from "@/lib/format";
import { hyperliquidIcon } from "@/lib/market/tickerLogoData";
import { CLUSTER_LABEL } from "@/lib/solana/cluster";
import { walletStatus } from "@/lib/wallet/status";
import { Pill, TitleBar, WideButton } from "~/components/shell/flow";
import { CardEyebrow, Rule, StatusText, SurfaceCard } from "~/components/shell/surface";
import { Button, IconButton } from "~/components/ui/controls";
import { InfoTip } from "~/components/ui/InfoTip";
import { Skeleton } from "~/components/ui/layout";
import { useToast } from "~/components/ui/overlays";
import { CoinMark } from "~/components/ui/marks";
import { Text } from "~/components/ui/Text";
import { Money, Quantity } from "~/components/ui/values";
import { ActivityRow } from "~/components/wallet/ActivityRow";
import { useCopy } from "~/components/wallet/parts";
import { useElyraAuth } from "~/lib/auth/AuthProvider";
import { useWalletActivity } from "~/lib/stores/activity";
import { useWalletDashboard } from "~/lib/stores/wallet";
import { APP_IDENTITY } from "~/lib/wallet/mwa";
import { excludedLine } from "~/lib/wallet/holdings";
import { useMinute, useSecond } from "~/lib/useClock";
import { fontFamily } from "~/theme/fonts";
import { color, radius, TOUCH_TARGET } from "~/theme/tokens";

/* ---------------------------------------------------------------------------
   The account dashboard — the website's DashboardDrawer: the wallet's
   holdings in one figure, the network it is read from, the account itself
   (user id, when it was created, how it signs in, every linked account),
   and the latest transactions.

   Reached from the Account tab. Every figure reads the same stores the rest
   of the app does, and hiding balances masks every amount here. The
   network's state is the wallet read's (lib/wallet/status.ts), never
   "Connected" because the screen loaded. A transaction opens on Solscan,
   its real detail page; what the total leaves out is said by kind
   (lib/wallet/holdings.ts).
--------------------------------------------------------------------------- */

const SOL_LOGO = hyperliquidIcon("SOL");
const METHOD_ICON: Record<string, LucideIcon> = { email: Mail, phone: Phone, passkey: KeyRound, wallet: Wallet };

/** A label on the left, its value on the right, over a hairline. */
function Row({ label, children, first = false }: { label: string; children: React.ReactNode; first?: boolean }) {
  return (
    <View style={[styles.row, !first && styles.ruled]}>
      <Text variant="body" tone="secondary" style={styles.rowLabel}>
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
  const insets = useSafeAreaInsets();
  /* Beside the SOL balance on a wider phone; on its own row below 400dp, so
     neither the label nor the button is squeezed. */
  const { width, fontScale } = useWindowDimensions();
  const holdingsBeside = width / Math.max(1, fontScale) >= 400;
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
  const refresh = () => {
    wallet.refetch();
    activity.refetch();
  };

  const viewHoldings = (
    <Pressable
      onPress={() => router.push("/wallet")}
      accessibilityRole="button"
      accessibilityLabel="View holdings"
      style={({ pressed }) => [styles.accentButton, pressed && styles.pressed]}
    >
      <ArrowRight size={20} strokeWidth={1.75} color={color["accent-hover"]} />
      <Text variant="body" numberOfLines={1} maxFontSizeMultiplier={1.3} style={styles.accentText}>
        View holdings
      </Text>
    </Pressable>
  );

  let note: string | null = null;
  let noteTone: "secondary" | "caution" = "secondary";
  if (snapshot !== null) {
    const excluded = excludedLine(snapshot.uncounted);
    if (wallet.stale) {
      note = `Last known balance${wallet.fetchedAt !== null ? ` · read ${formatAge(wallet.fetchedAt, now)}` : ""}.${excluded === null ? "" : ` ${excluded}`}`;
      noteTone = "caution";
    } else if (snapshot.usdValue === null) {
      note = "No SOL price right now, so the total can't be valued. The balances are exact.";
      noteTone = "caution";
    } else if (snapshot.usdValue === 0 && snapshot.tokenCount === 0) note = "Nothing held yet — fund the wallet to see it here.";
    else note = excluded;
  }

  return (
    <View style={styles.screen}>
      <TitleBar title="Dashboard" onRefresh={refresh} refreshing={wallet.refreshing} />
      <ScrollView contentContainerStyle={[styles.content, { paddingBottom: insets.bottom + 32 }]}>
        {/* ---- holdings ---- */}
        <SurfaceCard label="Holdings">
          <CardEyebrow right={snapshot !== null ? <Pill>{`${snapshot.tokenCount} ${snapshot.tokenCount === 1 ? "token" : "tokens"}`}</Pill> : undefined}>
            Holdings
          </CardEyebrow>
          <View style={styles.total}>
            <Text variant="body" tone="secondary" style={styles.label}>
              Total balance
            </Text>
            {snapshot === null ? (
              wallet.isLoading ? (
                <Skeleton width={180} height={48} />
              ) : (
                <View style={styles.failed}>
                  <Text variant="body" tone="negative" style={styles.flex}>
                    {wallet.unconfigured ? "The server has no Solana RPC configured, so balances can't be read." : (wallet.error ?? "The balance could not be read.")}
                  </Text>
                  {!wallet.unconfigured && <Button label={wallet.refreshing ? "Trying…" : "Try again"} size="sm" onPress={wallet.refetch} />}
                </View>
              )
            ) : (
              <Money
                value={snapshot.usdValue}
                reason="No SOL price right now, so the total can't be valued."
                variant="display"
                tone={wallet.stale ? "secondary" : "primary"}
                style={styles.totalValue}
              />
            )}
            {note !== null && (
              <Text variant="body" tone={noteTone} style={styles.note}>
                {note}
              </Text>
            )}
          </View>
          <Rule />
          <View style={styles.sol}>
            <CoinMark symbol="SOL" logo={SOL_LOGO} size={48} />
            <View style={styles.flex}>
              <Text variant="body" tone="secondary" style={styles.label}>
                SOL balance
              </Text>
              {snapshot === null ? (
                <Text variant="data" tone="muted" style={styles.solValue}>
                  —
                </Text>
              ) : (
                <View style={styles.inline}>
                  <Quantity value={snapshot.sol} variant="data" style={styles.solValue} />
                  <Text variant="data" style={styles.solValue}>
                    {" "}
                    SOL
                  </Text>
                </View>
              )}
            </View>
            {holdingsBeside && viewHoldings}
          </View>
          {!holdingsBeside && viewHoldings}
        </SurfaceCard>

        {/* ---- network ---- */}
        <SurfaceCard label="Network">
          <CardEyebrow right={<StatusText tone={status.tone} label={status.label} />}>Network</CardEyebrow>
          <Rule />
          <View style={styles.columns}>
            <View style={styles.column}>
              <Text variant="body" tone="secondary" style={styles.label}>
                Cluster
              </Text>
              <Text variant="body" tone={wallet.wrongChain ? "negative" : "primary"} style={styles.columnValue}>
                {wallet.cluster === null ? "—" : CLUSTER_LABEL[wallet.cluster]}
              </Text>
            </View>
            <View style={[styles.column, styles.columnRight]}>
              <Text variant="body" tone="secondary" style={styles.label}>
                SOL price
              </Text>
              <Text variant="data" style={styles.columnValue}>
                {snapshot?.solUsd == null ? "—" : formatPriceUsd(snapshot.solUsd)}
              </Text>
            </View>
          </View>
          <Rule />
          <View style={styles.updated}>
            <Text variant="body" tone={wallet.stale || (wallet.fetchedAt === null && !wallet.isLoading) ? "caution" : "secondary"} style={[styles.flex, styles.label]}>
              {wallet.refreshing
                ? "Refreshing…"
                : wallet.fetchedAt === null
                  ? wallet.unconfigured
                    ? "The server has no Solana RPC configured"
                    : wallet.isLoading
                      ? "Reading…"
                      : (wallet.error ?? "Not read yet")
                  : wallet.stale
                    ? `Last good read ${formatAge(wallet.fetchedAt, now)}`
                    : `Updated ${formatAge(wallet.fetchedAt, now)}`}
            </Text>
            <IconButton accessibilityLabel="Refresh network data" onPress={wallet.refetch} disabled={wallet.refreshing || wallet.unconfigured}>
              <RefreshCw size={24} strokeWidth={1.5} color={color["text-primary"]} />
            </IconButton>
          </View>
        </SurfaceCard>

        {/* ---- account ---- */}
        <SurfaceCard label="Account" style={styles.tight}>
          <CardEyebrow>Account</CardEyebrow>
          {account === null ? (
            <>
              <Skeleton />
              <Skeleton />
            </>
          ) : (
            <View>
              <Row first label="User ID">
                <Text variant="mono-addr" numberOfLines={1} style={styles.mono} accessibilityLabel={`User ID ${account.id}`}>
                  {truncateMiddle(account.id, 14, 6)}
                </Text>
                <IconButton accessibilityLabel="Copy the user ID" onPress={() => void copy(account.id, "user ID")}>
                  <Copy size={22} strokeWidth={1.5} color={color["text-secondary"]} />
                </IconButton>
              </Row>
              {account.createdAt !== null && (
                <Row label="Created">
                  <Text variant="body" style={styles.value}>
                    {new Date(account.createdAt).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" })}
                  </Text>
                </Row>
              )}
              {account.loginMethod !== null && (
                <Row label="Sign-in method">
                  {(() => {
                    const Icon = METHOD_ICON[account.loginMethod.type] ?? AtSign;
                    return <Icon size={22} strokeWidth={1.5} color={color["text-primary"]} />;
                  })()}
                  <Text variant="body" style={styles.value}>
                    {methodLabel(account.loginMethod.type)}
                  </Text>
                </Row>
              )}
              <Row label="Linked accounts">
                <Text variant="body" style={styles.value}>
                  {account.accounts.length} linked
                </Text>
              </Row>
              {[...account.accounts]
                .sort((a, b) => Number(b.type === "wallet") - Number(a.type === "wallet"))
                .map((entry, index) => {
                  const shown = describe(entry);
                  const verified = entry.type === "email" || entry.type === "phone" ? entry.verifiedAt : null;
                  return (
                    <View key={`${entry.type}-${entry.detail ?? index}`} style={styles.linked}>
                      {entry.type === "wallet" ? (
                        <CoinMark symbol={entry.chainType === "ethereum" ? "ETH" : "SOL"} logo={hyperliquidIcon(entry.chainType === "ethereum" ? "ETH" : "SOL")} size={48} />
                      ) : (
                        <View style={styles.txIcon}>
                          {(() => {
                            const Icon = METHOD_ICON[entry.type] ?? AtSign;
                            return <Icon size={22} strokeWidth={1.5} color={color["text-primary"]} />;
                          })()}
                        </View>
                      )}
                      <View style={styles.flex}>
                        <Text variant="body" style={styles.txTitle}>
                          {shown.label}
                        </Text>
                        <Text variant="body" tone="secondary" numberOfLines={1} style={shown.mono ? styles.mono : styles.value} accessibilityLabel={shown.value ?? undefined}>
                          {shown.display ?? "—"}
                        </Text>
                      </View>
                      {verified !== null ? (
                        <InfoTip
                          label="Verified"
                          text={`Verified by the sign-in provider · ${new Date(verified).toLocaleString("en-GB")}`}
                          icon={<BadgeCheck size={22} strokeWidth={1.75} color={color.positive} />}
                        />
                      ) : shown.value !== null ? (
                        <IconButton accessibilityLabel={`Copy the ${shown.label.toLowerCase()}`} onPress={() => void copy(shown.value as string, shown.label.toLowerCase())}>
                          <Copy size={22} strokeWidth={1.5} color={color["text-secondary"]} />
                        </IconButton>
                      ) : null}
                    </View>
                  );
                })}
              <View style={styles.passkey}>
                <WideButton label={addingPasskey ? "Adding a passkey…" : "Add a passkey"} variant="outline" leading={Fingerprint} busy={addingPasskey} onPress={() => void addPasskey()} />
              </View>
            </View>
          )}
        </SurfaceCard>

        {/* ---- recent activity ---- */}
        <SurfaceCard label="Recent activity" style={styles.tight}>
          <CardEyebrow
            right={
              <Pressable onPress={() => router.push("/activity")} accessibilityRole="button" accessibilityLabel="All activity" style={styles.all}>
                <Text variant="body" style={styles.accentText}>
                  All
                </Text>
                <ArrowRight size={20} strokeWidth={1.75} color={color["accent-hover"]} />
              </Pressable>
            }
          >
            Recent activity
          </CardEyebrow>
          {activity.loading ? (
            <View style={styles.skeletons}>
              <Skeleton height={44} />
              <Skeleton height={44} />
            </View>
          ) : activity.error !== null && activity.items.length === 0 ? (
            <View style={styles.failed}>
              <Text variant="body" tone="negative" style={styles.flex}>
                {activity.error}
              </Text>
              <Button label={activity.refreshing ? "Trying…" : "Try again"} size="sm" onPress={activity.refetch} />
            </View>
          ) : activity.items.length === 0 ? (
            <Text variant="body" tone="secondary" style={styles.empty}>
              No transactions yet.
            </Text>
          ) : (
            <View>
              {activity.items.map((item, index) => (
                <ActivityRow key={item.signature} item={item} now={minute} first={index === 0} />
              ))}
            </View>
          )}
        </SurfaceCard>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: color["surface-base"] },
  content: { paddingHorizontal: 20, paddingTop: 4, gap: 16 },
  tight: { gap: 8, paddingBottom: 12 },
  flex: { flex: 1, minWidth: 0 },
  inline: { flexDirection: "row", alignItems: "center", flexWrap: "wrap" },
  pressed: { backgroundColor: color["surface-hover"] },
  label: { fontSize: 16, lineHeight: 22 },
  value: { fontSize: 16, lineHeight: 22 },
  mono: { fontSize: 14, lineHeight: 20, flexShrink: 1 },
  total: { gap: 6 },
  totalValue: { fontSize: 48, lineHeight: 56, letterSpacing: -0.8 },
  note: { fontSize: 15, lineHeight: 21 },
  failed: { flexDirection: "row", alignItems: "center", gap: 12, flexWrap: "wrap" },
  sol: { flexDirection: "row", alignItems: "center", gap: 14 },
  solValue: { fontSize: 19, lineHeight: 25 },
  accentButton: {
    justifyContent: "center",
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    minHeight: TOUCH_TARGET + 4,
    paddingHorizontal: 16,
    borderRadius: radius.panel,
    borderWidth: 1,
    borderColor: color["accent-hover"],
  },
  accentText: { color: color["accent-hover"], fontFamily: fontFamily("sans", 500), fontSize: 16, lineHeight: 22 },
  columns: { flexDirection: "row" },
  column: { flex: 1, minWidth: 0, gap: 4, paddingRight: 12 },
  columnRight: { paddingLeft: 16, paddingRight: 0, borderLeftWidth: StyleSheet.hairlineWidth * 2, borderLeftColor: color["border-subtle"] },
  columnValue: { fontFamily: fontFamily("sans", 500), fontSize: 19, lineHeight: 25 },
  updated: { flexDirection: "row", alignItems: "center", gap: 8, marginVertical: -8 },
  row: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 12, minHeight: TOUCH_TARGET + 12, paddingVertical: 6 },
  ruled: { borderTopWidth: StyleSheet.hairlineWidth * 2, borderTopColor: color["border-subtle"] },
  rowLabel: { fontSize: 16, lineHeight: 22, flexShrink: 0 },
  rowValue: { flexDirection: "row", alignItems: "center", justifyContent: "flex-end", gap: 8, flexShrink: 1 },
  linked: { flexDirection: "row", alignItems: "center", gap: 14, minHeight: 64, paddingVertical: 8 },
  passkey: { paddingTop: 8 },
  all: { flexDirection: "row", alignItems: "center", gap: 8, minHeight: TOUCH_TARGET, paddingLeft: 12 },
  skeletons: { gap: 10, paddingVertical: 8 },
  empty: { paddingVertical: 12 },
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
});
