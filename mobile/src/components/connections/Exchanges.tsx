import { useRef, useState } from "react";
import { Pressable, StyleSheet, View } from "react-native";
import { ChevronDown, ChevronUp, Copy, ExternalLink, KeyRound, RefreshCw, Search, Trash2 } from "lucide-react-native";
import { isBinanceCredential, isEvmAddress, type ConnectionStatus } from "@/lib/connections/state";
import type { ExchangesResponse, HyperliquidAccountCheck } from "@/lib/connections/types";
import { hyperliquidIcon } from "@/lib/market/tickerLogoData";
import { formatRelativeTime, formatUsd, truncateMiddle } from "@/lib/format";
import { LabeledInput, StatusBadge, VenueCard, styles, venueStatus } from "~/components/connections/parts";
import { WideButton } from "~/components/shell/flow";
import { Button, IconButton } from "~/components/ui/controls";
import { Dialog } from "~/components/ui/overlays";
import { CoinMark } from "~/components/ui/marks";
import { Text } from "~/components/ui/Text";
import { Notice, openExternal, useCopy } from "~/components/wallet/parts";
import type { AccountFeed } from "~/lib/stores/createAccountStore";
import { connectBinance, disconnect, previewHyperliquid, saveHyperliquid } from "~/lib/stores/connections";
import { useTickerLogos } from "~/lib/stores/market";
import type { PortfolioFeed } from "~/lib/stores/portfolio";
import { useMinute } from "~/lib/useClock";
import { fontFamily } from "~/theme/fonts";
import { color } from "~/theme/tokens";

/* ---------------------------------------------------------------------------
   Exchanges — the website's HyperliquidCard and BinanceCard.

   HYPERLIQUID is read from an address, with no key: the account's own EVM
   wallet by default, or an address the person names — read and shown to
   them first, saved only once they say it is theirs. Being readable is not
   proof of ownership, so nothing is saved on a check alone.

   BINANCE takes a read-only API key. The key and secret are typed into
   fields that hold them for one submit and are cleared after it, whatever
   the answer — the secret masked unless the person shows it. They are sent
   once to the API, which checks with Binance that the key cannot trade,
   transfer or withdraw, encrypts it, and never returns it. Nothing on the
   phone keeps them, and a stored key is shown only by its last four.

   An IP allowlist is not recommended here: Elyra publishes no fixed server
   address to add, and a key limited to other addresses fails the check
   (lib/exchange/binance.ts). Read-only is what the API enforces.
--------------------------------------------------------------------------- */

type Feed = AccountFeed<ExchangesResponse>;

const HYPE_LOGO = hyperliquidIcon("HYPE");

function badgeFor(feed: Feed, portfolio: PortfolioFeed, venue: string, linked: boolean, busy: boolean): { status: ConnectionStatus; label?: string; reason: string | null } {
  if (busy) return { status: "connecting", reason: null };
  if (feed.data === null) return feed.loading ? { status: "checking", reason: null } : { status: "attention", label: "Couldn't check", reason: feed.error };
  if (!linked) return { status: "not-connected", reason: null };
  return venueStatus(portfolio, venue);
}

/** What an address holds on Hyperliquid, shown before it is saved. */
function Found({ found, saving, onSave }: { found: HyperliquidAccountCheck; saving: boolean; onSave: () => void }) {
  const empty = found.accountValueUsd === 0 && found.positionCount === 0 && found.spotBalanceCount === 0;
  return (
    <View style={styles.preview} accessibilityLiveRegion="polite">
      <Text variant="body-sm" tone="secondary">
        Found at
      </Text>
      <Text variant="body" style={local.mono} accessibilityLabel={`Address ${found.address}`}>
        {truncateMiddle(found.address, 6, 4)}
      </Text>
      <Text variant="body" style={local.summary}>
        {empty
          ? "Nothing is held at this address on Hyperliquid."
          : `${formatUsd(found.accountValueUsd)} · ${found.positionCount} open position${found.positionCount === 1 ? "" : "s"}${found.spotBalanceCount > 0 ? ` · ${found.spotBalanceCount} spot balance${found.spotBalanceCount === 1 ? "" : "s"}` : ""}`}
      </Text>
      {empty && (
        <Text variant="body-sm" tone="caution">
          That is normal for a new account; if you expected positions, check the address.
        </Text>
      )}
      <Text variant="body-sm" tone="secondary">
        Anyone&apos;s address can be read. Save it only if it is yours.
      </Text>
      <WideButton label={saving ? "Saving…" : empty ? "Use it anyway" : "This is mine — use it"} variant="accent" busy={saving} onPress={onSave} />
    </View>
  );
}

function AddressForm() {
  const [draft, setDraft] = useState("");
  const [checking, setChecking] = useState(false);
  const [saving, setSaving] = useState(false);
  const [found, setFound] = useState<HyperliquidAccountCheck | null>(null);
  const [error, setError] = useState<string | null>(null);
  /* A check answered after the address changed is about another address. */
  const ticket = useRef(0);
  const value = draft.trim();
  const valid = isEvmAddress(value);

  const check = async () => {
    if (!valid || checking) return;
    const mine = ++ticket.current;
    setChecking(true);
    setError(null);
    const result = await previewHyperliquid(value);
    if (mine !== ticket.current) return;
    if (result.ok) setFound(result.data);
    else setError(result.error);
    setChecking(false);
  };

  return (
    <View style={local.form}>
      <LabeledInput
        label="Hyperliquid address"
        value={draft}
        onChangeText={(next) => {
          ticket.current += 1;
          setDraft(next);
          setFound(null);
          setError(null);
          setChecking(false);
        }}
        onSubmitEditing={() => void check()}
        returnKeyType="search"
        placeholder="0x…"
        hint="The address you trade from. Read access only."
        error={value.length >= 42 && !valid ? "An address starts 0x and is 42 characters long." : null}
      />
      <WideButton
        label={checking ? "Checking…" : "Check address"}
        variant={valid ? "accent" : "outline"}
        leading={checking ? undefined : Search}
        busy={checking}
        disabled={!valid || saving}
        onPress={() => void check()}
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

/** A linked account's address, inset, with copy. */
function LinkedAddress({ label, address, what }: { label: string; address: string; what: string }) {
  const copy = useCopy();
  return (
    <View style={styles.address}>
      <View style={styles.flex}>
        <Text variant="body-sm" tone="secondary">
          {label}
        </Text>
        <Text variant="body" numberOfLines={1} style={local.mono} accessibilityLabel={`${label} ${address}`}>
          {truncateMiddle(address, 6, 4)}
        </Text>
      </View>
      <IconButton accessibilityLabel={`Copy the ${what}`} onPress={() => void copy(address, what)}>
        <Copy size={20} strokeWidth={1.5} color={color["text-secondary"]} />
      </IconButton>
    </View>
  );
}

export function HyperliquidCard({ feed, portfolio }: { feed: Feed; portfolio: PortfolioFeed }) {
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
      mark={<CoinMark symbol="HYPE" logo={HYPE_LOGO} size={56} />}
      title="Hyperliquid"
      subtitle="Wallet access · No API key needed"
      status={<StatusBadge status={badge.status} label={badge.label} />}
    >
      {address !== null ? (
        <>
          <LinkedAddress label={stored === null ? "Your account's wallet" : "Saved address"} address={address} what="Hyperliquid address" />
          {badge.reason !== null && <Notice tone="negative">Could not read the account: {badge.reason}</Notice>}
        </>
      ) : feed.data !== null ? (
        <Text variant="body" tone="secondary" style={local.lead}>
          No EVM wallet is linked. Enter your Hyperliquid account address instead.
        </Text>
      ) : null}
      {stored !== null ? (
        <WideButton
          label={removing ? "Removing…" : session === null ? "Remove saved address" : "Use my account's wallet instead"}
          variant="outline"
          busy={removing}
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
          <WideButton label="Read a different address" variant="outline" onPress={() => setManual(true)} />
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
    <View style={styles.preview}>
      <Text variant="body" style={local.guideTitle}>
        Making a read-only key
      </Text>
      {[
        "In Binance, open API Management and create a system-generated key.",
        "Leave only Enable Reading on. Elyra checks the key's permissions with Binance and refuses one that can trade, transfer or withdraw.",
        "Leave the IP restriction off. Elyra doesn't publish a fixed server address, so a key limited to trusted IPs fails the check.",
        "Paste the key and secret here. They are encrypted on arrival and never shown again.",
      ].map((step, index) => (
        <View key={step} style={local.step}>
          <Text variant="data" tone="accent" style={local.stepNumber}>
            {index + 1}
          </Text>
          <Text variant="body" tone="secondary" style={[styles.flex, local.stepText]}>
            {step}
          </Text>
        </View>
      ))}
      <WideButton
        label="Open Binance API Management"
        variant="outline"
        leading={ExternalLink}
        accessibilityHint="Opens Binance in your browser"
        onPress={() => openExternal("https://www.binance.com/en/my/settings/api-management")}
      />
    </View>
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
  const row = feed.data?.connections.find((entry) => entry.exchange === "binance") ?? null;
  const badge = badgeFor(feed, portfolio, "binance", row !== null, submitting || disconnecting);
  const valid = isBinanceCredential(apiKey) && isBinanceCredential(apiSecret);
  const malformed = (apiKey.length > 0 && !isBinanceCredential(apiKey)) || (apiSecret.length > 0 && !isBinanceCredential(apiSecret));

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
    if (result.ok) setReplacing(false);
    else setError(`${result.error} Paste the key and secret again to retry.`);
  };

  const form = (
    <View style={local.form}>
      <Notice tone="caution">Use a read-only API key: leave only Enable Reading on. Elyra refuses a key that can trade, transfer or withdraw.</Notice>
      <LabeledInput label="API key" value={apiKey} onChangeText={setApiKey} placeholder="Paste your API key" />
      <LabeledInput
        label="API secret"
        value={apiSecret}
        onChangeText={setApiSecret}
        placeholder="Enter your API secret"
        secret
        onSubmitEditing={() => void submit()}
        returnKeyType="done"
      />
      {/* About either field, so under both rather than marking one. */}
      {malformed && (
        <Text variant="body-sm" tone="negative" accessibilityLiveRegion="polite">
          Paste each value whole: 32 to 128 letters and numbers, no spaces.
        </Text>
      )}
      <WideButton
        label={submitting ? "Checking the key with Binance…" : "Connect Binance"}
        variant={valid ? "accent" : "outline"}
        busy={submitting}
        disabled={!valid}
        onPress={() => void submit()}
      />
      {replacing && <WideButton label="Keep the current key" variant="outline" onPress={() => setReplacing(false)} />}
      <Pressable
        onPress={() => setGuide((value) => !value)}
        accessibilityRole="button"
        accessibilityState={{ expanded: guide }}
        style={local.guideLink}
      >
        <Text variant="body" style={local.guideLinkText}>
          Setup guide
        </Text>
        {guide ? (
          <ChevronUp size={20} strokeWidth={1.75} color={color["accent-hover"]} />
        ) : (
          <ChevronDown size={20} strokeWidth={1.75} color={color["accent-hover"]} />
        )}
      </Pressable>
      {guide && <KeyGuide />}
    </View>
  );

  return (
    <VenueCard
      mark={<CoinMark symbol="BNB" logo={logos("BNB").logo} size={56} />}
      title="Binance"
      subtitle="Positions and equity"
      status={<StatusBadge status={badge.status} label={badge.label} />}
    >
      {row !== null && !replacing ? (
        <>
          <View style={styles.address}>
            <KeyRound size={20} strokeWidth={1.5} color={color["text-secondary"]} />
            <View style={styles.flex}>
              <Text variant="body" style={local.summary}>
                {row.keyLastFour === null ? "API key stored" : `Key ending ${row.keyLastFour}`}
              </Text>
              <Text variant="body-sm" tone="secondary">
                Connected {formatRelativeTime(row.connectedAt, now)}
              </Text>
            </View>
          </View>
          {badge.reason !== null && <Notice tone="negative">Could not read the account: {badge.reason}</Notice>}
          <WideButton label="Replace key" variant="outline" leading={RefreshCw} onPress={() => setReplacing(true)} />
          <WideButton label="Disconnect" variant="outline" leading={Trash2} busy={disconnecting} onPress={() => setConfirming(true)} />
        </>
      ) : feed.data !== null ? (
        form
      ) : null}
      {error !== null && <Notice tone="negative">{error}</Notice>}
      <Dialog open={confirming} title="Remove the stored key?" onClose={() => setConfirming(false)}>
        <Text variant="body-sm" tone="secondary">
          Elyra will stop reading your Binance account, and the encrypted key is deleted. You can connect again with a new key.
        </Text>
        <View style={local.dialogRow}>
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
              setDisconnecting(false);
            }}
          />
        </View>
      </Dialog>
    </VenueCard>
  );
}

const local = StyleSheet.create({
  form: { gap: 16 },
  lead: { fontSize: 16, lineHeight: 23 },
  mono: { fontFamily: fontFamily("sans", 500), fontSize: 16, lineHeight: 22, letterSpacing: 0.3 },
  summary: { fontFamily: fontFamily("sans", 500), fontSize: 16, lineHeight: 22 },
  guideTitle: { fontFamily: fontFamily("sans", 500), fontSize: 16, lineHeight: 22 },
  step: { flexDirection: "row", gap: 12, alignItems: "flex-start" },
  stepNumber: { width: 16, fontSize: 15, lineHeight: 21 },
  stepText: { fontSize: 15, lineHeight: 21 },
  guideLink: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 6, minHeight: 48, alignSelf: "center", paddingHorizontal: 12 },
  guideLinkText: { color: color["accent-hover"], fontFamily: fontFamily("sans", 500), fontSize: 16, lineHeight: 22, textDecorationLine: "underline" },
  dialogRow: { flexDirection: "row", flexWrap: "wrap", gap: 8, justifyContent: "flex-end" },
});
