import { useMemo, useRef, useState } from "react";
import { Pressable, StyleSheet, View } from "react-native";
import { router } from "expo-router";
import { BellRing, ChevronRight, Plus, RotateCcw, Trash2 } from "lucide-react-native";
import { isPast, suggestedTarget } from "@/lib/alerts/rules";
import type { AppDelivery, PriceAlert } from "@/lib/alerts/types";
import { formatPriceUsd, formatRelativeTime, formatTimestamp } from "@/lib/format";
import { DetailScreen } from "~/components/portfolio/parts";
import { Button, IconButton, SegmentedControl } from "~/components/ui/controls";
import { Skeleton } from "~/components/ui/layout";
import { BottomSheet, type BottomSheetHandle } from "~/components/ui/overlays";
import { Text } from "~/components/ui/Text";
import { TextField } from "~/components/ui/TextField";
import { Notice, outcomeHaptic } from "~/components/wallet/parts";
import { notificationDeliveryLine, usePushState } from "~/lib/notifications/push";
import { useNotificationPreferences } from "~/lib/notifications/stores";
import { useAlerts, type AlertsFeed } from "~/lib/stores/alerts";
import { useAssets, useAssetsBySymbols, usePrices } from "~/lib/stores/market";
import { useAppStore } from "~/lib/store";
import { useMinute } from "~/lib/useClock";
import { color, radius, TOUCH_TARGET } from "~/theme/tokens";

/* ---------------------------------------------------------------------------
   Alerts & automation — the website's AutomationSection: the price rules
   Elyra watches for this account.

   Every rule is a real price alert, the same rows the asset screen's alerts
   and the website set. The delivery pass checks each against live prices
   every five minutes and tells the person on the first crossing — a push
   and the inbox — then the rule goes quiet until it is re-armed.

   A rule acts by telling, never by trading: venue connections are
   read-only and nothing in Elyra places an order. A crossing with nowhere
   to go still shows here against the live price, and says it was not sent.
--------------------------------------------------------------------------- */

type Status = "armed" | "crossed" | "fired";

const DOT: Record<Status, string> = {
  armed: color.positive,
  crossed: color.caution,
  fired: color["text-muted"],
};

function statusOf(alert: PriceAlert, price: number | undefined): Status {
  if (alert.triggeredAt !== null) return "fired";
  return isPast(alert, price) ? "crossed" : "armed";
}

function statusLabel(status: Status, delivery: AppDelivery): string {
  if (status === "fired") return "Fired — off until re-armed";
  if (status === "crossed") return delivery === "none" ? "Crossed — not sent anywhere" : "Crossed — sent on the next check";
  return "Armed";
}

function thenLine(delivery: AppDelivery): string {
  if (delivery === "push") return "Push to this phone and keep it in your inbox, once";
  if (delivery === "none") return "Show the crossing here — nothing is sent until notifications are on";
  return "Keep it in your inbox, once — push is off";
}

function Fact({ label, children }: { label: string; children: string }) {
  return (
    <View style={styles.fact}>
      <Text variant="eyebrow" tone="muted">
        {label}
      </Text>
      <Text variant="body-sm">{children}</Text>
    </View>
  );
}

function RuleRow({ alert, price, feed, now }: { alert: PriceAlert; price: number | undefined; feed: AlertsFeed; now: number }) {
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const status = statusOf(alert, price);
  const verb = alert.direction === "above" ? "rises above" : "falls below";
  const name = `${alert.symbol} ${verb} ${formatPriceUsd(alert.target)}`;
  const distance = price === undefined ? null : ((alert.target - price) / price) * 100;

  const rearm = async () => {
    setBusy(true);
    const failure = await feed.create({ symbol: alert.symbol, direction: alert.direction, target: alert.target, currentPrice: price ?? null });
    setBusy(false);
    outcomeHaptic(failure === null ? "success" : "error");
  };

  return (
    <View style={styles.rule}>
      <View style={styles.ruleHead}>
        <Pressable
          onPress={() => setOpen((value) => !value)}
          accessibilityRole="button"
          accessibilityState={{ expanded: open }}
          accessibilityLabel={`${name}. ${statusLabel(status, feed.appDelivery)}`}
          style={styles.ruleToggle}
        >
          <ChevronRight
            size={14}
            strokeWidth={1.5}
            color={color["text-muted"]}
            style={{ transform: [{ rotate: open ? "90deg" : "0deg" }] }}
          />
          <View style={[styles.dot, { backgroundColor: DOT[status] }]} />
          <View style={styles.flex}>
            <Text variant="data" tone={status === "fired" ? "secondary" : "primary"} numberOfLines={1}>
              {name}
            </Text>
            <Text variant="label" tone={status === "crossed" ? "caution" : "muted"} numberOfLines={2}>
              {statusLabel(status, feed.appDelivery)}
              {status === "armed" && distance !== null ? ` · ${Math.abs(distance).toFixed(2)}% away` : ""}
              {status === "fired" && alert.triggeredAt ? ` · ${formatRelativeTime(alert.triggeredAt, now)}` : ""}
            </Text>
          </View>
        </Pressable>
        {status === "fired" && (
          <IconButton accessibilityLabel={`Re-arm ${name}`} onPress={() => void rearm()} disabled={busy}>
            <RotateCcw size={16} strokeWidth={1.5} color={color["text-secondary"]} />
          </IconButton>
        )}
        <IconButton accessibilityLabel={`Remove ${name}`} onPress={() => void feed.remove(alert.id)}>
          <Trash2 size={16} strokeWidth={1.5} color={color["text-muted"]} />
        </IconButton>
      </View>

      {open && (
        <View style={styles.facts}>
          <Fact label="When">
            {`${alert.symbol} trades at or ${alert.direction} ${formatPriceUsd(alert.target)}${price !== undefined ? ` (now ${formatPriceUsd(price)})` : ""}`}
          </Fact>
          <Fact label="Then">{thenLine(feed.appDelivery)}</Fact>
          <Fact label="Set">
            {`${alert.createdAt ? `${formatTimestamp(alert.createdAt)} UTC` : "—"}${alert.createdPrice !== null ? ` at ${formatPriceUsd(alert.createdPrice)}` : ""}`}
          </Fact>
          <Fact label="Last fired">
            {alert.triggeredAt
              ? `${formatTimestamp(alert.triggeredAt)} UTC${alert.triggeredPrice != null ? ` at ${formatPriceUsd(alert.triggeredPrice)}` : ""}`
              : "Never"}
          </Fact>
        </View>
      )}
    </View>
  );
}

function RuleBuilder({
  sheet,
  feed,
  priceOf,
  initialSymbol,
}: {
  sheet: React.RefObject<BottomSheetHandle | null>;
  feed: AlertsFeed;
  priceOf: (symbol: string) => number | undefined;
  initialSymbol: string;
}) {
  const push = usePushState();
  const preferences = useNotificationPreferences();
  const [ticker, setTicker] = useState(initialSymbol);
  /* The selected market resolves after the first render; until the field is
     touched, it follows. */
  const [touched, setTouched] = useState(false);
  if (!touched && ticker !== initialSymbol) setTicker(initialSymbol);
  const [direction, setDirection] = useState<"above" | "below">("above");
  const [target, setTarget] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  /* The market typed resolves to a live price as it is typed. */
  const symbol = ticker.trim().toUpperCase();
  const lookup = useMemo(() => (symbol === "" ? [] : [symbol]), [symbol]);
  const { bySymbol } = useAssetsBySymbols(lookup);
  const asset = bySymbol.get(symbol);
  const ids = useMemo(() => (asset ? [asset.id] : []), [asset]);
  const live = usePrices(ids);
  const price = asset ? (live.rows.get(asset.id)?.price ?? priceOf(symbol) ?? null) : null;

  const value = Number(target);
  const delivery = notificationDeliveryLine(preferences.data?.priceAlerts, push.status, push.priceChannelEnabled);

  const submit = async () => {
    if (!(value > 0) || saving || symbol === "") return;
    setSaving(true);
    const failure = await feed.create({ symbol, direction, target: value, currentPrice: price });
    setSaving(false);
    setError(failure);
    outcomeHaptic(failure === null ? "success" : "error");
    if (failure === null) {
      setTarget("");
      sheet.current?.dismiss();
    }
  };

  return (
    <BottomSheet ref={sheet} title="New price rule">
      <View style={styles.builder}>
        <Text variant="body-sm" tone="secondary">
          Elyra checks it every five minutes and tells you once when price crosses.
        </Text>
        <TextField
          label="Market"
          value={ticker}
          onChangeText={(next) => {
            setTouched(true);
            setTicker(next.toUpperCase().replace(/[^A-Z0-9]/g, "").slice(0, 12));
            setTarget("");
          }}
          autoCapitalize="characters"
          autoCorrect={false}
          placeholder="SOL"
        />
        <SegmentedControl<"above" | "below">
          accessibilityLabel="When price"
          value={direction}
          onChange={(side) => {
            setDirection(side);
            const suggested = suggestedTarget(price, side);
            if (suggested !== "") setTarget(suggested);
          }}
          choices={[
            { value: "above", label: "Rises above" },
            { value: "below", label: "Falls below" },
          ]}
        />
        <TextField
          label="Price in USD"
          value={target}
          onChangeText={(next) => setTarget(next.replace(",", ".").replace(/[^\d.]/g, ""))}
          onFocus={() => {
            if (target === "") setTarget(suggestedTarget(price, direction));
          }}
          keyboardType="decimal-pad"
          placeholder={price === null ? "Price in USD" : suggestedTarget(price, direction)}
          error={target !== "" && !(value > 0) ? "Enter a price above zero." : null}
        />
        <Text variant="label" tone="muted">
          {price !== null
            ? `Now ${formatPriceUsd(price)}.`
            : symbol === ""
              ? "Type a market, such as SOL or BTC."
              : `No live price for ${symbol} yet — the rule is checked against Elyra's prices once saved.`}
        </Text>
        <Text variant="label" tone="muted">
          Then: a push and your inbox. A rule never places a trade — venue connections in Elyra are read-only.
        </Text>
        {error !== null && <Notice tone="negative">{error}</Notice>}
        <Button
          label={saving ? "Saving…" : "Save rule"}
          variant="accent"
          loading={saving}
          disabled={saving || symbol === "" || !(value > 0)}
          onPress={() => void submit()}
        />
        <View style={styles.delivery}>
          <Text variant="label">{delivery.title}</Text>
          <Text variant="label" tone="muted">
            {delivery.detail}
          </Text>
          <Button
            label="Notification settings"
            size="sm"
            variant="ghost"
            onPress={() => {
              sheet.current?.dismiss();
              router.push("/notification-settings");
            }}
          />
        </View>
      </View>
    </BottomSheet>
  );
}

export default function AutomationScreen() {
  const feed = useAlerts();
  const now = useMinute();
  const builder = useRef<BottomSheetHandle>(null);
  /* The builder starts on the market last opened, as the website's starts
     on the chart's. */
  const selectedAssetId = useAppStore((state) => state.selectedAssetId);
  const selected = useAssets([selectedAssetId]).byId.get(selectedAssetId);
  const selectedSymbol = selected?.symbol.toUpperCase() ?? "";

  const symbols = useMemo(() => [...new Set(feed.alerts.map((alert) => alert.symbol.toUpperCase()))], [feed.alerts]);
  const { bySymbol } = useAssetsBySymbols(symbols);
  const ids = useMemo(() => [...bySymbol.values()].map((asset) => asset.id), [bySymbol]);
  const prices = usePrices(ids);
  const priceOf = (symbol: string) => {
    const asset = bySymbol.get(symbol.toUpperCase());
    return asset ? prices.rows.get(asset.id)?.price : undefined;
  };

  const armed = feed.alerts.filter((alert) => alert.triggeredAt === null).length;
  const shownError = feed.writeError ?? (feed.alerts.length === 0 ? feed.error : null);

  return (
    <DetailScreen title="Alerts & automation" onRefresh={feed.refetch} refreshing={feed.refreshing}>
      <View style={styles.head}>
        <View style={styles.flex}>
          <Text variant="h2">Price rules</Text>
          <Text variant="label" tone="muted">
            {feed.loading ? "Reading your rules…" : `${armed} armed · ${feed.alerts.length} in all`}
          </Text>
        </View>
        <Button
          label="New rule"
          size="sm"
          icon={<Plus size={14} strokeWidth={1.5} color={color["text-primary"]} />}
          onPress={() => builder.current?.present()}
        />
      </View>

      {shownError !== null && <Notice tone="negative">{shownError}</Notice>}

      {feed.loading ? (
        <View style={styles.loading} accessibilityLabel="Loading rules">
          <Skeleton width="60%" />
          <Skeleton width="40%" />
        </View>
      ) : feed.alerts.length === 0 ? (
        feed.error === null && (
          <View style={styles.empty}>
            <BellRing size={16} strokeWidth={1.5} color={color["text-muted"]} />
            <Text variant="body-sm" tone="secondary" style={styles.flex}>
              No rules yet. Add one here, from a market’s alerts, or on the website.
            </Text>
          </View>
        )
      ) : (
        <View style={styles.list}>
          {feed.alerts.map((alert) => (
            <RuleRow key={alert.id} alert={alert} price={priceOf(alert.symbol)} feed={feed} now={now} />
          ))}
        </View>
      )}

      <Text variant="label" tone="muted">
        A rule tells you; it never trades. Fired rules stay here until you re-arm or remove them.
      </Text>

      <RuleBuilder sheet={builder} feed={feed} priceOf={priceOf} initialSymbol={selectedSymbol} />
    </DetailScreen>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1, minWidth: 0 },
  head: { flexDirection: "row", alignItems: "center", gap: 12 },
  loading: { gap: 8, padding: 16 },
  empty: {
    flexDirection: "row",
    gap: 12,
    padding: 16,
    borderRadius: radius.panel,
    borderWidth: 1,
    borderColor: color["border-subtle"],
    backgroundColor: color["surface-panel"],
  },
  list: {
    borderRadius: radius.panel,
    borderWidth: 1,
    borderColor: color["border-subtle"],
    backgroundColor: color["surface-panel"],
    overflow: "hidden",
  },
  rule: { borderBottomWidth: StyleSheet.hairlineWidth * 2, borderBottomColor: color["border-subtle"] },
  ruleHead: { flexDirection: "row", alignItems: "center", paddingRight: 4 },
  ruleToggle: { flex: 1, minHeight: TOUCH_TARGET + 8, flexDirection: "row", alignItems: "center", gap: 10, paddingLeft: 14, paddingVertical: 8 },
  dot: { width: 8, height: 8, borderRadius: 4 },
  facts: { gap: 12, paddingLeft: 46, paddingRight: 16, paddingBottom: 16 },
  fact: { gap: 2 },
  builder: { padding: 16, gap: 12 },
  delivery: {
    gap: 2,
    padding: 12,
    borderRadius: radius.card,
    borderWidth: 1,
    borderColor: color["border-subtle"],
    backgroundColor: color["surface-raised"],
  },
});
