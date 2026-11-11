import { useState } from "react";
import { ScrollView, Share, StyleSheet, View } from "react-native";
import { useLocalSearchParams } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Copy, ExternalLink, QrCode as QrIcon, Share2 } from "lucide-react-native";
import { EVM_CHAINS, evmAddressUrl, isEvmAddress, type EvmChainKey } from "@/lib/evm/chains";
import { hyperliquidIcon } from "@/lib/market/tickerLogoData";
import { accountExplorerUrl } from "@/lib/solana/address";
import { CLUSTER_LABEL, EXPECTED_CLUSTER } from "@/lib/solana/cluster";
import { Button, SegmentedControl } from "~/components/ui/controls";
import { CoinMark, QrCode } from "~/components/ui/marks";
import { Text } from "~/components/ui/Text";
import { Notice, openExternal, SheetHeader, useCopy } from "~/components/wallet/parts";
import { useElyraAuth } from "~/lib/auth/AuthProvider";
import { useWalletDashboard } from "~/lib/stores/wallet";
import { color, radius } from "~/theme/tokens";

/* ---------------------------------------------------------------------------
   Where to send funds — the website's ReceiveDialog.

   One network at a time, named outright. The account holds two wallets: a
   Solana one, and an EVM one whose single address is valid on both Ethereum
   and Robinhood Chain. Each address is shown whole, never truncated, with
   copy and share beside the code, and the network is said in words — the two
   EVM tabs share an address, but a balance sent on one network never appears
   on the other.

   `?network=ethereum` or `robinhood` opens on that network.
--------------------------------------------------------------------------- */

type Network = "solana" | EvmChainKey;

export default function ReceiveScreen() {
  const auth = useElyraAuth();
  const wallet = useWalletDashboard();
  const params = useLocalSearchParams<{ network?: string }>();
  const evmAddress = isEvmAddress(auth.walletAddress) ? auth.walletAddress : null;
  const [chosen, setChosen] = useState<Network>(
    params.network === "ethereum" || params.network === "robinhood" ? params.network : "solana",
  );
  const network: Network = evmAddress === null ? "solana" : chosen;
  const insets = useSafeAreaInsets();

  return (
    <View style={styles.screen}>
      <SheetHeader title="Receive" icon={QrIcon} closeLabel="Close receive" />
      <ScrollView contentContainerStyle={[styles.body, { paddingBottom: insets.bottom + 24 }]}>
        {evmAddress !== null && (
          <SegmentedControl<Network>
            accessibilityLabel="Network"
            value={network}
            onChange={setChosen}
            choices={[
              { value: "solana", label: "Solana" },
              { value: "ethereum", label: "Ethereum" },
              { value: "robinhood", label: "Robinhood" },
            ]}
          />
        )}
        {network === "solana" ? (
          <SolanaReceive wallet={wallet} embedded={auth.account?.solanaIsEmbedded === true} />
        ) : (
          <EvmReceive
            chain={network}
            address={evmAddress as string}
            embedded={(auth.account?.accounts ?? []).some(
              (entry) =>
                entry.type === "wallet" &&
                entry.chainType === "ethereum" &&
                entry.walletClientType === "privy" &&
                entry.detail?.toLowerCase() === evmAddress?.toLowerCase(),
            )}
          />
        )}
      </ScrollView>
    </View>
  );
}

function AddressBlock({ address, shareTitle }: { address: string; shareTitle: string }) {
  const copy = useCopy();
  return (
    <>
      <View style={styles.qr}>
        <QrCode value={address} label="QR code of the wallet address" size={208} />
      </View>

      {/* Whole and selectable: a receiving address is never shown truncated. */}
      <Text variant="mono-addr" selectable style={styles.address}>
        {address}
      </Text>

      <View style={styles.buttons}>
        <View style={styles.flex}>
          <Button
            label="Copy address"
            icon={<Copy size={16} strokeWidth={1.5} color={color["text-primary"]} />}
            onPress={() => void copy(address, "wallet address")}
          />
        </View>
        <View style={styles.flex}>
          <Button
            label="Share"
            icon={<Share2 size={16} strokeWidth={1.5} color={color["text-primary"]} />}
            onPress={() => void Share.share({ message: address, title: shareTitle })}
          />
        </View>
      </View>
    </>
  );
}

function SolanaReceive({ wallet, embedded }: { wallet: ReturnType<typeof useWalletDashboard>; embedded: boolean }) {
  const address = wallet.address;
  const network = CLUSTER_LABEL[wallet.cluster ?? EXPECTED_CLUSTER];
  const offMainnet = wallet.cluster !== null && wallet.cluster !== EXPECTED_CLUSTER;

  if (address === null) {
    return (
      <Text variant="body-sm" tone="secondary">
        This account has no Solana wallet to receive into. Link one from your account to get an address.
      </Text>
    );
  }

  return (
    <>
      <Text variant="body-sm" tone="secondary">
        Send SOL or Solana tokens to this address.
      </Text>

      <View style={styles.network}>
        <CoinMark symbol="SOL" logo={hyperliquidIcon("SOL")} size={24} />
        <View style={styles.flex}>
          <Text variant="body-sm">{network}</Text>
          <Text variant="label" tone="secondary">
            {embedded ? "Your Elyra wallet" : "Your linked Solana wallet"}
          </Text>
        </View>
      </View>

      <AddressBlock address={address} shareTitle="My Solana address" />

      <Notice tone={offMainnet ? "negative" : "caution"}>
        {offMainnet
          ? `This wallet is being read on ${network}. Funds sent on mainnet will not show here until the server reads mainnet.`
          : `Solana mainnet only. Tokens sent from another network, such as Ethereum, can be lost.`}
      </Notice>

      <Button
        label="View on Solscan"
        variant="ghost"
        size="sm"
        icon={<ExternalLink size={14} strokeWidth={1.5} color={color["text-secondary"]} />}
        onPress={() => openExternal(accountExplorerUrl(address, wallet.cluster))}
      />
    </>
  );
}

function EvmReceive({ chain, address, embedded }: { chain: EvmChainKey; address: string; embedded: boolean }) {
  const here = EVM_CHAINS[chain];
  const other = EVM_CHAINS[chain === "ethereum" ? "robinhood" : "ethereum"];
  return (
    <>
      <Text variant="body-sm" tone="secondary">
        Send ETH or tokens on {here.name} to this address.
      </Text>

      <View style={styles.network}>
        {/* Robinhood Chain has no coin of its own; it is drawn as its letters,
            never with a borrowed brand mark. */}
        <CoinMark symbol={chain === "ethereum" ? "ETH" : here.name} logo={chain === "ethereum" ? hyperliquidIcon("ETH") : null} size={24} />
        <View style={styles.flex}>
          <Text variant="body-sm">{here.name}</Text>
          <Text variant="label" tone="secondary">
            {embedded ? "Your Elyra EVM wallet" : "Your linked EVM wallet"}
          </Text>
        </View>
      </View>

      <AddressBlock address={address} shareTitle={`My ${here.name} address`} />

      <Notice tone="caution">
        {`Only send on ${here.name}. This address is also yours on ${other.name}, but each network keeps its own balance — funds sent on one never appear on the other. Never send from Solana.`}
      </Notice>

      <Button
        label={`View on ${here.explorer.name}`}
        variant="ghost"
        size="sm"
        icon={<ExternalLink size={14} strokeWidth={1.5} color={color["text-secondary"]} />}
        onPress={() => openExternal(evmAddressUrl(chain, address))}
      />
    </>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: color["surface-base"] },
  body: { padding: 20, gap: 16 },
  flex: { flex: 1 },
  network: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    borderWidth: 1,
    borderColor: color["border-subtle"],
    borderRadius: radius.control,
    backgroundColor: color["surface-raised"],
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
  qr: { alignItems: "center", paddingVertical: 8 },
  address: {
    textAlign: "center",
    borderWidth: 1,
    borderColor: color["border-subtle"],
    borderRadius: radius.control,
    paddingHorizontal: 12,
    paddingVertical: 10,
  },
  buttons: { flexDirection: "row", gap: 8 },
});
