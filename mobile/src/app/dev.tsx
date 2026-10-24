import { useRef, useState } from "react";
import { StyleSheet, View } from "react-native";
import { Redirect, router } from "expo-router";
import { Wallet } from "lucide-react-native";
import { Button, IconButton, OptionMenu, SegmentedControl } from "~/components/ui/controls";
import { DataList, type DataColumn } from "~/components/ui/DataList";
import { InfoTip } from "~/components/ui/InfoTip";
import { Card, Divider, EmptyState, Eyebrow, Panel, Screen, Section, Skeleton } from "~/components/ui/layout";
import { Markdown } from "~/components/ui/Markdown";
import { CoinMark, CompanyMark, ElyraMark, Identicon, Monogram, QrCode } from "~/components/ui/marks";
import { BottomSheet, Dialog, useToast, type BottomSheetHandle } from "~/components/ui/overlays";
import { Text } from "~/components/ui/Text";
import { Delta, Money, Percent, Quantity } from "~/components/ui/values";
import { Buffer } from "buffer";
import { useAppStore } from "~/lib/store";
import { setWalletPreview, useWalletPreview, type WalletPreview } from "~/lib/stores/wallet";
import { useSigners } from "~/lib/wallet/signer";
import { color, type, type TypeVariant } from "~/theme/tokens";

/* ---------------------------------------------------------------------------
   /dev — every type role and every primitive, for checking against the brand
   on a real screen. Development builds only; a release build redirects away.

   The figures here are fixed examples of how each primitive draws a value —
   including an unknown one and a hidden one. None of it is presented as
   anyone's account.
--------------------------------------------------------------------------- */

interface Row {
  symbol: string;
  value: number;
  change: number;
  size: number;
}

const ROWS: Row[] = [
  { symbol: "SOL", value: 11281.14, change: 3.41, size: 61.23 },
  { symbol: "JUP", value: 1513.1, change: -2.18, size: 1478.5 },
];

const COLUMNS: DataColumn<Row>[] = [
  { key: "symbol", header: "Market", width: 120, render: (row) => <Text variant="data">{row.symbol}</Text> },
  { key: "size", header: "Size", align: "right", width: 100, priority: 2, render: (row) => <Quantity value={row.size} /> },
  { key: "value", header: "Value", align: "right", width: 110, render: (row) => <Money value={row.value} /> },
  { key: "change", header: "24h", align: "right", width: 90, render: (row) => <Delta pct={row.change} /> },
];

const MARKDOWN = `**Bold**, *italic*, \`code\` and a [link](https://getelyra.xyz).

- A list item
- Another

| Market | Change |
| --- | ---: |
| SOL | +3.4% |`;

/** Signs a fixed test message with each of the account's wallets — the device check for Prompt 7. */
function SigningCheck() {
  const { signers } = useSigners();
  const [results, setResults] = useState<Record<string, string>>({});
  const message = Buffer.from("Elyra signing check").toString("base64");
  if (signers.length === 0) {
    return (
      <Text variant="body-sm" tone="secondary">
        Sign in to see this account&apos;s wallets.
      </Text>
    );
  }
  return (
    <>
      {signers.map((signer) => (
        <View key={signer.address} style={styles.padded}>
          <Text variant="label" tone="secondary">
            {signer.kind === "embedded" ? "Embedded (Privy)" : "Wallet app (MWA)"} · {signer.address.slice(0, 4)}…{signer.address.slice(-4)}
          </Text>
          <Button
            label="Sign a test message"
            size="sm"
            onPress={() => {
              signer
                .signMessage(message)
                .then((signature) => setResults((all) => ({ ...all, [signer.address]: `Signed: ${signature.slice(0, 16)}…` })))
                .catch((error: unknown) =>
                  setResults((all) => ({ ...all, [signer.address]: error instanceof Error ? error.message : String(error) })),
                );
            }}
          />
          {results[signer.address] !== undefined && (
            <Text variant="mono-addr">{results[signer.address]}</Text>
          )}
        </View>
      ))}
    </>
  );
}

const PREVIEWS: { value: WalletPreview | null; label: string }[] = [
  { value: null, label: "Live" },
  { value: "loading", label: "Loading" },
  { value: "zero", label: "Zero" },
  { value: "partial", label: "Partial" },
  { value: "unpriced", label: "No SOL price" },
  { value: "stale", label: "Stale" },
  { value: "failed", label: "Failed" },
];

/** Switches the wallet read into each state of the total, then opens the wallet to look at it. */
function WalletStates() {
  const current = useWalletPreview();
  return (
    <>
      <Text variant="body-sm" tone="secondary">
        Showing: {PREVIEWS.find((entry) => entry.value === current)?.label ?? "Live"}. Development builds only.
      </Text>
      <View style={styles.wrap}>
        {PREVIEWS.map((entry) => (
          <Button
            key={entry.label}
            label={entry.label}
            accessibilityLabel={`Wallet state: ${entry.label}`}
            size="sm"
            variant={entry.value === current ? "accent" : "quiet"}
            onPress={() => {
              setWalletPreview(entry.value);
              router.push("/wallet");
            }}
          />
        ))}
      </View>
    </>
  );
}

export default function DevScreen() {
  const toast = useToast();
  const sheet = useRef<BottomSheetHandle>(null);
  const [dialog, setDialog] = useState(false);
  const [segment, setSegment] = useState<"all" | "spot" | "perps">("all");
  const [market, setMarket] = useState<"all" | "crypto" | "equity">("all");
  const hidden = useAppStore((state) => state.balancesHidden);
  const setHidden = useAppStore((state) => state.setBalancesHidden);

  if (!__DEV__) return <Redirect href="/" />;

  return (
    <Screen edges={["top", "left", "right", "bottom"]}>
      <Text variant="display">Primitives</Text>

      <Section title="Type scale" meta="12 roles">
        {(Object.keys(type) as TypeVariant[]).map((variant) => (
          <Text key={variant} variant={variant}>
            {variant} · 1,234.56
          </Text>
        ))}
      </Section>

      <Section title="Tones">
        {(["primary", "secondary", "muted", "accent", "positive", "negative", "caution"] as const).map((tone) => (
          <Text key={tone} variant="body" tone={tone}>
            {tone}
          </Text>
        ))}
      </Section>

      <Section title="Values">
        <View style={styles.row}>
          <Money value={48213.77} variant="price" />
          <Delta pct={2.11} usd={453.19} />
        </View>
        <View style={styles.row}>
          <Text variant="body-sm" tone="secondary">
            Under a cent
          </Text>
          <Money value={0.004} />
        </View>
        <View style={styles.row}>
          <Text variant="body-sm" tone="secondary">
            Unknown
          </Text>
          <Money value={null} reason="The price feed did not answer." />
        </View>
        <View style={styles.row}>
          <Quantity value={0.00000841} />
          <Percent value={64.2} />
        </View>
        <Button label={hidden ? "Show balances" : "Hide balances"} onPress={() => setHidden(!hidden)} size="sm" />
      </Section>

      <Section title="Controls">
        <View style={styles.wrap}>
          <Button label="Review and sign" variant="accent" onPress={() => toast("Accent pressed")} />
          <Button label="Quiet" onPress={() => toast("Quiet pressed")} />
          <Button label="Ghost" variant="ghost" onPress={() => toast("Ghost pressed")} />
          <Button label="Remove" variant="danger" onPress={() => toast("Removed", "negative")} />
          <Button label="Loading" loading onPress={() => {}} />
        </View>
        <SegmentedControl
          accessibilityLabel="Market type"
          value={segment}
          onChange={setSegment}
          choices={[
            { value: "all", label: "All" },
            { value: "spot", label: "Spot" },
            { value: "perps", label: "Perps" },
          ]}
        />
        <OptionMenu
          label="Market type"
          value={market}
          onChange={setMarket}
          choices={[
            { value: "all", label: "All markets" },
            { value: "crypto", label: "Crypto" },
            { value: "equity", label: "Equities" },
          ]}
        />
        <View style={styles.row}>
          <IconButton accessibilityLabel="Open wallet" onPress={() => sheet.current?.present()}>
            <Wallet size={20} strokeWidth={1.5} color={color["text-secondary"]} />
          </IconButton>
          <Text variant="body-sm" tone="secondary" style={styles.flex}>
            Liquidation headroom
          </Text>
          <InfoTip text="How far the price can move against this position before the venue may close it." />
        </View>
        <View style={styles.wrap}>
          <Button label="Open sheet" onPress={() => sheet.current?.present()} size="sm" />
          <Button label="Open dialog" onPress={() => setDialog(true)} size="sm" />
          <Button label="Show toast" onPress={() => toast("Copied the wallet address", "positive")} size="sm" />
        </View>
      </Section>

      <Section title="Marks">
        <View style={styles.row}>
          <ElyraMark size={36} />
          <CoinMark symbol="SOL" logo={null} size={32} />
          <CompanyMark ticker="NVDA" size={32} />
          <Monogram name="Hyperliquid" size={32} />
          <Identicon identity={null} size={36} />
          <Identicon identity={{ network: "solana:mainnet-beta", address: "7xKXtg2CW87d97TXJSDpbD5jBkheTqA83TZRuJosgAsU" }} size={36} />
        </View>
        <QrCode value="solana:7xKXtg2CW87d97TXJSDpbD5jBkheTqA83TZRuJosgAsU" label="Wallet address as a QR code" />
      </Section>

      <Section title="Data list" meta="cards under 600dp">
        <DataList
          label="Example rows"
          rows={ROWS}
          columns={COLUMNS}
          getKey={(row) => row.symbol}
          card={(row) => (
            <View style={styles.row}>
              <Text variant="data" style={styles.flex}>
                {row.symbol}
              </Text>
              <Money value={row.value} />
              <Delta pct={row.change} />
            </View>
          )}
        />
      </Section>

      <Section title="Signing" meta="each wallet on this account">
        <SigningCheck />
      </Section>

      <Section title="Wallet states" meta="every state of the total">
        <WalletStates />
      </Section>

      <Section title="Markdown">
        <Markdown source={MARKDOWN} />
      </Section>

      <Panel style={styles.padded}>
        <Eyebrow>Loading</Eyebrow>
        <Skeleton width="60%" />
        <Skeleton width="40%" />
      </Panel>
      <Card>
        <Text variant="body">A card in a list.</Text>
      </Card>
      <Divider />
      <EmptyState title="No alerts yet" body="Set one from any chart." />

      <BottomSheet ref={sheet} title="A bottom sheet">
        <View style={styles.padded}>
          <Text variant="body" tone="secondary">
            Every web drawer becomes a sheet like this on a phone.
          </Text>
        </View>
      </BottomSheet>
      <Dialog open={dialog} title="Remove this alert?" onClose={() => setDialog(false)}>
        <Text variant="body" tone="secondary">
          A dialog interrupts for a decision.
        </Text>
        <View style={styles.wrap}>
          <Button label="Remove" variant="danger" onPress={() => setDialog(false)} />
          <Button label="Keep it" onPress={() => setDialog(false)} />
        </View>
      </Dialog>
    </Screen>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: "row", alignItems: "center", gap: 12 },
  wrap: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  flex: { flex: 1 },
  padded: { padding: 16, gap: 8 },
});
