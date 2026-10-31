import { forwardRef, useImperativeHandle, useMemo, useRef, useState } from "react";
import { ActivityIndicator, Pressable, StyleSheet, View } from "react-native";
import { router } from "expo-router";
import { BottomSheetTextInput } from "@gorhom/bottom-sheet";
import { ArrowLeft, ArrowRight, Bell, BellOff, Check, ChevronDown, Search } from "lucide-react-native";
import { isPast, parseTarget, suggestedTarget } from "@/lib/alerts/rules";
import { formatPriceUsd } from "@/lib/format";
import type { PythAsset } from "@/lib/market/pyth/types";
import { ruleKey } from "~/components/alerts/PriceRuleCard";
import { WideButton } from "~/components/shell/flow";
import { CoinMark } from "~/components/ui/marks";
import { BottomSheet, type BottomSheetHandle } from "~/components/ui/overlays";
import { Text } from "~/components/ui/Text";
import { Notice, outcomeHaptic } from "~/components/wallet/parts";
import { notificationDeliveryLine, usePushState } from "~/lib/notifications/push";
import { useNotificationPreferences } from "~/lib/notifications/stores";
import type { AlertsFeed } from "~/lib/stores/alerts";
import { useAssetSearch, useAssetsBySymbols, usePrices, useTickerLogos } from "~/lib/stores/market";
import { useWatchlist } from "~/lib/stores/watchlist";
import { fontFamily } from "~/theme/fonts";
import { color, radius, TOUCH_TARGET } from "~/theme/tokens";

/* ---------------------------------------------------------------------------
   A new price rule, in a bottom sheet over Alerts & automation.

   THE MARKET is chosen from Elyra's market list — the watchlist first, then
   Pyth's catalogue as it is searched — in the same sheet, so the form
   keeps its place. A rule is stored by ticker and the server prices it by
   ticker (pricesForSymbols), so the price shown here is resolved the same
   way (useAssetsBySymbols), not from the row that was tapped.

   THE TARGET is parsed by parseTarget: a plain decimal, above zero, no finer
   than the precision it is shown at. A level the price is already past is
   allowed, as the server allows it, and said: it fires on the next check.

   THE CHECK is the server's five-minute delivery pass (Supabase pg_cron),
   which tells the person once, the first time it finds the price at or past
   the level. Nothing here watches prices on a timer. Where the alert goes
   is the push state and the price-alert preference, as the notification
   settings screen says it — push is promised only when it is on.

   What was typed stays when the sheet is closed or a save fails; a saved
   rule clears it. Save is pinned above the keyboard and cannot be sent
   twice.
--------------------------------------------------------------------------- */

export interface NewPriceRuleSheetHandle {
  open: () => void;
}

const TICKER = /^[A-Z0-9]{1,12}$/;

function ConditionSwitch({ value, onChange }: { value: "above" | "below"; onChange: (value: "above" | "below") => void }) {
  return (
    <View accessibilityRole="radiogroup" accessibilityLabel="Condition" style={styles.segments}>
      {(["above", "below"] as const).map((side) => {
        const selected = side === value;
        return (
          <Pressable
            key={side}
            onPress={() => !selected && onChange(side)}
            accessibilityRole="radio"
            accessibilityState={{ checked: selected }}
            style={({ pressed }) => [styles.segment, selected && styles.segmentOn, pressed && !selected && styles.pressed]}
          >
            <Text
              key={selected ? "on" : "off"}
              variant="body"
              tone={selected ? "on-accent" : "primary"}
              maxFontSizeMultiplier={1.3}
              style={[styles.segmentLabel, selected && styles.segmentLabelOn]}
            >
              {side === "above" ? "Rises above" : "Falls below"}
            </Text>
          </Pressable>
        );
      })}
    </View>
  );
}

function MarketPicker({ selected, onPick }: { selected: string; onPick: (symbol: string) => void }) {
  const [query, setQuery] = useState("");
  const trimmed = query.trim();
  const watchlist = useWatchlist();
  const { bySymbol: watched } = useAssetsBySymbols(watchlist.symbols);
  const search = useAssetSearch(trimmed, trimmed === "" ? "crypto" : null);

  const rows = useMemo(() => {
    const seen = new Set<string>();
    const out: PythAsset[] = [];
    const add = (asset: PythAsset | undefined) => {
      if (asset === undefined) return;
      const symbol = asset.symbol.toUpperCase();
      if (seen.has(symbol) || !TICKER.test(symbol)) return;
      seen.add(symbol);
      out.push(asset);
    };
    if (trimmed === "") for (const symbol of watchlist.symbols) add(watched.get(symbol.toUpperCase()));
    for (const asset of search.assets) add(asset);
    return out.slice(0, 40);
  }, [trimmed, watchlist.symbols, watched, search.assets]);
  const logos = useTickerLogos(useMemo(() => rows.map((asset) => asset.symbol), [rows]));

  return (
    <View style={styles.picker}>
      <View style={styles.searchField}>
        <Search size={20} strokeWidth={1.5} color={color["text-secondary"]} />
        <BottomSheetTextInput
          value={query}
          onChangeText={setQuery}
          autoFocus
          autoCapitalize="characters"
          autoCorrect={false}
          placeholder="Search a market, such as SOL"
          placeholderTextColor={color["text-muted"]}
          selectionColor={color.accent}
          accessibilityLabel="Search markets"
          style={styles.searchInput}
        />
      </View>
      {search.status === "loading" && rows.length === 0 ? (
        <View style={styles.pickerState}>
          <ActivityIndicator size="small" color={color["text-secondary"]} />
          <Text variant="body" tone="secondary">
            Searching markets…
          </Text>
        </View>
      ) : search.status === "error" && rows.length === 0 ? (
        <View style={styles.pickerState}>
          <Text variant="body" tone="negative">
            {search.error ?? "Markets could not be searched."} Type again to retry.
          </Text>
        </View>
      ) : rows.length === 0 ? (
        <View style={styles.pickerState}>
          <Text variant="body" tone="secondary">
            {trimmed === "" ? "Type a market to search." : `No market matches “${trimmed}”.`}
          </Text>
        </View>
      ) : (
        <View style={styles.pickerList}>
          {rows.map((asset, index) => {
            const symbol = asset.symbol.toUpperCase();
            const on = symbol === selected;
            const logo = logos(symbol);
            return (
              <Pressable
                key={asset.id}
                onPress={() => onPick(symbol)}
                accessibilityRole="button"
                accessibilityLabel={`${symbol}, ${asset.name}`}
                accessibilityState={{ selected: on }}
                android_ripple={{ color: color["surface-hover"] }}
                style={({ pressed }) => [styles.pickerRow, index > 0 && styles.pickerRule, pressed && styles.pressed]}
              >
                <CoinMark symbol={symbol} logo={asset.logo ?? logo.logo} fallbackLogo={logo.fallbackLogo} size={36} />
                <View style={styles.flex}>
                  <Text variant="body" numberOfLines={1} style={styles.pickerSymbol}>
                    {symbol}
                  </Text>
                  <Text variant="body-sm" tone="secondary" numberOfLines={1}>
                    {asset.name}
                  </Text>
                </View>
                {on && <Check size={20} strokeWidth={1.75} color={color["accent-hover"]} />}
              </Pressable>
            );
          })}
        </View>
      )}
    </View>
  );
}

export const NewPriceRuleSheet = forwardRef<
  NewPriceRuleSheetHandle,
  { feed: AlertsFeed; initialSymbol: string; onSaved: (key: string) => void }
>(function NewPriceRuleSheet({ feed, initialSymbol, onSaved }, ref) {
  const sheet = useRef<BottomSheetHandle>(null);
  const push = usePushState();
  const preferences = useNotificationPreferences();
  const [chosen, setChosen] = useState<string | null>(null);
  /* Until a market is chosen, the sheet follows the market last opened —
     it resolves after the first render. */
  const symbol = chosen ?? initialSymbol;
  const [picking, setPicking] = useState(false);
  const [direction, setDirection] = useState<"above" | "below">("above");
  const [target, setTarget] = useState("");
  const [saving, setSaving] = useState(false);
  const sending = useRef(false);
  const [error, setError] = useState<string | null>(null);
  /* Where the body and the price field sit in the sheet's scroll, so the
     field can be brought above the keyboard when it takes focus. */
  const bodyY = useRef(0);
  const priceY = useRef(0);

  useImperativeHandle(ref, () => ({
    open: () => {
      setPicking(symbol === "");
      sheet.current?.present();
    },
  }));

  const lookup = useMemo(() => (symbol === "" ? [] : [symbol]), [symbol]);
  const { bySymbol, resolved } = useAssetsBySymbols(lookup);
  const asset = bySymbol.get(symbol);
  const ids = useMemo(() => (asset ? [asset.id] : []), [asset]);
  const live = usePrices(ids);
  const price = asset ? (live.rows.get(asset.id)?.price ?? null) : null;
  const logo = useTickerLogos(lookup)(symbol);

  const parsed = parseTarget(target);
  const past = parsed.ok && price !== null && isPast({ direction, target: parsed.value }, price);
  const delivery = notificationDeliveryLine(preferences.data?.priceAlerts, push.status, push.priceChannelEnabled);
  /* The same three conditions notificationDeliveryLine calls "Push + inbox". */
  const pushing = preferences.data?.priceAlerts === true && push.status === "on" && push.priceChannelEnabled !== false;

  const pick = (next: string) => {
    if (next !== symbol) {
      setChosen(next);
      /* A level typed for one market means nothing for another. */
      setTarget("");
      setError(null);
    }
    setPicking(false);
  };

  const turn = (side: "above" | "below") => {
    /* A suggested level follows the side; a level the person typed stays. */
    if (target === "" || target === suggestedTarget(price, direction)) setTarget(suggestedTarget(price, side));
    setDirection(side);
  };

  const submit = async () => {
    if (sending.current || !parsed.ok || symbol === "") return;
    sending.current = true;
    setSaving(true);
    setError(null);
    const failure = await feed.create({ symbol, direction, target: parsed.value, currentPrice: price });
    sending.current = false;
    setSaving(false);
    outcomeHaptic(failure === null ? "success" : "error");
    if (failure !== null) {
      setError(failure);
      return;
    }
    onSaved(ruleKey({ symbol, direction, target: parsed.value }));
    setTarget("");
    sheet.current?.dismiss();
  };

  const priceLine =
    symbol === ""
      ? "Choose a market to see its price."
      : price !== null
        ? `Current price: ${formatPriceUsd(price)}.`
        : !resolved.has(symbol) || (asset !== undefined && live.status === "loading")
          ? "Reading the current price…"
          : asset === undefined
            ? `${symbol} isn't in Elyra's price list, so a rule on it can't be checked.`
            : `No live price for ${symbol} right now. The rule is checked against Elyra's prices once saved.`;

  const footer = picking ? undefined : (
    <WideButton
      label={saving ? "Saving…" : "Save rule"}
      variant="accent"
      trailing={saving ? undefined : ArrowRight}
      busy={saving}
      disabled={!parsed.ok || symbol === ""}
      onPress={() => void submit()}
    />
  );

  return (
    <BottomSheet
      ref={sheet}
      title={picking ? "Choose a market" : "New price rule"}
      display
      keyboard
      footer={footer}
      onBack={() => {
        if (!picking || symbol === "") return false;
        setPicking(false);
        return true;
      }}
    >
      {picking ? (
        <View style={styles.body}>
          {symbol !== "" && (
            <Pressable onPress={() => setPicking(false)} accessibilityRole="button" style={styles.back}>
              <ArrowLeft size={20} strokeWidth={1.5} color={color["text-secondary"]} />
              <Text variant="body" tone="secondary">
                Back to the rule
              </Text>
            </Pressable>
          )}
          <MarketPicker selected={symbol} onPick={pick} />
        </View>
      ) : (
        <View style={styles.body} onLayout={(event) => (bodyY.current = event.nativeEvent.layout.y)}>
          <Text variant="body" tone="secondary" style={styles.lead}>
            Checked every 5 minutes. You&apos;re notified once, the first time the price is at or past your target.
          </Text>

          <View style={styles.field}>
            <Text variant="body" style={styles.label}>
              Market
            </Text>
            <Pressable
              onPress={() => setPicking(true)}
              accessibilityRole="button"
              accessibilityLabel={symbol === "" ? "Market: none chosen" : `Market: ${symbol}${asset ? `, ${asset.name}` : ""}`}
              accessibilityHint="Opens the market list"
              style={({ pressed }) => [styles.select, pressed && styles.pressed]}
            >
              {symbol !== "" && <CoinMark symbol={symbol} logo={asset?.logo ?? logo.logo} fallbackLogo={logo.fallbackLogo} size={44} />}
              <View style={styles.flex}>
                <Text variant="body" tone={symbol === "" ? "muted" : "primary"} numberOfLines={1} style={styles.selectText}>
                  {symbol === "" ? "Choose a market" : symbol}
                </Text>
                {asset !== undefined && (
                  <Text variant="body-sm" tone="secondary" numberOfLines={1}>
                    {asset.name}
                  </Text>
                )}
              </View>
              <ChevronDown size={24} strokeWidth={1.5} color={color["text-primary"]} />
            </Pressable>
          </View>

          <View style={styles.field}>
            <Text variant="body" style={styles.label}>
              Condition
            </Text>
            <ConditionSwitch value={direction} onChange={turn} />
          </View>

          <View style={styles.field} onLayout={(event) => (priceY.current = event.nativeEvent.layout.y)}>
            <Text variant="body" style={styles.label}>
              Target price · USD
            </Text>
            <View style={[styles.input, parsed.ok === false && parsed.error !== null && styles.inputError]}>
              <Text variant="body" style={styles.affix} accessible={false}>
                $
              </Text>
              <BottomSheetTextInput
                value={target}
                onChangeText={(next) => {
                  setTarget(next.replace(",", ".").replace(/[^\d.]/g, ""));
                  setError(null);
                }}
                onFocus={() => {
                  if (target === "") setTarget(suggestedTarget(price, direction));
                  /* After the sheet has risen with the keyboard. */
                  setTimeout(() => sheet.current?.scrollTo?.(bodyY.current + priceY.current - 16), 300);
                }}
                keyboardType="decimal-pad"
                inputMode="decimal"
                placeholder={price === null ? "0.00" : suggestedTarget(price, direction)}
                placeholderTextColor={color["text-muted"]}
                selectionColor={color.accent}
                accessibilityLabel="Target price in US dollars"
                accessibilityHint={parsed.ok === false && parsed.error !== null ? parsed.error : undefined}
                style={styles.inputText}
              />
              <Text variant="body" tone="secondary" style={styles.unit} accessible={false}>
                USD
              </Text>
            </View>
            {parsed.ok === false && parsed.error !== null && (
              <Text variant="body-sm" tone="negative" accessibilityLiveRegion="polite">
                {parsed.error}
              </Text>
            )}
            <Text variant="body" tone="secondary" style={styles.help}>
              {priceLine}
            </Text>
            {past && (
              <Text variant="body" tone="caution" style={styles.help} accessibilityLiveRegion="polite">
                {symbol} is already {direction === "above" ? "at or above" : "at or below"} this price, so the rule fires on the next check.
              </Text>
            )}
          </View>

          <View style={styles.box} accessible accessibilityLabel={parsed.ok ? `Your alert: notify me when ${symbol} trades at or ${direction} ${formatPriceUsd(parsed.value)}` : "Your alert: choose a target price"}>
            <Bell size={26} strokeWidth={1.5} color={color["text-primary"]} />
            <View style={styles.boxRule} />
            <View style={styles.flex}>
              <Text variant="eyebrow" tone="secondary">
                Your alert
              </Text>
              <Text variant="body" style={styles.preview}>
                {parsed.ok && symbol !== ""
                  ? `Notify me when ${symbol} trades at or ${direction} ${formatPriceUsd(parsed.value)}.`
                  : "Enter a target price to see your alert."}
              </Text>
            </View>
          </View>

          <View style={styles.box}>
            {pushing ? (
              <Bell size={26} strokeWidth={1.5} color={color["text-primary"]} />
            ) : (
              <BellOff size={26} strokeWidth={1.5} color={color["text-secondary"]} />
            )}
            <View style={styles.boxRule} />
            <View style={styles.flex}>
              <Text variant="body" style={styles.deliveryTitle}>
                {delivery.title}
              </Text>
              <Text variant="body" tone="secondary" style={styles.help}>
                {pushing ? "Sent to this phone and saved in your inbox." : delivery.detail}
              </Text>
              <Pressable
                onPress={() => {
                  sheet.current?.dismiss();
                  router.push("/notification-settings");
                }}
                accessibilityRole="link"
                style={styles.settingsLink}
              >
                <Text variant="body" style={styles.linkText}>
                  Notification settings
                </Text>
                <ArrowRight size={18} strokeWidth={1.75} color={color["accent-hover"]} />
              </Pressable>
            </View>
          </View>

          <Text variant="body" tone="secondary" style={styles.help}>
            Rules send notifications only. They never place trades.
          </Text>
          {error !== null && <Notice tone="negative">{error}</Notice>}
          {!TICKER.test(symbol) && symbol !== "" && <Notice tone="negative">{symbol} isn&apos;t a ticker Elyra can watch.</Notice>}
        </View>
      )}
    </BottomSheet>
  );
});

const styles = StyleSheet.create({
  flex: { flex: 1, minWidth: 0 },
  pressed: { backgroundColor: color["surface-hover"] },
  body: { paddingHorizontal: 20, paddingBottom: 12, gap: 18 },
  lead: { fontSize: 16, lineHeight: 22, marginTop: -6 },
  field: { gap: 8 },
  label: { fontSize: 16, lineHeight: 22 },
  select: {
    flexDirection: "row",
    alignItems: "center",
    gap: 14,
    minHeight: 64,
    paddingLeft: 12,
    paddingRight: 16,
    borderRadius: radius.panel,
    borderWidth: 1,
    borderColor: color["border-strong"],
    backgroundColor: color["surface-base"],
  },
  selectText: { fontFamily: fontFamily("sans", 500), fontSize: 18, lineHeight: 24 },
  segments: {
    flexDirection: "row",
    padding: 4,
    borderRadius: radius.panel,
    borderWidth: 1,
    borderColor: color["border-strong"],
    backgroundColor: color["surface-base"],
  },
  segment: { flex: 1, minHeight: TOUCH_TARGET + 2, alignItems: "center", justifyContent: "center", borderRadius: radius.control, paddingHorizontal: 8 },
  segmentOn: { backgroundColor: color["accent-hover"] },
  segmentLabel: { fontSize: 16, lineHeight: 22, textAlign: "center", alignSelf: "stretch" },
  segmentLabelOn: { fontFamily: fontFamily("sans", 500) },
  input: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    minHeight: 60,
    paddingHorizontal: 16,
    borderRadius: radius.panel,
    borderWidth: 1,
    borderColor: color["border-strong"],
    backgroundColor: color["surface-base"],
  },
  inputError: { borderColor: color.negative },
  affix: { fontSize: 20, lineHeight: 26 },
  inputText: {
    flex: 1,
    minWidth: 0,
    minHeight: 56,
    color: color["text-primary"],
    fontFamily: fontFamily("sans", 500),
    fontSize: 20,
    fontVariant: ["tabular-nums"],
  },
  unit: { fontSize: 15, lineHeight: 20 },
  help: { fontSize: 15, lineHeight: 21 },
  box: {
    flexDirection: "row",
    alignItems: "center",
    gap: 16,
    padding: 16,
    borderRadius: radius.panel,
    borderWidth: 1,
    borderColor: color["border-subtle"],
    backgroundColor: color["surface-base"],
  },
  boxRule: { width: StyleSheet.hairlineWidth * 2, alignSelf: "stretch", backgroundColor: color["border-subtle"] },
  preview: { fontSize: 16, lineHeight: 23, marginTop: 4, fontVariant: ["tabular-nums"] },
  deliveryTitle: { fontFamily: fontFamily("sans", 500), fontSize: 16, lineHeight: 22 },
  settingsLink: { flexDirection: "row", alignItems: "center", gap: 6, minHeight: TOUCH_TARGET, alignSelf: "flex-start" },
  linkText: { color: color["accent-hover"], fontFamily: fontFamily("sans", 500), fontSize: 15, lineHeight: 20 },
  back: { flexDirection: "row", alignItems: "center", gap: 8, minHeight: TOUCH_TARGET, alignSelf: "flex-start", marginTop: -8 },
  picker: { gap: 12 },
  searchField: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    paddingHorizontal: 14,
    borderRadius: radius.panel,
    borderWidth: 1,
    borderColor: color["border-strong"],
    backgroundColor: color["surface-base"],
  },
  searchInput: { flex: 1, minHeight: 52, color: color["text-primary"], fontFamily: fontFamily("sans", 400), fontSize: 16 },
  pickerState: { flexDirection: "row", alignItems: "center", gap: 10, paddingVertical: 16 },
  pickerList: { borderRadius: radius.panel, borderWidth: 1, borderColor: color["border-subtle"], overflow: "hidden" },
  pickerRow: { flexDirection: "row", alignItems: "center", gap: 14, minHeight: 64, paddingHorizontal: 14, paddingVertical: 8 },
  pickerRule: { borderTopWidth: StyleSheet.hairlineWidth * 2, borderTopColor: color["border-subtle"] },
  pickerSymbol: { fontFamily: fontFamily("sans", 500), fontSize: 17, lineHeight: 23 },
});
