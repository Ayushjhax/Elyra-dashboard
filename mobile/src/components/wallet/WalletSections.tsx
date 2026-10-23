import { useState } from "react";
import { Pressable, StyleSheet, View } from "react-native";
import { router } from "expo-router";
import { useFundSolanaWallet } from "@privy-io/expo/ui";
import {
  AtSign,
  ChevronRight,
  Coins,
  Copy,
  ExternalLink,
  Eye,
  EyeOff,
  Info,
  KeyRound,
  Mail,
  Phone,
  Plus,
  Power,
  QrCode,
  ShieldAlert,
  Wallet,
  type LucideIcon,
} from "lucide-react-native";
import { signInLabel, walletClientName } from "@/lib/account";
import { formatAge, truncateMiddle } from "@/lib/format";
import { hyperliquidIcon } from "@/lib/market/tickerLogoData";
import { accountExplorerUrl } from "@/lib/solana/address";
import { CLUSTER_LABEL, EXPECTED_CLUSTER } from "@/lib/solana/cluster";
import type { TokenBalance } from "@/lib/wallet/types";
import { ActionRow, Notice, openExternal, useCopy } from "~/components/wallet/parts";
import { Button, IconButton } from "~/components/ui/controls";
import { InfoTip } from "~/components/ui/InfoTip";
import { Skeleton } from "~/components/ui/layout";
import { CoinMark } from "~/components/ui/marks";
import { Text } from "~/components/ui/Text";
import { Money, Quantity } from "~/components/ui/values";
import { useElyraAuth } from "~/lib/auth/AuthProvider";
import { useAppStore, useBalancesHidden } from "~/lib/store";
import type { WalletDashboard } from "~/lib/stores/wallet";
import { useSecond } from "~/lib/useClock";
import { color, radius, TOUCH_TARGET } from "~/theme/tokens";

/* ---------------------------------------------------------------------------
   The wallet sheet's sections — ported from the website's
   components/wallet/* (WalletIdentity, WalletBalances, WalletActions,
   WalletSync), under the same two rules:

   A value that is not known is absent, never zero. Loading is a skeleton, a
   failed read is a dash with the reason and Try again, a token with no price
   is a dash counted in the "not included" line. $0.00 appears only for a
   wallet that was read and holds nothing.

   An unverified token is shown and never counted — airdropping a mint named
   "USDC" costs a few cents, and a total that added one in could show any
   figure an attacker chose.
--------------------------------------------------------------------------- */

const SOL_LOGO = hyperliquidIcon("SOL");

const METHOD_ICON: Record<string, LucideIcon> = { email: Mail, phone: Phone, passkey: KeyRound, wallet: Wallet };

/* ---- identity ---- */

export function WalletIdentity({ wallet }: { wallet: WalletDashboard }) {
  const auth = useElyraAuth();
  const copy = useCopy();
  const method = auth.account?.loginMethod ?? null;
  const badge = signInLabel(method);
  const MethodIcon = method === null ? null : (METHOD_ICON[method.type] ?? AtSign);
  const address = wallet.address;

  return (
    <View accessibilityLabel="Wallet identity" style={styles.section}>
      <View style={styles.rowCenter}>
        <CoinMark symbol="SOL" logo={SOL_LOGO} size={32} />
        <Text variant="body-sm" tone={wallet.wrongChain ? "negative" : "secondary"} numberOfLines={1} style={styles.flex}>
          {wallet.chain}
        </Text>
        {badge !== null && MethodIcon !== null && (
          <View style={styles.badge}>
            <MethodIcon size={14} strokeWidth={1.5} color={color["text-secondary"]} />
            <Text variant="label" tone="secondary">
              {badge}
            </Text>
          </View>
        )}
      </View>

      {address === null ? (
        <Text variant="body-sm" tone="secondary" style={styles.gapTop}>
          {wallet.isLoading ? "Reading this account…" : "This account has no Solana wallet yet."}
        </Text>
      ) : (
        <View style={[styles.rowCenter, styles.addressRow]}>
          <Text variant="mono-addr" accessibilityLabel={`Wallet address ${address}`} style={styles.flex}>
            {truncateMiddle(address, 4, 4)}
          </Text>
          <IconButton accessibilityLabel="Copy the wallet address" onPress={() => void copy(address, "wallet address")}>
            <Copy size={17} strokeWidth={1.5} color={color["text-secondary"]} />
          </IconButton>
          <IconButton accessibilityLabel="Show the QR code to receive" onPress={() => router.push("/receive")}>
            <QrCode size={17} strokeWidth={1.5} color={color["text-secondary"]} />
          </IconButton>
          <IconButton accessibilityLabel="View on Solscan" onPress={() => openExternal(accountExplorerUrl(address, wallet.cluster))}>
            <ExternalLink size={17} strokeWidth={1.5} color={color["text-secondary"]} />
          </IconButton>
        </View>
      )}

      {wallet.wrongChain && (
        <View style={styles.gapTop}>
          <Notice tone="negative">
            These are {CLUSTER_LABEL[wallet.cluster ?? "unknown"]} balances, not {CLUSTER_LABEL[EXPECTED_CLUSTER]} ones. A
            Solana key is valid on every cluster, so the server&apos;s RPC decides which ledger is read.
          </Notice>
        </View>
      )}
    </View>
  );
}

/* ---- the total ---- */

function RetryLink({ wallet }: { wallet: WalletDashboard }) {
  return (
    <Text
      variant="label"
      tone={wallet.refreshing ? "muted" : "primary"}
      onPress={wallet.refreshing ? undefined : wallet.refetch}
      accessibilityRole="button"
      suppressHighlighting
      style={styles.link}
    >
      {wallet.refreshing ? "Trying…" : "Try again"}
    </Text>
  );
}

/** The total, its state in words, and the switch that hides every figure. */
export function WalletTotal({ wallet }: { wallet: WalletDashboard }) {
  const hidden = useBalancesHidden();
  const setHidden = useAppStore((state) => state.setBalancesHidden);
  const now = useSecond();
  const snapshot = wallet.snapshot;

  let value: React.ReactNode;
  let note: React.ReactNode;
  let tone: "secondary" | "caution" | "negative" = "secondary";

  if (wallet.unconfigured) {
    value = <Text variant="display" tone="muted">—</Text>;
    note = "This server has no Solana RPC configured, so balances can't be read.";
    tone = "caution";
  } else if (snapshot === null && wallet.isLoading) {
    value = <Skeleton width={160} height={32} />;
    note = "Reading this wallet…";
  } else if (snapshot === null) {
    value = (
      <Text variant="display" tone="muted" accessibilityLabel="Total balance unavailable">
        —
      </Text>
    );
    note = (
      <>
        {wallet.error ?? "The balance couldn't be read."} <RetryLink wallet={wallet} />
      </>
    );
    tone = "negative";
  } else {
    const excluded = snapshot.uncounted.unpriced + snapshot.uncounted.unverified;
    value = (
      <Money
        value={snapshot.usdValue}
        reason="The SOL price is unavailable, so the total can't be valued."
        variant="display"
        tone={wallet.stale ? "secondary" : "primary"}
      />
    );
    if (wallet.stale) {
      note = (
        <>
          Last good reading{wallet.fetchedAt !== null ? `, ${formatAge(wallet.fetchedAt, now)}` : ""} — the latest refresh
          failed. <RetryLink wallet={wallet} />
        </>
      );
      tone = "caution";
    } else if (snapshot.usdValue === null) {
      note = "No SOL price right now, so the total can't be valued. The balances below are current.";
    } else if (excluded > 0) {
      note = `Excludes ${excluded} holding${excluded === 1 ? "" : "s"} with no price or an unverified mint.`;
    } else if (snapshot.sol === 0 && snapshot.tokenCount === 0) {
      note = "Nothing in this wallet yet.";
    } else {
      note = "Available in this wallet.";
    }
  }

  return (
    <View accessibilityLabel="Total balance" style={[styles.section, styles.ruled]}>
      <View style={styles.rowCenter}>
        <View style={styles.flex}>
          <Text variant="body-sm" tone="secondary">
            Total balance
          </Text>
          {/* One line at the figure's height whatever is in it, so hiding,
              loading and landing never move the sheet. */}
          <View style={styles.totalLine}>{value}</View>
        </View>
        <Pressable
          onPress={() => setHidden(!hidden)}
          accessibilityRole="switch"
          accessibilityLabel={hidden ? "Show balances" : "Hide balances"}
          accessibilityState={{ checked: hidden }}
          style={styles.eye}
        >
          {hidden ? (
            <EyeOff size={18} strokeWidth={1.5} color={color.accent} />
          ) : (
            <Eye size={18} strokeWidth={1.5} color={color["text-secondary"]} />
          )}
        </Pressable>
      </View>
      <Text variant="label" tone={tone} accessibilityLiveRegion="polite" style={styles.gapSmall}>
        {note}
      </Text>
    </View>
  );
}

/* ---- funding ---- */

/** Privy's own on-ramp, on the wallet and network shown above it. */
export function FundWallet({ address }: { address: string }) {
  const { fundWallet } = useFundSolanaWallet();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  return (
    <View style={styles.fund}>
      <Button
        label={busy ? "Opening…" : "Fund wallet"}
        variant="accent"
        icon={<Plus size={18} strokeWidth={1.75} color={busy ? color["text-muted"] : color["text-on-accent"]} />}
        disabled={busy}
        onPress={() => {
          setBusy(true);
          setError(null);
          /* Rejects when the person closes the flow — an ordinary outcome,
             not reported. Anything else (funding switched off for this
             Privy app, say) is said. */
          fundWallet({ address, cluster: { name: "mainnet-beta" } })
            .catch((failure: unknown) => {
              const message = failure instanceof Error ? failure.message : "";
              if (!/cancel|closed/i.test(message)) setError(message.length > 0 ? message : "Funding could not be opened.");
            })
            .finally(() => setBusy(false));
        }}
      />
      {error !== null && <Notice tone="negative">{error}</Notice>}
    </View>
  );
}

/* ---- assets ---- */

function AssetRow({
  symbol,
  name,
  logo,
  amount,
  usd,
  reason,
  unverified = false,
}: {
  symbol: string;
  name: string;
  logo: string | null;
  amount: number;
  usd: number | null;
  reason: string;
  unverified?: boolean;
}) {
  return (
    <View style={styles.asset}>
      <CoinMark symbol={symbol} logo={logo} size={32} />
      <View style={styles.flex}>
        <View style={styles.rowCenter}>
          <Text variant="body" numberOfLines={1} style={styles.shrink}>
            {symbol}
          </Text>
          {/* The only place the reason is given, so it opens on a tap. */}
          {unverified && (
            <InfoTip
              label="Unverified token"
              text="Unverified mint. Shown because it is in the wallet; not counted in the total, because anyone can mint a token under a name that is already taken."
              icon={<ShieldAlert size={14} strokeWidth={1.5} color={color.negative} />}
            />
          )}
        </View>
        <Text variant="body-sm" tone="secondary" numberOfLines={1}>
          {name}
        </Text>
      </View>
      <View style={styles.assetFigures}>
        <View style={styles.rowBaseline}>
          <Quantity value={amount} />
          <Text variant="data" numberOfLines={1}>
            {" "}
            {symbol}
          </Text>
        </View>
        <Money value={usd} reason={reason} variant="body-sm" tone="secondary" />
      </View>
    </View>
  );
}

function TokenRow({ token }: { token: TokenBalance }) {
  /* No name or ticker is invented: an unresolved mint is named by its address. */
  const symbol = token.symbol ?? truncateMiddle(token.mint, 4, 4);
  return (
    <AssetRow
      symbol={symbol}
      name={token.symbol === null ? token.mint : (token.name ?? token.mint)}
      logo={token.icon}
      amount={token.amount}
      usd={token.usdValue}
      reason={token.verified ? "No price for this token from Jupiter." : "Unverified tokens are never valued."}
      unverified={!token.verified}
    />
  );
}

/** Native SOL first, always, then every token the read returned. */
export function WalletAssets({ wallet }: { wallet: WalletDashboard }) {
  const snapshot = wallet.snapshot;

  if (snapshot === null) {
    if (!wallet.isLoading || wallet.unconfigured) return null;
    return (
      <View accessibilityLabel="Assets loading" style={[styles.section, styles.ruled]}>
        <Text variant="h2" tone="secondary">
          Assets
        </Text>
        {[0, 1].map((index) => (
          <View key={index} style={styles.asset}>
            <Skeleton width={32} height={32} rounded={radius.pill} />
            <Skeleton width={80} />
            <View style={styles.flex} />
            <Skeleton width={64} />
          </View>
        ))}
      </View>
    );
  }

  /* Holdings with a balance — not the rows drawn. Native SOL is always drawn,
     at zero too, because it is the account rather than a holding. */
  const held = (snapshot.sol > 0 ? 1 : 0) + snapshot.tokenCount;
  const excluded = snapshot.uncounted.unpriced + snapshot.uncounted.unverified;

  return (
    <View style={[styles.section, styles.ruled]}>
      <View style={styles.rowBetween}>
        <Text variant="h2" tone="secondary" accessibilityRole="header">
          Assets
        </Text>
        {held > 0 && (
          <Text variant="body-sm" tone="secondary">
            {held} {held === 1 ? "holding" : "holdings"}
          </Text>
        )}
      </View>

      <AssetRow
        symbol="SOL"
        name="Solana"
        logo={SOL_LOGO}
        amount={snapshot.sol}
        usd={snapshot.solUsd === null ? null : snapshot.sol * snapshot.solUsd}
        reason="No SOL price from Pyth right now."
      />
      {snapshot.tokens.map((token) => (
        <TokenRow key={token.mint} token={token} />
      ))}

      {snapshot.tokenCount === 0 ? (
        <View style={[styles.rowCenter, styles.noteRow]}>
          <Coins size={18} strokeWidth={1.5} color={color["text-muted"]} />
          <Text variant="body-sm" tone="secondary">
            No other token balances yet.
          </Text>
        </View>
      ) : (
        <>
          {/* A capped list must not read as a complete one. */}
          {snapshot.tokenCount > snapshot.tokens.length && (
            <Text variant="label" tone="muted" style={styles.noteRow}>
              Showing the {snapshot.tokens.length} largest of {snapshot.tokenCount} tokens. The total includes them all.
            </Text>
          )}
          {excluded > 0 && (
            <Text variant="label" tone="muted" style={styles.noteRow}>
              {excluded} holding{excluded === 1 ? "" : "s"} not in the total
              {snapshot.uncounted.unverified > 0 && ` — ${snapshot.uncounted.unverified} unverified`}
              {snapshot.uncounted.unpriced > 0 && ` — ${snapshot.uncounted.unpriced} with no price`}.
            </Text>
          )}
        </>
      )}
    </View>
  );
}

/* ---- actions ---- */

export function WalletActions({ wallet }: { wallet: WalletDashboard }) {
  const auth = useElyraAuth();
  const address = wallet.address;
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const holder = walletClientName(
    auth.account?.accounts.find((entry) => entry.type === "wallet" && entry.detail === address)?.walletClientType ?? null,
  );
  const embedded = auth.account?.solanaIsEmbedded === true;

  /* The app's one disconnect: it ends the Elyra session. Nothing is deleted,
     and the wallet itself is untouched. */
  const disconnect = async () => {
    if (busy) return;
    setBusy(true);
    setError(null);
    try {
      await auth.logout();
    } catch (failure) {
      setError(failure instanceof Error ? failure.message : "Disconnecting failed. Try again.");
      setBusy(false);
    }
  };

  return (
    <>
      {address !== null && (
        <View style={[styles.section, styles.ruled, styles.tight]}>
          {/* Export: this version of Privy's Expo SDK has no export flow, and
              Elyra never renders a key itself — so it says where the key is
              exported from instead. */}
          <ActionRow
            icon={KeyRound}
            label="Export wallet"
            tone="muted"
            note={
              embedded
                ? "Export your Elyra wallet's key from getelyra.xyz, signed in with this account. The app never shows a key."
                : holder === null
                  ? "This wallet's key isn't held by Elyra, so it is exported from the app that holds it."
                  : `This key is held by ${holder} — export it from there.`
            }
          />
          <ActionRow
            icon={ExternalLink}
            label="View on explorer"
            accessibilityLabel="View on explorer (Solscan, opens your browser)"
            onPress={() => openExternal(accountExplorerUrl(address, wallet.cluster))}
          />
        </View>
      )}

      <View style={[styles.section, styles.ruled, styles.tight]}>
        <ActionRow
          icon={Power}
          tone="negative"
          label={busy ? "Disconnecting…" : "Disconnect"}
          note="Signs you out of Elyra. Nothing is deleted."
          disabled={busy}
          onPress={() => void disconnect()}
        />
        {error !== null && <Notice tone="negative">{error}</Notice>}
      </View>
    </>
  );
}

/* ---- where the numbers came from ---- */

function Detail({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <View style={styles.detail}>
      <Text variant="label" tone="muted">
        {label}
      </Text>
      <Text variant="label" tone="secondary" style={styles.detailValue}>
        {children}
      </Text>
    </View>
  );
}

export function WalletSync({ wallet }: { wallet: WalletDashboard }) {
  const [open, setOpen] = useState(false);
  const now = useSecond();
  const snapshot = wallet.snapshot;
  const age = wallet.fetchedAt !== null ? formatAge(wallet.fetchedAt, now) : null;
  const summary =
    snapshot === null
      ? wallet.isLoading
        ? "Reading the wallet…"
        : "Not read yet"
      : [
          `${wallet.stale ? "Last good read" : "Last read"}${age === null ? "" : ` ${age}`}`,
          `slot ${snapshot.slot.toLocaleString("en-US")}`,
          "Pyth · Jupiter",
        ].join(" · ");

  return (
    <View style={[styles.section, styles.ruled, styles.tight]}>
      <Pressable
        onPress={() => setOpen(!open)}
        accessibilityRole="button"
        accessibilityState={{ expanded: open }}
        style={styles.syncToggle}
      >
        <Info size={18} strokeWidth={1.5} color={color["text-secondary"]} />
        <View style={styles.flex}>
          <Text variant="body">Pricing &amp; sync details</Text>
          <Text variant="label" tone={wallet.stale ? "caution" : "muted"}>
            {summary}
          </Text>
        </View>
        <ChevronRight
          size={16}
          strokeWidth={1.5}
          color={color["text-muted"]}
          style={{ transform: [{ rotate: open ? "90deg" : "0deg" }] }}
        />
      </Pressable>

      {open && (
        <View style={styles.details}>
          <Detail label="SOL price">{snapshot === null ? "—" : snapshot.solUsd === null ? "Pyth — unavailable right now" : "Pyth"}</Detail>
          <Detail label="Token prices and names">
            {`Jupiter${snapshot !== null && snapshot.uncounted.unpriced > 0 ? ` — ${snapshot.uncounted.unpriced} unpriced` : ""}`}
          </Detail>
          <Detail label="Last good read">
            {wallet.fetchedAt === null ? "—" : `${new Date(wallet.fetchedAt).toLocaleTimeString("en-GB")}${age === null ? "" : ` · ${age}`}`}
          </Detail>
          {snapshot !== null && <Detail label="Read at slot">{snapshot.slot.toLocaleString("en-US")}</Detail>}
          <Detail label="Network">{wallet.cluster === null ? "Not read yet" : `${wallet.chain}, by genesis hash`}</Detail>
          {wallet.latencyMs !== null && <Detail label="RPC round trip">{`${wallet.latencyMs.toLocaleString("en-US")} ms`}</Detail>}
          {wallet.stale && wallet.error !== null && (
            <Text variant="label" tone="caution">
              The latest refresh failed: {wallet.error}
            </Text>
          )}
          {snapshot !== null && snapshot.uncounted.unverified > 0 && (
            <Text variant="label" tone="muted">
              {snapshot.uncounted.unverified} unverified {snapshot.uncounted.unverified === 1 ? "token is" : "tokens are"} shown but
              never valued.
            </Text>
          )}
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  section: { paddingHorizontal: 20, paddingVertical: 16 },
  ruled: { borderTopWidth: StyleSheet.hairlineWidth * 2, borderTopColor: color["border-subtle"], marginHorizontal: 20, paddingHorizontal: 0 },
  tight: { paddingVertical: 8 },
  flex: { flex: 1, minWidth: 0 },
  shrink: { flexShrink: 1 },
  rowCenter: { flexDirection: "row", alignItems: "center", gap: 8 },
  rowBaseline: { flexDirection: "row", alignItems: "baseline" },
  rowBetween: { flexDirection: "row", alignItems: "baseline", justifyContent: "space-between", gap: 12 },
  addressRow: { marginTop: 4, gap: 0 },
  gapTop: { marginTop: 12 },
  gapSmall: { marginTop: 6 },
  badge: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    height: 28,
    paddingHorizontal: 10,
    borderRadius: radius.pill,
    borderWidth: 1,
    borderColor: color["border-subtle"],
  },
  totalLine: { height: 40, justifyContent: "center", marginTop: 4 },
  eye: {
    width: TOUCH_TARGET,
    height: TOUCH_TARGET,
    borderRadius: radius.pill,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: color["surface-raised"],
  },
  link: { textDecorationLine: "underline" },
  fund: { paddingHorizontal: 20, paddingBottom: 16, gap: 8 },
  asset: { flexDirection: "row", alignItems: "center", gap: 12, paddingVertical: 10 },
  assetFigures: { alignItems: "flex-end", flexShrink: 0, maxWidth: "50%" },
  noteRow: {
    paddingVertical: 12,
    borderTopWidth: StyleSheet.hairlineWidth * 2,
    borderTopColor: color["border-subtle"],
    gap: 12,
  },
  syncToggle: { flexDirection: "row", alignItems: "flex-start", gap: 12, minHeight: TOUCH_TARGET, paddingVertical: 8 },
  details: { paddingLeft: 30, paddingBottom: 8, gap: 2 },
  detail: { flexDirection: "row", alignItems: "baseline", justifyContent: "space-between", gap: 16, paddingVertical: 3 },
  detailValue: { flexShrink: 1, textAlign: "right" },
});
