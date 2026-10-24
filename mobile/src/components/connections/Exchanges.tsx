import { useState } from "react";
import { View } from "react-native";
import { ExternalLink, KeyRound } from "lucide-react-native";
import { isBinanceCredential, isEvmAddress, type ConnectionStatus } from "@/lib/connections/state";
import type { ExchangesResponse, HyperliquidAccountCheck } from "@/lib/connections/types";
import { formatRelativeTime, formatUsd, truncateMiddle } from "@/lib/format";
import { StatusBadge, VenueCard, styles, venueStatus } from "~/components/connections/parts";
import { Button } from "~/components/ui/controls";
import { Dialog } from "~/components/ui/overlays";
import { CoinMark } from "~/components/ui/marks";
import { Text } from "~/components/ui/Text";
import { TextField } from "~/components/ui/TextField";
import { Notice, openExternal, useCopy } from "~/components/wallet/parts";
import type { AccountFeed } from "~/lib/stores/createAccountStore";
import { connectBinance, disconnect, previewHyperliquid, saveHyperliquid } from "~/lib/stores/connections";
import { useTickerLogos } from "~/lib/stores/market";
import type { PortfolioFeed } from "~/lib/stores/portfolio";
import { useMinute } from "~/lib/useClock";
import { color } from "~/theme/tokens";

/* ---------------------------------------------------------------------------
   Exchanges — the website's HyperliquidCard and BinanceCard.

   HYPERLIQUID is read from an address, with no key: the account's own EVM
   wallet by default, or an address the person names — read and shown to
   them first, saved only once they say it is theirs.

   BINANCE takes a read-only API key. The key and secret are typed into
   masked fields that hold them for one submit and are cleared after it,
   whatever the answer. They are sent once to the API, which checks with
   Binance that the key cannot trade, transfer or withdraw, encrypts it, and
   never returns it. Nothing on the phone keeps them.
--------------------------------------------------------------------------- */

type Feed = AccountFeed<ExchangesResponse>;

function badgeFor(feed: Feed, portfolio: PortfolioFeed, venue: string, linked: boolean, busy: boolean): { status: ConnectionStatus; label?: string; reason: string | null } {
  if (busy) return { status: "connecting", reason: null };
  if (feed.data === null) return feed.loading ? { status: "checking", reason: null } : { status: "attention", label: "Couldn't check", reason: feed.error };
  if (!linked) return { status: "not-connected", reason: null };
  return venueStatus(portfolio, venue);
}

function Found({ found, saving, onSave }: { found: HyperliquidAccountCheck; saving: boolean; onSave: () => void }) {
  const empty = found.accountValueUsd === 0 && found.positionCount === 0 && found.spotBalanceCount === 0;
  return (
    <View style={styles.card}>
      <Text variant="mono-addr" tone="secondary">
        {truncateMiddle(found.address, 6, 4)}
      </Text>
      <Text variant="body-sm">
        {empty
          ? "Nothing is held at this address on Hyperliquid."
          : `${formatUsd(found.accountValueUsd)} · ${found.positionCount} open position${found.positionCount === 1 ? "" : "s"}${found.spotBalanceCount > 0 ? ` · ${found.spotBalanceCount} spot balance${found.spotBalanceCount === 1 ? "" : "s"}` : ""}`}
      </Text>
      {empty && (
        <Text variant="label" tone="caution">
          That is normal for a new account; if you expected positions, check the address.
        </Text>
      )}
      <Button label={saving ? "Saving…" : empty ? "Use it anyway" : "This is mine — use it"} size="sm" variant="accent" loading={saving} disabled={saving} onPress={onSave} />
    </View>
  );
}

function AddressForm() {
  const [draft, setDraft] = useState("");
  const [checking, setChecking] = useState(false);
  const [saving, setSaving] = useState(false);
  const [found, setFound] = useState<HyperliquidAccountCheck | null>(null);
  const [error, setError] = useState<string | null>(null);
  const value = draft.trim();
  const valid = isEvmAddress(value);

  return (
    <View style={styles.card}>
      <TextField
        label="Hyperliquid address"
        value={draft}
        onChangeText={(next) => {
          setDraft(next);
          setFound(null);
          setError(null);
        }}
        placeholder="0x…"
        autoCapitalize="none"
        autoCorrect={false}
        error={value.length >= 42 && !valid ? "An address starts 0x and is 42 characters long." : null}
      />
      <Text variant="label" tone="muted">
        The address you trade from on Hyperliquid. It is read, never traded from.
      </Text>
      <Button
        label={checking ? "Checking…" : "Check"}
        size="sm"
        loading={checking}
        disabled={!valid || checking || saving}
        onPress={async () => {
          setChecking(true);
          setError(null);
          const result = await previewHyperliquid(value);
          if (result.ok) setFound(result.data);
          else setError(result.error);
          setChecking(false);
        }}
      />
      {found !== null && (
        <Found
          found={found}
          saving={saving}
          onSave={async () => {
            setSaving(true);
            const result = await saveHyperliquid(found.address);
            setSaving(false);
            if (result.ok) {
              setDraft("");
              setFound(null);
            } else setError(result.error);
          }}
        />
      )}
      {error !== null && <Notice tone="negative">{error}</Notice>}
    </View>
  );
}

export function HyperliquidCard({ feed, portfolio }: { feed: Feed; portfolio: PortfolioFeed }) {
  const copy = useCopy();
  const logos = useTickerLogos(["HYPE"]);
  const [manual, setManual] = useState(false);
  const [removing, setRemoving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const stored = feed.data?.connections.find((entry) => entry.exchange === "hyperliquid")?.walletAddress ?? null;
  const session = feed.data?.sessionWallet ?? null;
  const address = stored ?? session;
  const canSave = feed.data !== null && feed.data.unavailable === undefined;
  const badge = badgeFor(feed, portfolio, "hyperliquid", address !== null, removing);

  return (
    <VenueCard
      mark={<CoinMark symbol="HYPE" logo={logos("HYPE").logo} size={40} />}
      title="Hyperliquid"
      subtitle="Wallet access · No API key needed"
      status={<StatusBadge status={badge.status} label={badge.label} />}
    >
      {address !== null ? (
        <>
          <View style={styles.address}>
            <View style={styles.flex}>
              <Text variant="label" tone="muted">
                {stored === null ? "Your account's wallet" : "Saved address"}
              </Text>
              <Text variant="mono-addr" numberOfLines={1}>
                {truncateMiddle(address, 6, 4)}
              </Text>
            </View>
            <Button label="Copy" size="sm" variant="ghost" accessibilityLabel="Copy the Hyperliquid address" onPress={() => void copy(address, "Hyperliquid address")} />
          </View>
          {badge.reason !== null && (
            <Notice tone="negative">
              Could not read the account: {badge.reason}
            </Notice>
          )}
        </>
      ) : feed.data !== null ? (
        <Text variant="body-sm" tone="secondary">
          This account has no EVM wallet to read Hyperliquid from. Enter the address that holds your Hyperliquid account instead.
        </Text>
      ) : null}
      {stored !== null ? (
        <Button
          label={removing ? "Removing…" : session === null ? "Remove saved address" : "Use my account's wallet instead"}
          size="sm"
          variant="ghost"
          disabled={removing}
          onPress={async () => {
            setRemoving(true);
            const result = await disconnect("hyperliquid");
            setError(result.ok ? null : result.error);
            setRemoving(false);
          }}
        />
      ) : canSave && address === null ? (
        <AddressForm />
      ) : canSave ? (
        manual ? (
          <AddressForm />
        ) : (
          <Button label="Read a different address" size="sm" variant="ghost" onPress={() => setManual(true)} />
        )
      ) : null}
      {feed.data?.unavailable !== undefined && <Notice tone="caution">{feed.data.unavailable}</Notice>}
      {error !== null && <Notice tone="negative">{error}</Notice>}
    </VenueCard>
  );
}

/** How to make a key Elyra will accept. Each step is something the API's check enforces or depends on. */
function KeyGuide() {
  return (
    <View style={styles.card}>
      <Text variant="label">Making a read-only key</Text>
      {[
        "In Binance, open API Management and create a system-generated key.",
        "Leave only Enable Reading on. Elyra checks the key's permissions with Binance and refuses one that can trade, transfer or withdraw.",
        "If you restrict the key to trusted IPs, the list has to include the address Elyra connects from, or Binance will refuse the check.",
        "Paste the key and secret here. They are encrypted on arrival and never shown again.",
      ].map((step, index) => (
        <Text key={step} variant="label" tone="secondary">
          {index + 1}. {step}
        </Text>
      ))}
      <Button
        label="Open Binance API Management"
        size="sm"
        variant="ghost"
        icon={<ExternalLink size={12} strokeWidth={1.5} color={color["text-secondary"]} />}
        onPress={() => openExternal("https://www.binance.com/en/my/settings/api-management")}
      />
    </View>
  );
}

/** A masked field that holds a credential for one submit — never autofilled, never suggested. */
function KeyField({ label, value, onChange }: { label: string; value: string; onChange: (next: string) => void }) {
  return (
    <TextField
      label={label}
      value={value}
      onChangeText={onChange}
      secureTextEntry
      autoCapitalize="none"
      autoCorrect={false}
      autoComplete="off"
      importantForAutofill="no"
      textContentType="none"
      spellCheck={false}
      placeholder={`Paste your ${label.toLowerCase()}`}
    />
  );
}

export function BinanceCard({ feed, portfolio }: { feed: Feed; portfolio: PortfolioFeed }) {
  const logos = useTickerLogos(["BNB"]);
  const now = useMinute();
  const [apiKey, setApiKey] = useState("");
  const [apiSecret, setApiSecret] = useState("");
  const [replacing, setReplacing] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const [disconnecting, setDisconnecting] = useState(false);
  const [guide, setGuide] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [ipRestricted, setIpRestricted] = useState<boolean | null>(null);
  const row = feed.data?.connections.find((entry) => entry.exchange === "binance") ?? null;
  const badge = badgeFor(feed, portfolio, "binance", row !== null, submitting || disconnecting);
  const valid = isBinanceCredential(apiKey) && isBinanceCredential(apiSecret);

  const submit = async () => {
    if (!valid || submitting) return;
    const key = apiKey.trim();
    const secret = apiSecret.trim();
    /* Cleared now, whatever the answer: the pair is held for one submit. */
    setApiKey("");
    setApiSecret("");
    setSubmitting(true);
    setError(null);
    const result = await connectBinance(key, secret);
    setSubmitting(false);
    if (result.ok) {
      setReplacing(false);
      setIpRestricted(result.data.ipRestricted === true);
    } else {
      setError(`${result.error} Paste the key and secret again to retry.`);
    }
  };

  const form = (
    <View style={keyStyles.form}>
      <Notice tone="caution">Read-only access required. Disable trading permissions and set an IP allowlist.</Notice>
      <KeyField label="API key" value={apiKey} onChange={setApiKey} />
      <KeyField label="API secret" value={apiSecret} onChange={setApiSecret} />
      {(apiKey.length > 0 && !isBinanceCredential(apiKey)) || (apiSecret.length > 0 && !isBinanceCredential(apiSecret)) ? (
        <Text variant="label" tone="negative">
          Paste each value whole — letters and numbers only, no spaces.
        </Text>
      ) : null}
      <View style={keyStyles.row}>
        <Button label={submitting ? "Checking the key with Binance…" : "Connect Binance"} variant="accent" loading={submitting} disabled={!valid || submitting} onPress={() => void submit()} />
        {replacing && <Button label="Keep the current key" variant="ghost" onPress={() => setReplacing(false)} />}
      </View>
      {guide ? <KeyGuide /> : <Button label="Setup guide" size="sm" variant="ghost" onPress={() => setGuide(true)} />}
    </View>
  );

  return (
    <VenueCard
      mark={<CoinMark symbol="BNB" logo={logos("BNB").logo} size={40} />}
      title="Binance"
      subtitle="Read your positions and equity"
      status={<StatusBadge status={badge.status} label={badge.label} />}
    >
      {row !== null && !replacing ? (
        <>
          <View style={styles.address}>
            <KeyRound size={16} strokeWidth={1.5} color={color["text-muted"]} />
            <View style={styles.flex}>
              <Text variant="body-sm">{row.keyLastFour === null ? "API key stored" : `Key ending ${row.keyLastFour}`}</Text>
              <Text variant="label" tone="muted">
                Connected {formatRelativeTime(row.connectedAt, now)}
              </Text>
            </View>
          </View>
          {badge.reason !== null && <Notice tone="negative">Could not read the account: {badge.reason}</Notice>}
          {ipRestricted === false && <Notice tone="caution">This key has no IP allowlist. Adding one in Binance limits where the key can be used from.</Notice>}
          <View style={keyStyles.row}>
            <Button label="Replace key" size="sm" variant="ghost" onPress={() => setReplacing(true)} />
            <Button label="Disconnect" size="sm" variant="danger" disabled={disconnecting} onPress={() => setConfirming(true)} />
          </View>
        </>
      ) : feed.data !== null ? (
        form
      ) : null}
      {error !== null && <Notice tone="negative">{error}</Notice>}
      <Dialog open={confirming} title="Remove the stored key?" onClose={() => setConfirming(false)}>
        <Text variant="body-sm" tone="secondary">
          Elyra will stop reading your Binance account, and the encrypted key is deleted. You can connect again with a new key.
        </Text>
        <View style={keyStyles.row}>
          <Button label="Keep it" variant="ghost" onPress={() => setConfirming(false)} />
          <Button
            label={disconnecting ? "Removing…" : "Disconnect"}
            variant="danger"
            loading={disconnecting}
            onPress={async () => {
              setConfirming(false);
              setDisconnecting(true);
              const result = await disconnect("binance");
              setError(result.ok ? null : result.error);
              setIpRestricted(null);
              setDisconnecting(false);
            }}
          />
        </View>
      </Dialog>
    </VenueCard>
  );
}

const keyStyles = {
  form: { gap: 10 },
  row: { flexDirection: "row", flexWrap: "wrap", gap: 8, justifyContent: "flex-end" },
} as const;
