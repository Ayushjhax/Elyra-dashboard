import { useMemo } from "react";
import { StyleSheet, View } from "react-native";
import { router } from "expo-router";
import { ArrowLeftRight, Copy, QrCode, Send } from "lucide-react-native";
import { EVM_CHAIN_KEYS, EVM_CHAINS, evmAddressUrl, evmScopeId, evmTokenUrl, isEvmAddress, type EvmChainKey } from "@/lib/evm/chains";
import { formatPrice, truncateMiddle } from "@/lib/format";
import { hyperliquidIcon } from "@/lib/market/tickerLogoData";
import type { PortfolioSnapshot, SpotHolding } from "@/lib/portfolio/types";
import { FlowHeading } from "~/components/shell/flow";
import { Button, IconButton } from "~/components/ui/controls";
import { Skeleton } from "~/components/ui/layout";
import { Text } from "~/components/ui/Text";
import { Money } from "~/components/ui/values";
import { HoldingRow } from "~/components/wallet/WalletSections";
import { Notice, openExternal, useCopy } from "~/components/wallet/parts";
import { useElyraAuth } from "~/lib/auth/AuthProvider";
import { usePortfolio } from "~/lib/stores/portfolio";
import { useEvmSigner } from "~/lib/wallet/evmSigner";
import { color, radius } from "~/theme/tokens";

/* ---------------------------------------------------------------------------
   The account's EVM wallet on Ethereum and Robinhood Chain — the website's
   EvmWallets section, for the wallet screen.

   One address, two ledgers: the address once, then each network's balances
   under its own name, because the same ETH can sit on both. Read from the
   portfolio store, which already reads both chains; a network that could not
   be read says why. Send and Swap open the EVM screen (app/evm.tsx) when
   Elyra's embedded wallet holds the key; a linked external wallet is read
   here and used from its own app.
--------------------------------------------------------------------------- */

function byValue(a: SpotHolding, b: SpotHolding): number {
  if (a.verified !== b.verified) return a.verified ? -1 : 1;
  return (b.valueUsd ?? -1) - (a.valueUsd ?? -1);
}

function nameOf(holding: SpotHolding): string {
  const name = holding.name ?? holding.symbol;
  const multiplier = holding.stockToken?.multiplier;
  if (multiplier === undefined || Math.abs(multiplier - 1) < 1e-6) return name;
  return `${name} · ${formatPrice(multiplier, 4)} shares per token`;
}

function ChainCard({
  chain,
  snapshot,
  address,
  canSign,
}: {
  chain: EvmChainKey;
  snapshot: PortfolioSnapshot;
  address: string;
  canSign: boolean;
}) {
  const meta = EVM_CHAINS[chain];
  const scopeId = evmScopeId(chain, address);
  const scope = snapshot.scopes.find((entry) => entry.id === scopeId) ?? null;
  const failure = snapshot.notes.find((note) => note.kind === "failed" && note.scope === meta.name.toLowerCase());
  const holdings = useMemo(() => snapshot.spot.filter((holding) => holding.scopeId === scopeId).sort(byValue), [snapshot.spot, scopeId]);

  return (
    <View style={styles.card} accessibilityLabel={`${meta.name} balances`}>
      <View style={styles.head}>
        <FlowHeading small>{meta.name}</FlowHeading>
        <Money value={scope?.valueUsd ?? null} reason={failure?.reason ?? `${meta.name} could not be read.`} variant="data" tone="secondary" />
      </View>
      {canSign && (
        <View style={styles.actions}>
          <View style={styles.flex}>
            <Button
              label="Send"
              size="sm"
              icon={<Send size={15} strokeWidth={1.5} color={color["text-primary"]} />}
              onPress={() => router.push({ pathname: "/evm", params: { action: "send", chain } })}
            />
          </View>
          <View style={styles.flex}>
            <Button
              label="Swap"
              size="sm"
              icon={<ArrowLeftRight size={15} strokeWidth={1.5} color={color["text-primary"]} />}
              onPress={() => router.push({ pathname: "/evm", params: { action: "swap", chain } })}
            />
          </View>
        </View>
      )}
      {scope === null ? (
        <Text variant="body-sm" tone="negative" style={styles.note}>
          {failure?.reason ?? `${meta.name} could not be read.`}
        </Text>
      ) : holdings.length === 0 ? (
        <Text variant="body-sm" tone="secondary" style={styles.note}>
          No balances on {meta.name} yet.
        </Text>
      ) : (
        <View style={styles.list}>
          {holdings.map((holding, index) => (
            <HoldingRow
              key={holding.id}
              symbol={holding.symbol}
              name={holding.verified ? nameOf(holding) : (holding.address ?? holding.symbol)}
              /* Only a token's own logo, never one borrowed by ticker: a stock
                 token's ticker can name an unrelated coin, and an unverified
                 token must not wear the real one's artwork. */
              logo={holding.logo ?? (holding.symbol === "ETH" && holding.address === null ? hyperliquidIcon("ETH") : null)}
              amount={holding.quantity}
              usd={holding.verified ? holding.valueUsd : null}
              reason={
                !holding.verified
                  ? "Unverified tokens are never valued."
                  : holding.stockToken !== undefined
                    ? `No price for ${holding.stockToken.ticker} right now, so this token is not counted.`
                    : "No price for this token from Pyth right now."
              }
              unverified={!holding.verified}
              first={index === 0}
              hint={`Opens this on ${meta.explorer.name}`}
              onPress={() => openExternal(holding.address === null ? evmAddressUrl(chain, address) : evmTokenUrl(chain, holding.address))}
            />
          ))}
        </View>
      )}
      {scope !== null && failure !== undefined && (
        <Text variant="label" tone="caution" style={styles.note}>
          {failure.reason}
        </Text>
      )}
    </View>
  );
}

export function EvmSection() {
  const auth = useElyraAuth();
  const feed = usePortfolio();
  const signer = useEvmSigner();
  const copy = useCopy();
  const address = isEvmAddress(auth.walletAddress) ? auth.walletAddress : null;
  if (address === null) return null;
  const snapshot = feed.snapshot;

  return (
    <View style={styles.section}>
      <View style={styles.card}>
        <View style={styles.head}>
          <FlowHeading small>Ethereum and Robinhood Chain</FlowHeading>
        </View>
        <View style={styles.addressRow}>
          <Text variant="mono-addr" selectable style={styles.flex} accessibilityLabel={`EVM wallet address ${address}`}>
            {truncateMiddle(address, 6, 4)}
          </Text>
          <IconButton accessibilityLabel="Copy EVM wallet address" onPress={() => void copy(address, "EVM wallet address")}>
            <Copy size={20} strokeWidth={1.5} color={color["text-primary"]} />
          </IconButton>
          <IconButton
            accessibilityLabel="Receive on Ethereum or Robinhood Chain"
            onPress={() => router.push({ pathname: "/receive", params: { network: "ethereum" } })}
          >
            <QrCode size={20} strokeWidth={1.5} color={color["text-primary"]} />
          </IconButton>
        </View>
        <Text variant="label" tone="muted" style={styles.note}>
          The same address on both networks; each keeps its own balance.
        </Text>
        {signer.address === null && (
          <View style={styles.note}>
            <Notice tone="neutral">This EVM wallet is a linked external wallet, so sending and swapping happen in that wallet&apos;s own app.</Notice>
          </View>
        )}
      </View>

      {snapshot === null ? (
        feed.loading ? (
          <View style={[styles.card, styles.skeleton]} accessibilityLabel="Reading Ethereum and Robinhood Chain">
            <Skeleton width={140} />
            <Skeleton width={200} />
          </View>
        ) : (
          <Notice tone="negative">{feed.error ?? "These balances couldn't be read."}</Notice>
        )
      ) : (
        EVM_CHAIN_KEYS.map((chain) => (
          <ChainCard key={chain} chain={chain} snapshot={snapshot} address={address} canSign={signer.address !== null} />
        ))
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  section: { gap: 16 },
  flex: { flex: 1 },
  card: {
    borderRadius: radius.sheet,
    borderWidth: 1,
    borderColor: color["border-subtle"],
    backgroundColor: color["surface-panel"],
    overflow: "hidden",
  },
  head: { flexDirection: "row", alignItems: "baseline", justifyContent: "space-between", gap: 12, paddingHorizontal: 20, paddingTop: 16, paddingBottom: 12 },
  actions: { flexDirection: "row", gap: 8, paddingHorizontal: 20, paddingBottom: 12 },
  addressRow: { flexDirection: "row", alignItems: "center", gap: 4, paddingLeft: 20, paddingRight: 8 },
  list: { borderTopWidth: StyleSheet.hairlineWidth * 2, borderTopColor: color["border-subtle"] },
  note: { paddingHorizontal: 20, paddingBottom: 14 },
  skeleton: { gap: 10, padding: 20 },
});
