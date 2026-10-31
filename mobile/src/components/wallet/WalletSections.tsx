import { useRef, useState, type ReactNode } from "react";
import { Pressable, StyleSheet, View } from "react-native";
import { router } from "expo-router";
import { useFundSolanaWallet } from "@privy-io/expo/ui";
import {
  AtSign,
  ChevronDown,
  ChevronRight,
  ChevronUp,
  CircleAlert,
  Coins,
  Copy,
  CreditCard,
  ExternalLink,
  Eye,
  EyeOff,
  Info,
  KeyRound,
  Link2,
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
import { formatAge, formatUsd, truncateMiddle } from "@/lib/format";
import { hyperliquidIcon } from "@/lib/market/tickerLogoData";
import { accountExplorerUrl } from "@/lib/solana/address";
import { CLUSTER_LABEL, EXPECTED_CLUSTER } from "@/lib/solana/cluster";
import type { TokenBalance } from "@/lib/wallet/types";
import { ActionRow, FlowHeading, IconTile, Pill, WideButton } from "~/components/shell/flow";
import { Notice, openExternal, useCopy } from "~/components/wallet/parts";
import { Button, IconButton } from "~/components/ui/controls";
import { InfoTip } from "~/components/ui/InfoTip";
import { Skeleton } from "~/components/ui/layout";
import { CoinMark } from "~/components/ui/marks";
import { BottomSheet, type BottomSheetHandle } from "~/components/ui/overlays";
import { Text, type TextTone } from "~/components/ui/Text";
import { formatQuantity, Money, Quantity } from "~/components/ui/values";
import { useElyraAuth } from "~/lib/auth/AuthProvider";
import { useAppStore, useBalancesHidden } from "~/lib/store";
import type { WalletDashboard } from "~/lib/stores/wallet";
import { useSecond } from "~/lib/useClock";
import { excludedLine, holdingsOf } from "~/lib/wallet/holdings";
import { fontFamily } from "~/theme/fonts";
import { color, radius } from "~/theme/tokens";

/* ---------------------------------------------------------------------------
   The wallet screen's sections — ported from the website's
   components/wallet/* (WalletIdentity, WalletBalances, WalletActions,
   WalletSync), under the same two rules:

   A value that is not known is absent, never zero. Loading is a skeleton, a
   failed read is a dash with the reason and Try again, a token with no price
   is a dash. $0.00 appears only for a wallet that was read and holds nothing.

   An unverified token is shown, in its own group, and never counted —
   airdropping a mint named "USDC" costs a few cents, and a total that added
   one in could show any figure an attacker chose. What the total leaves out
   is said by kind (lib/wallet/holdings.ts): an unpriced token is not called
   unverified.

   Hiding balances masks every figure here — the total, each quantity and
   value, and what a screen reader hears for them.
--------------------------------------------------------------------------- */

const SOL_LOGO = hyperliquidIcon("SOL");

const METHOD_ICON: Record<string, LucideIcon> = { email: Mail, phone: Phone, passkey: KeyRound, wallet: Wallet };

/** The site where an Elyra (embedded) wallet's key is exported, through Privy's own window. */
const EXPORT_SITE = "https://getelyra.xyz";

/** A bordered card on the forest — every block of the wallet screen sits in one. */
function Card({ children, style, label }: { children: ReactNode; style?: object; label?: string }) {
  return (
    <View accessibilityLabel={label} style={[styles.card, style]}>
      {children}
    </View>
  );
}

/** A square, outlined icon button — the address row's copy, receive and explorer. */
function SquareButton({ label, icon: Icon, onPress }: { label: string; icon: LucideIcon; onPress: () => void }) {
  return (
    <IconButton accessibilityLabel={label} onPress={onPress}>
      <View style={styles.square}>
        <Icon size={20} strokeWidth={1.5} color={color["text-primary"]} />
      </View>
    </IconButton>
  );
}

/* ---- identity ---- */

/**
 * The network the balances were read from and how this person signed in,
 * then the address with copy, receive and explorer. The network is a label,
 * not a menu: the app reads one cluster and has no switch.
 */
export function WalletIdentityCard({ wallet }: { wallet: WalletDashboard }) {
  const auth = useElyraAuth();
  const copy = useCopy();
  const method = auth.account?.loginMethod ?? null;
  const badge = signInLabel(method);
  const MethodIcon = method === null ? null : (METHOD_ICON[method.type] ?? AtSign);
  const address = wallet.address;

  return (
    <Card label="Wallet identity" style={styles.identityCard}>
      <View style={styles.identityHead}>
        <CoinMark symbol="SOL" logo={SOL_LOGO} size={40} />
        <Text variant="body" tone={wallet.wrongChain ? "negative" : "primary"} numberOfLines={1} style={[styles.flex, styles.chain]}>
          {wallet.chain}
        </Text>
        {badge !== null && MethodIcon !== null && (
          <Pill accessibilityLabel={`Signed in with ${badge}`}>
            <MethodIcon size={18} strokeWidth={1.5} color={color["text-primary"]} />
            <Text variant="body" numberOfLines={1} maxFontSizeMultiplier={1.3} style={styles.badgeText}>
              {badge}
            </Text>
          </Pill>
        )}
      </View>

      <View style={styles.rule} />

      {address === null ? (
        <Text variant="body" tone="secondary" style={styles.identityNote}>
          {wallet.isLoading ? "Reading this account…" : "This account has no Solana wallet yet."}
        </Text>
      ) : (
        <View style={styles.addressRow}>
          <Text
            variant="body"
            numberOfLines={1}
            accessibilityLabel={`Wallet address ${address}`}
            style={[styles.flex, styles.address]}
          >
            {truncateMiddle(address, 4, 4)}
          </Text>
          <SquareButton label="Copy the wallet address" icon={Copy} onPress={() => void copy(address, "wallet address")} />
          <SquareButton label="Receive: show the QR code" icon={QrCode} onPress={() => router.push("/receive")} />
          <SquareButton label="View on Solscan" icon={ExternalLink} onPress={() => openExternal(accountExplorerUrl(address, wallet.cluster))} />
        </View>
      )}

      {wallet.wrongChain && (
        <View style={styles.identityNote}>
          <Notice tone="negative">
            These are {CLUSTER_LABEL[wallet.cluster ?? "unknown"]} balances, not {CLUSTER_LABEL[EXPECTED_CLUSTER]} ones. A
            Solana key is valid on every cluster, so the server&apos;s RPC decides which ledger is read.
          </Notice>
        </View>
      )}
    </Card>
  );
}

/* ---- the total ---- */

function RetryLink({ wallet }: { wallet: WalletDashboard }) {
  return (
    <Text
      variant="body"
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

/** The total, its state in words, the switch that hides every figure, and Fund wallet. */
export function WalletBalanceCard({ wallet }: { wallet: WalletDashboard }) {
  const hidden = useBalancesHidden();
  const setHidden = useAppStore((state) => state.setBalancesHidden);
  const now = useSecond();
  const snapshot = wallet.snapshot;

  let value: ReactNode;
  let note: ReactNode;
  let tone: TextTone = "secondary";
  let alert = false;

  if (wallet.unconfigured) {
    value = <Text variant="display" tone="muted" style={styles.total}>—</Text>;
    note = "This server has no Solana RPC configured, so balances can't be read.";
    tone = "caution";
  } else if (snapshot === null && wallet.isLoading) {
    value = <Skeleton width={180} height={40} />;
    note = "Reading this wallet…";
  } else if (snapshot === null) {
    value = (
      <Text variant="display" tone="muted" accessibilityLabel="Total balance unavailable" style={styles.total}>
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
    const excluded = excludedLine(snapshot.uncounted);
    value = (
      <Money
        value={snapshot.usdValue}
        reason="The SOL price is unavailable, so the total can't be valued."
        variant="display"
        tone={wallet.stale ? "secondary" : "primary"}
        style={styles.total}
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
      alert = true;
    } else if (snapshot.usdValue === null) {
      note = "No SOL price right now, so the total can't be valued. The balances below are current.";
      tone = "caution";
      alert = true;
    } else if (excluded !== null) {
      note = excluded;
      tone = "caution";
      alert = true;
    } else if (snapshot.sol === 0 && snapshot.tokenCount === 0) {
      note = "Nothing in this wallet yet.";
    } else {
      note = "Available in this wallet.";
    }
  }

  return (
    <Card label="Total balance" style={styles.balanceCard}>
      <View style={styles.balanceHead}>
        <View style={styles.flex}>
          <Text variant="body" tone="secondary" style={styles.balanceLabel}>
            Total balance
          </Text>
          {/* One line at the figure's height whatever is in it, so hiding,
              loading and landing never move the card. */}
          <View style={styles.totalLine}>{value}</View>
        </View>
        <Pressable
          onPress={() => setHidden(!hidden)}
          accessibilityRole="switch"
          accessibilityLabel="Hide balances"
          accessibilityState={{ checked: hidden }}
          style={({ pressed }) => [styles.eye, pressed && styles.pressed]}
        >
          {hidden ? (
            <EyeOff size={24} strokeWidth={1.5} color={color["accent-hover"]} />
          ) : (
            <Eye size={24} strokeWidth={1.5} color={color["text-primary"]} />
          )}
        </Pressable>
      </View>
      <View style={styles.noteRow} accessibilityLiveRegion="polite">
        {alert && <CircleAlert size={20} strokeWidth={1.5} color={color.caution} style={styles.noteIcon} />}
        <Text variant="body" tone={tone} style={[styles.flex, styles.noteText]}>
          {note}
        </Text>
      </View>
      {wallet.address !== null && <FundWallet address={wallet.address} />}
    </Card>
  );
}

/* ---- funding ---- */

/** Card purchases are in USDC, so the amount is in dollars the person can read. */
const CARD_AMOUNTS = ["25", "50", "100"] as const;

/**
 * Add funds: the two ways money reaches this wallet, said plainly.
 *
 * DEPOSIT is always available — the address and its QR code, for SOL or
 * USDC sent on Solana from an exchange or another wallet.
 *
 * CARD is Privy's on-ramp. It is opened with an explicit asset and amount:
 * without one it falls back to the Privy app's "default recommended amount",
 * and when the dashboard sets none it fails with "amount was not specified"
 * before showing anything. It still needs card funding switched on in the
 * Privy dashboard; until then its error is shown with the way that works.
 */
function FundWallet({ address }: { address: string }) {
  const { fundWallet } = useFundSolanaWallet();
  const sheet = useRef<BottomSheetHandle>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const buy = (amount: string) => {
    if (busy) return;
    setBusy(amount);
    setError(null);
    fundWallet({ address, asset: "USDC", amount, cluster: { name: "mainnet-beta" } })
      .catch((failure: unknown) => {
        const message = failure instanceof Error ? failure.message : "";
        /* Closing the flow is an ordinary outcome, not reported. */
        if (/cancel|closed/i.test(message)) return;
        setError(
          `${message.length > 0 ? `${message}. ` : ""}Card purchases may not be switched on for Elyra yet — deposit from an exchange or another wallet instead.`,
        );
      })
      .finally(() => setBusy(null));
  };

  return (
    <>
      <WideButton
        label="Fund wallet"
        variant="accent"
        leading={Plus}
        accessibilityHint="Deposit from another wallet or an exchange, or buy USDC with a card"
        onPress={() => {
          setError(null);
          sheet.current?.present();
        }}
      />
      <BottomSheet ref={sheet} title="Add funds" display>
        <View style={styles.fundSheet}>
          <Text variant="body" tone="secondary" style={styles.sheetLead}>
            Money reaches this wallet on Solana. Elyra never holds it: it lands at your own address.
          </Text>
          <ActionRow
            icon={QrCode}
            title="Deposit SOL or USDC"
            hint="From an exchange or another wallet, to your address on Solana."
            onPress={() => {
              sheet.current?.dismiss();
              router.push("/receive");
            }}
          />
          <View style={styles.fundCard}>
            <View style={styles.fundCardHead}>
              <IconTile icon={CreditCard} />
              <View style={styles.flex}>
                <Text variant="body" style={styles.rowTitle}>
                  Buy USDC with a card
                </Text>
                <Text variant="body-sm" tone="muted" style={styles.rowNote}>
                  Opens Privy&apos;s checkout for the amount you choose. The provider shows the fees before you pay.
                </Text>
              </View>
            </View>
            <View style={styles.fundAmounts}>
              {CARD_AMOUNTS.map((amount) => (
                <View key={amount} style={styles.flex}>
                  <Button
                    label={busy === amount ? "Opening…" : `$${amount}`}
                    accessibilityLabel={`Buy ${amount} US dollars of USDC with a card`}
                    disabled={busy !== null}
                    onPress={() => buy(amount)}
                  />
                </View>
              ))}
            </View>
            {error !== null && <Notice tone="negative">{error}</Notice>}
          </View>
        </View>
      </BottomSheet>
    </>
  );
}

/* ---- holdings ---- */

/**
 * One holding: its mark, ticker and name; its quantity and value. The row
 * opens where more is known about it — the market for SOL, the mint on the
 * explorer for a token.
 */
export function HoldingRow({
  symbol,
  unit = symbol,
  name,
  logo,
  amount,
  usd,
  reason,
  unverified = false,
  first = false,
  onPress,
  hint,
}: {
  symbol: string;
  /** The unit after the quantity; null for a mint with no ticker, whose shortened address is already the title. */
  unit?: string | null;
  name: string;
  logo: string | null;
  amount: number;
  usd: number | null;
  reason: string;
  unverified?: boolean;
  first?: boolean;
  onPress: () => void;
  hint: string;
}) {
  const hidden = useBalancesHidden();
  const spoken = [
    symbol,
    unverified ? "unverified" : name,
    hidden ? "balance hidden" : `${formatQuantity(amount)}${unit === null ? "" : ` ${unit}`}`,
    usd === null ? `value unavailable: ${reason}` : hidden ? null : formatUsd(usd),
  ]
    .filter((part): part is string => part !== null)
    .join(", ");

  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={spoken}
      accessibilityHint={hint}
      android_ripple={{ color: color["surface-hover"] }}
      style={({ pressed }) => [styles.holding, !first && styles.holdingRule, pressed && styles.pressed]}
    >
      <CoinMark symbol={symbol} logo={logo} size={44} />
      <View style={styles.flex}>
        <View style={styles.symbolLine}>
          <Text variant="body" numberOfLines={1} style={[styles.shrink, styles.rowTitle]}>
            {symbol}
          </Text>
          {unverified && <ShieldAlert size={18} strokeWidth={1.5} color={color.caution} />}
        </View>
        <Text variant="body" tone="secondary" numberOfLines={1} style={styles.holdingName}>
          {name}
        </Text>
      </View>
      <View style={styles.figures}>
        <View style={styles.rowBaseline}>
          <Quantity value={amount} variant="data" style={styles.quantity} />
          {unit !== null && (
            <Text variant="data" numberOfLines={1} style={[styles.quantity, styles.shrink]}>
              {" "}
              {unit}
            </Text>
          )}
        </View>
        <Money value={usd} reason={reason} variant="data" tone="secondary" style={styles.value} />
      </View>
      <ChevronRight size={20} strokeWidth={1.5} color={color["text-secondary"]} />
    </Pressable>
  );
}

function TokenRow({ token, first, cluster }: { token: TokenBalance; first: boolean; cluster: WalletDashboard["cluster"] }) {
  /* No name or ticker is invented: an unresolved mint is named by its address. */
  const symbol = token.symbol ?? truncateMiddle(token.mint, 4, 4);
  return (
    <HoldingRow
      symbol={symbol}
      unit={token.symbol}
      name={!token.verified || token.symbol === null ? token.mint : (token.name ?? token.mint)}
      logo={token.icon}
      amount={token.amount}
      usd={token.usdValue}
      reason={token.verified ? "No price for this token from Jupiter." : "Unverified tokens are never valued."}
      unverified={!token.verified}
      first={first}
      hint="Opens this token's mint on Solscan"
      onPress={() => openExternal(accountExplorerUrl(token.mint, cluster))}
    />
  );
}

/** Unverified mints, apart from the assets and out of the total. */
export function UnverifiedHoldingsSection({
  tokens,
  count,
  cluster,
  footnote,
}: {
  tokens: TokenBalance[];
  count: number;
  cluster: WalletDashboard["cluster"];
  footnote: string | null;
}) {
  return (
    <Card label="Unverified holdings">
      <View style={styles.unverifiedHead}>
        <View style={styles.unverifiedTitle}>
          <Text variant="body" accessibilityRole="header" style={styles.groupTitle}>
            Unverified holdings
          </Text>
          <View style={styles.count} accessibilityLabel={`${count} unverified`}>
            <Text variant="data" maxFontSizeMultiplier={1.3} style={styles.countText}>
              {String(count)}
            </Text>
          </View>
          {/* The only place the reason is given, so it opens on a tap. */}
          <InfoTip
            label="Why unverified holdings are not counted"
            text="Jupiter does not recognise these mints as the tokens they claim to be. They are shown because they are in the wallet, and never counted, because anyone can mint a token under a name that is already taken."
            icon={<ShieldAlert size={22} strokeWidth={1.5} color={color.caution} />}
          />
        </View>
        <Text variant="body-sm" tone="caution" style={styles.unverifiedNote}>
          Not included in total balance.
        </Text>
      </View>
      <View style={styles.list}>
        {tokens.map((token, index) => (
          <TokenRow key={token.mint} token={token} first={index === 0} cluster={cluster} />
        ))}
      </View>
      {footnote !== null && (
        <Text variant="body-sm" tone="muted" style={styles.footnote}>
          {footnote}
        </Text>
      )}
    </Card>
  );
}

/** Native SOL first, always, then every verified token; unverified mints in their own card. */
export function WalletHoldings({ wallet }: { wallet: WalletDashboard }) {
  const snapshot = wallet.snapshot;

  if (snapshot === null) {
    if (!wallet.isLoading || wallet.unconfigured) return null;
    return (
      <Card label="Assets loading">
        <View style={styles.cardHead}>
          <FlowHeading small>Assets</FlowHeading>
        </View>
        <View style={styles.list}>
          {[0, 1].map((index) => (
            <View key={index} style={[styles.holding, index > 0 && styles.holdingRule]}>
              <Skeleton width={44} height={44} rounded={radius.pill} />
              <Skeleton width={90} />
              <View style={styles.flex} />
              <Skeleton width={72} />
            </View>
          ))}
        </View>
      </Card>
    );
  }

  const { verified, unverified, held } = holdingsOf(snapshot);
  const { unpriced, unverified: unverifiedCount } = snapshot.uncounted;
  const excluded = unpriced + unverifiedCount;
  /* The website's line, under whichever card comes last. */
  const footnote =
    excluded === 0
      ? null
      : `${excluded} holding${excluded === 1 ? "" : "s"} not in the total${unverifiedCount > 0 ? ` — ${unverifiedCount} unverified` : ""}${unpriced > 0 ? ` — ${unpriced} with no price` : ""}.`;
  const capped = snapshot.tokenCount > snapshot.tokens.length;

  return (
    <>
      <Card>
        <View style={styles.cardHead}>
          <FlowHeading small>Assets</FlowHeading>
          {held > 0 && (
            <Text variant="body" tone="secondary" style={styles.cardHeadNote}>
              {held} {held === 1 ? "holding" : "holdings"}
            </Text>
          )}
        </View>
        <View style={styles.list}>
          <HoldingRow
            symbol="SOL"
            name="Solana"
            logo={SOL_LOGO}
            amount={snapshot.sol}
            usd={snapshot.solUsd === null ? null : snapshot.sol * snapshot.solUsd}
            reason="No SOL price from Pyth right now."
            first
            hint="Opens the SOL market"
            onPress={() => router.push("/asset/SOL")}
          />
          {verified.map((token) => (
            <TokenRow key={token.mint} token={token} first={false} cluster={wallet.cluster} />
          ))}
        </View>
        {snapshot.tokenCount === 0 && (
          <View style={styles.emptyRow}>
            <Coins size={20} strokeWidth={1.5} color={color["text-muted"]} />
            <Text variant="body" tone="secondary">
              No other token balances yet.
            </Text>
          </View>
        )}
        {/* A capped list must not read as a complete one. */}
        {capped && (
          <Text variant="body-sm" tone="muted" style={styles.footnote}>
            Showing the {snapshot.tokens.length} largest of {snapshot.tokenCount} tokens. The total includes them all.
          </Text>
        )}
        {unverified.length === 0 && footnote !== null && (
          <Text variant="body-sm" tone="muted" style={styles.footnote}>
            {footnote}
          </Text>
        )}
      </Card>

      {unverified.length > 0 && (
        <UnverifiedHoldingsSection tokens={unverified} count={unverifiedCount} cluster={wallet.cluster} footnote={footnote} />
      )}
    </>
  );
}

/* ---- details ---- */

/** A bordered card that goes somewhere: tile, title, note, chevron. Without onPress it only informs. */
function DetailCard({
  icon,
  title,
  note,
  tone = "primary",
  onPress,
  disabled = false,
  accessibilityLabel,
  trailing,
  children,
}: {
  icon: LucideIcon;
  title: string;
  note?: string;
  tone?: "primary" | "negative";
  onPress?: () => void;
  disabled?: boolean;
  accessibilityLabel?: string;
  trailing?: ReactNode;
  children?: ReactNode;
}) {
  const ink = tone === "negative" ? color.negative : color["text-secondary"];
  const body = (
    <View style={styles.detailRow}>
      <IconTile icon={icon} tint={ink} />
      <View style={styles.detailText}>
        <Text variant="body" tone={tone} style={styles.rowTitle}>
          {title}
        </Text>
        {note !== undefined && (
          <Text variant="body-sm" tone="secondary" style={styles.rowNote}>
            {note}
          </Text>
        )}
      </View>
      {trailing}
      {onPress !== undefined && <ChevronRight size={22} strokeWidth={1.5} color={tone === "negative" ? color.negative : color["text-secondary"]} />}
    </View>
  );
  return (
    <View style={styles.detailCard}>
      {onPress === undefined ? (
        <View accessible accessibilityLabel={note === undefined ? title : `${title}. ${note}`}>
          {body}
        </View>
      ) : (
        <Pressable
          onPress={onPress}
          disabled={disabled}
          accessibilityRole="button"
          accessibilityLabel={accessibilityLabel ?? (note === undefined ? title : `${title}, ${note}`)}
          accessibilityState={{ disabled }}
          android_ripple={{ color: color["surface-hover"] }}
          style={({ pressed }) => [pressed && styles.pressed, disabled && styles.disabled]}
        >
          {body}
        </Pressable>
      )}
      {children}
    </View>
  );
}

function Detail({ label, children }: { label: string; children: ReactNode }) {
  return (
    <View style={styles.detail}>
      <Text variant="body-sm" tone="muted">
        {label}
      </Text>
      <Text variant="body-sm" tone="secondary" style={styles.detailValue}>
        {children}
      </Text>
    </View>
  );
}

/** Where the numbers came from: the read's age and slot, the price sources, and the read's state in words. */
function SyncCard({ wallet }: { wallet: WalletDashboard }) {
  const [open, setOpen] = useState(false);
  const now = useSecond();
  const snapshot = wallet.snapshot;
  const age = wallet.fetchedAt !== null ? formatAge(wallet.fetchedAt, now) : null;

  let summary: string;
  let tone: TextTone = "secondary";
  if (snapshot === null) {
    if (wallet.isLoading) summary = "Reading the wallet…";
    else {
      summary = wallet.unconfigured ? "No Solana RPC on this server" : "The wallet couldn't be read";
      tone = "negative";
    }
  } else if (wallet.stale) {
    summary = `Refresh failed · last good read ${age ?? ""}`.trim();
    tone = "caution";
  } else if (wallet.refreshing) {
    summary = `Refreshing · last read ${age ?? ""}`.trim();
  } else {
    summary = age === null ? "Read" : `Last read ${age}`;
  }

  return (
    <View style={styles.detailCard}>
      <Pressable
        onPress={() => setOpen(!open)}
        accessibilityRole="button"
        accessibilityLabel={`Pricing and sync details. ${summary}${snapshot !== null ? `. Slot ${snapshot.slot.toLocaleString("en-US")}` : ""}`}
        accessibilityState={{ expanded: open }}
        android_ripple={{ color: color["surface-hover"] }}
        style={({ pressed }) => pressed && styles.pressed}
      >
        <View style={styles.detailRow}>
          <IconTile icon={Info} />
          <View style={styles.syncBody}>
            <View style={styles.detailText}>
              <Text variant="body" style={styles.rowTitle}>
                Pricing &amp; sync details
              </Text>
              <Text variant="body-sm" tone={tone} style={styles.rowNote}>
                {summary}
              </Text>
            </View>
            {snapshot !== null && (
              <View style={styles.syncMeta}>
                <View style={styles.sources}>
                  <Pill tone={snapshot.solUsd === null ? "caution" : "neutral"}>Pyth</Pill>
                  <Pill>Jupiter</Pill>
                </View>
                <Text variant="body-sm" tone="secondary" style={styles.slot}>
                  Slot {snapshot.slot.toLocaleString("en-US")}
                </Text>
              </View>
            )}
          </View>
          {open ? (
            <ChevronDown size={22} strokeWidth={1.5} color={color["text-secondary"]} />
          ) : (
            <ChevronRight size={22} strokeWidth={1.5} color={color["text-secondary"]} />
          )}
        </View>
      </Pressable>

      {open && (
        <View style={styles.details}>
          <Detail label="SOL price">{snapshot === null ? "—" : snapshot.solUsd === null ? "Pyth — unavailable right now" : "Pyth"}</Detail>
          <Detail label="Token prices and names">
            {snapshot === null ? "—" : `Jupiter${snapshot.uncounted.unpriced > 0 ? ` — ${snapshot.uncounted.unpriced} unpriced` : ""}`}
          </Detail>
          <Detail label="Last good read">
            {wallet.fetchedAt === null ? "—" : `${new Date(wallet.fetchedAt).toLocaleTimeString("en-GB")}${age === null ? "" : ` · ${age}`}`}
          </Detail>
          {snapshot !== null && <Detail label="Read at slot">{snapshot.slot.toLocaleString("en-US")}</Detail>}
          <Detail label="Network">{wallet.cluster === null ? "Not read yet" : `${wallet.chain}, by genesis hash`}</Detail>
          {wallet.latencyMs !== null && <Detail label="RPC round trip">{`${wallet.latencyMs.toLocaleString("en-US")} ms`}</Detail>}
          {wallet.error !== null && (wallet.stale || snapshot === null) && (
            <Text variant="body-sm" tone={snapshot === null ? "negative" : "caution"}>
              {snapshot === null ? "The read failed" : "The latest refresh failed"}: {wallet.error}
            </Text>
          )}
          {snapshot !== null && snapshot.uncounted.unverified > 0 && (
            <Text variant="body-sm" tone="muted">
              {snapshot.uncounted.unverified} unverified {snapshot.uncounted.unverified === 1 ? "token is" : "tokens are"} shown but
              never valued.
            </Text>
          )}
        </View>
      )}
    </View>
  );
}

/**
 * Export, explorer, disconnect and where the numbers came from. Folded
 * behind one "Wallet details" row until opened; `onOpen` lets the screen
 * scroll the opened section into view.
 */
export function WalletDetailsSection({
  wallet,
  open,
  onToggle,
}: {
  wallet: WalletDashboard;
  open: boolean;
  onToggle: (open: boolean) => void;
}) {
  const auth = useElyraAuth();
  const address = wallet.address;
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (!open) {
    return (
      <DetailCard
        icon={Link2}
        title="Wallet details"
        note="Export, explorer and connection"
        accessibilityLabel="Wallet details: export, explorer and connection"
        onPress={() => onToggle(true)}
      />
    );
  }

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
    <View style={styles.detailsSection}>
      <View style={styles.detailsHead}>
        <View style={styles.flex}>
          <FlowHeading>Wallet details</FlowHeading>
        </View>
        <IconButton accessibilityLabel="Hide wallet details" onPress={() => onToggle(false)}>
          <ChevronUp size={24} strokeWidth={1.5} color={color["text-secondary"]} />
        </IconButton>
      </View>

      {address !== null &&
        (embedded ? (
          /* This version of Privy's Expo SDK has no export flow, and the app
             never renders a key itself: an Elyra wallet's key is exported
             on the website, through Privy's own window. */
          <DetailCard
            icon={KeyRound}
            title="Export wallet"
            note="Export your Elyra wallet's key on getelyra.xyz, signed in with this account. The app never shows a key."
            accessibilityLabel="Export wallet on getelyra.xyz, opens your browser"
            onPress={() => openExternal(EXPORT_SITE)}
          />
        ) : (
          <DetailCard
            icon={KeyRound}
            title="Export wallet"
            note={
              holder === null
                ? "Export from your connected wallet app. Elyra does not hold this wallet's key."
                : `Export from ${holder}. Elyra does not hold this wallet's key.`
            }
          />
        ))}

      {address !== null && (
        <DetailCard
          icon={ExternalLink}
          title="View on explorer"
          accessibilityLabel="View on explorer (Solscan, opens your browser)"
          onPress={() => openExternal(accountExplorerUrl(address, wallet.cluster))}
        />
      )}

      <DetailCard
        icon={Power}
        tone="negative"
        title={busy ? "Disconnecting…" : "Disconnect"}
        note="Signs you out of Elyra. Nothing is deleted."
        disabled={busy}
        onPress={() => void disconnect()}
      >
        {error !== null && (
          <View style={styles.cardNotice}>
            <Notice tone="negative">{error}</Notice>
          </View>
        )}
      </DetailCard>

      {address !== null && <SyncCard wallet={wallet} />}
    </View>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1, minWidth: 0 },
  shrink: { flexShrink: 1 },
  pressed: { backgroundColor: color["surface-hover"] },
  disabled: { opacity: 0.6 },
  card: {
    borderRadius: radius.sheet,
    borderWidth: 1,
    borderColor: color["border-subtle"],
    backgroundColor: color["surface-panel"],
    overflow: "hidden",
  },
  rule: { height: StyleSheet.hairlineWidth * 2, backgroundColor: color["border-subtle"], marginHorizontal: 20 },
  /* identity */
  identityCard: { paddingVertical: 4 },
  identityHead: { flexDirection: "row", alignItems: "center", gap: 14, paddingHorizontal: 20, paddingVertical: 14 },
  chain: { fontSize: 17, lineHeight: 23 },
  badgeText: { fontSize: 15, lineHeight: 20 },
  addressRow: { flexDirection: "row", alignItems: "center", paddingLeft: 20, paddingRight: 8, paddingVertical: 6 },
  address: { fontFamily: fontFamily("sans", 500), fontSize: 16, lineHeight: 22, letterSpacing: 0.3 },
  identityNote: { paddingHorizontal: 20, paddingVertical: 14 },
  square: {
    width: 42,
    height: 42,
    borderRadius: radius.panel,
    borderWidth: 1,
    borderColor: color["border-strong"],
    alignItems: "center",
    justifyContent: "center",
  },
  /* balance */
  balanceCard: { padding: 20, gap: 14 },
  balanceHead: { flexDirection: "row", alignItems: "flex-start", gap: 12 },
  balanceLabel: { fontSize: 16, lineHeight: 22 },
  totalLine: { minHeight: 56, justifyContent: "center", marginTop: 6, alignItems: "flex-start" },
  total: { fontSize: 46, lineHeight: 54, letterSpacing: -0.8 },
  eye: {
    width: 56,
    height: 56,
    borderRadius: radius.pill,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: color["surface-raised"],
  },
  noteRow: { flexDirection: "row", alignItems: "flex-start", gap: 10 },
  noteIcon: { marginTop: 1 },
  noteText: { fontSize: 15, lineHeight: 21 },
  link: { textDecorationLine: "underline", fontSize: 15, lineHeight: 21 },
  /* funding */
  fundSheet: { gap: 14, paddingHorizontal: 20, paddingBottom: 8 },
  sheetLead: { fontSize: 15, lineHeight: 21 },
  fundCard: {
    gap: 14,
    padding: 14,
    borderRadius: radius.sheet,
    borderWidth: 1,
    borderColor: color["border-subtle"],
    backgroundColor: color["surface-panel"],
  },
  fundCardHead: { flexDirection: "row", alignItems: "center", gap: 16 },
  fundAmounts: { flexDirection: "row", gap: 8 },
  /* holdings */
  cardHead: { flexDirection: "row", alignItems: "baseline", justifyContent: "space-between", gap: 12, paddingHorizontal: 20, paddingTop: 16, paddingBottom: 12 },
  cardHeadNote: { fontSize: 16, lineHeight: 22 },
  list: { borderTopWidth: StyleSheet.hairlineWidth * 2, borderTopColor: color["border-subtle"] },
  holding: { flexDirection: "row", alignItems: "center", gap: 14, minHeight: 76, paddingLeft: 20, paddingRight: 14, paddingVertical: 12 },
  holdingRule: { borderTopWidth: StyleSheet.hairlineWidth * 2, borderTopColor: color["border-subtle"], marginLeft: 20, paddingLeft: 0 },
  symbolLine: { flexDirection: "row", alignItems: "center", gap: 8 },
  rowTitle: { fontFamily: fontFamily("sans", 500), fontSize: 17, lineHeight: 23 },
  rowNote: { fontSize: 14, lineHeight: 19 },
  holdingName: { fontSize: 15, lineHeight: 20 },
  figures: { alignItems: "flex-end", flexShrink: 1, maxWidth: "46%" },
  rowBaseline: { flexDirection: "row", alignItems: "baseline" },
  quantity: { fontSize: 16, lineHeight: 22 },
  value: { fontSize: 15, lineHeight: 21 },
  emptyRow: { flexDirection: "row", alignItems: "center", gap: 12, paddingHorizontal: 20, paddingVertical: 14, borderTopWidth: StyleSheet.hairlineWidth * 2, borderTopColor: color["border-subtle"] },
  footnote: { paddingHorizontal: 20, paddingVertical: 14, borderTopWidth: StyleSheet.hairlineWidth * 2, borderTopColor: color["border-subtle"], fontSize: 14, lineHeight: 19 },
  unverifiedHead: { flexDirection: "row", flexWrap: "wrap", alignItems: "center", justifyContent: "space-between", columnGap: 12, paddingLeft: 20, paddingRight: 12, paddingVertical: 6 },
  unverifiedTitle: { flexDirection: "row", alignItems: "center", gap: 10, flexShrink: 1 },
  groupTitle: { fontFamily: fontFamily("sans", 500), fontSize: 18, lineHeight: 24, flexShrink: 1 },
  unverifiedNote: { fontSize: 14, lineHeight: 19, paddingBottom: 4 },
  count: {
    minWidth: 30,
    height: 30,
    paddingHorizontal: 8,
    borderRadius: radius.pill,
    backgroundColor: color["surface-hover"],
    alignItems: "center",
    justifyContent: "center",
  },
  countText: { fontSize: 15, lineHeight: 19 },
  /* details */
  detailsSection: { gap: 12 },
  detailsHead: { flexDirection: "row", alignItems: "center", marginTop: 8 },
  detailCard: {
    borderRadius: radius.sheet,
    borderWidth: 1,
    borderColor: color["border-subtle"],
    backgroundColor: color["surface-panel"],
    overflow: "hidden",
  },
  detailRow: { flexDirection: "row", alignItems: "center", gap: 16, minHeight: 76, paddingLeft: 14, paddingRight: 14, paddingVertical: 12 },
  detailText: { flexGrow: 1, flexShrink: 1, flexBasis: 150, gap: 2 },
  cardNotice: { paddingHorizontal: 14, paddingBottom: 14 },
  syncBody: { flex: 1, minWidth: 0, gap: 8 },
  syncMeta: { flexDirection: "row", flexWrap: "wrap", alignItems: "center", rowGap: 6, columnGap: 12 },
  sources: { flexDirection: "row", gap: 6 },
  slot: { fontSize: 14, lineHeight: 19, fontVariant: ["tabular-nums"] },
  details: { paddingLeft: 78, paddingRight: 16, paddingBottom: 14, gap: 2 },
  detail: { flexDirection: "row", alignItems: "baseline", justifyContent: "space-between", gap: 16, paddingVertical: 3 },
  detailValue: { flexShrink: 1, textAlign: "right" },
});
