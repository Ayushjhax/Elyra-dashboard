import { forwardRef, useImperativeHandle, useRef, useState } from "react";
import { StyleSheet, View } from "react-native";
import { router } from "expo-router";
import { Bell, BellRing, RotateCcw, Trash2 } from "lucide-react-native";
import { alertState, suggestedTarget } from "@/lib/alerts/rules";
import { formatPriceUsd } from "@/lib/format";
import { Button, IconButton, SegmentedControl } from "~/components/ui/controls";
import { BottomSheet, type BottomSheetHandle } from "~/components/ui/overlays";
import { Text } from "~/components/ui/Text";
import { TextField } from "~/components/ui/TextField";
import { Notice, outcomeHaptic } from "~/components/wallet/parts";
import { useAlerts } from "~/lib/stores/alerts";
import { color, radius } from "~/theme/tokens";
import { notificationDeliveryLine, usePushState } from "~/lib/notifications/push";
import { useNotificationPreferences } from "~/lib/notifications/stores";

/* ---------------------------------------------------------------------------
   Price alerts on the market on screen — the website's ChartAlerts, as a
   bottom sheet.

   Set one above or below, starting from a suggested level two per cent
   away. This market's alerts are listed as Armed, Crossed (the price is
   past it and the next delivery pass will send it) or Fired — a fired one
   can be re-armed, any can be removed — and every failure is said.

   Under the form, where a crossing goes, in the app's terms: push and the
   inbox, the inbox only, or nowhere yet — with the way to change it.
--------------------------------------------------------------------------- */

export interface AlertsSheetHandle {
  /** Opens the sheet; a shortcut ("/alert SOL > 120") passes its level. */
  open: (prefill?: { direction: "above" | "below"; target: string | null }) => void;
}

export const AlertsSheet = forwardRef<AlertsSheetHandle, { symbol: string; price: number | null }>(function AlertsSheet(
  { symbol, price },
  ref,
) {
  const sheet = useRef<BottomSheetHandle>(null);
  const feed = useAlerts();
  const push = usePushState();
  const preferences = useNotificationPreferences();
  const [direction, setDirection] = useState<"above" | "below">("above");
  const [target, setTarget] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useImperativeHandle(ref, () => ({
    open: (prefill) => {
      if (prefill !== undefined) {
        setDirection(prefill.direction);
        setTarget(prefill.target ?? suggestedTarget(price, prefill.direction));
      } else if (target === "") {
        setTarget(suggestedTarget(price, direction));
      }
      sheet.current?.present();
    },
  }));

  const alerts = feed.alerts.filter((alert) => alert.symbol === symbol.toUpperCase());
  const shownError = error ?? feed.writeError ?? feed.error;
  const value = Number(target);
  const delivery = notificationDeliveryLine(preferences.data?.priceAlerts, push.status, push.priceChannelEnabled);

  const create = async (input: { direction: "above" | "below"; target: number }) => {
    setSaving(true);
    const failure = await feed.create({ symbol: symbol.toUpperCase(), direction: input.direction, target: input.target, currentPrice: price });
    setError(failure);
    setSaving(false);
    outcomeHaptic(failure === null ? "success" : "error");
  };

  return (
    <BottomSheet ref={sheet} title={`${symbol} price alerts`}>
      <View style={styles.body}>
        {shownError !== null && <Notice tone="negative">{shownError}</Notice>}

        {feed.loading ? (
          <Text variant="body-sm" tone="muted">
            Reading your alerts…
          </Text>
        ) : alerts.length === 0 ? (
          <Text variant="body-sm" tone="secondary">
            No alerts on {symbol} yet.
          </Text>
        ) : (
          <View style={styles.list}>
            {alerts.map((alert) => {
              const state = alertState(alert, price);
              return (
                <View key={alert.id} style={styles.row}>
                  {state === "Fired" ? (
                    <BellRing size={16} strokeWidth={1.5} color={color["text-muted"]} />
                  ) : (
                    <Bell size={16} strokeWidth={1.5} color={state === "Crossed" ? color.caution : color["text-secondary"]} />
                  )}
                  <Text variant="data" style={styles.flex}>
                    {alert.direction === "above" ? "Above" : "Below"} {formatPriceUsd(alert.target)}
                  </Text>
                  <Text variant="label" tone={state === "Crossed" ? "caution" : "muted"}>
                    {state}
                  </Text>
                  {state === "Fired" && (
                    <IconButton
                      accessibilityLabel={`Re-arm the ${alert.direction} ${formatPriceUsd(alert.target)} alert`}
                      onPress={() => void create({ direction: alert.direction, target: alert.target })}
                    >
                      <RotateCcw size={16} strokeWidth={1.5} color={color["text-secondary"]} />
                    </IconButton>
                  )}
                  <IconButton
                    accessibilityLabel={`Remove the ${alert.direction} ${formatPriceUsd(alert.target)} alert`}
                    onPress={() => void feed.remove(alert.id)}
                  >
                    <Trash2 size={16} strokeWidth={1.5} color={color["text-muted"]} />
                  </IconButton>
                </View>
              );
            })}
          </View>
        )}

        <SegmentedControl<"above" | "below">
          accessibilityLabel="Direction"
          value={direction}
          onChange={(side) => {
            setDirection(side);
            setTarget(suggestedTarget(price, side));
          }}
          choices={[
            { value: "above", label: "Rises above" },
            { value: "below", label: "Falls below" },
          ]}
        />
        <TextField
          label="Alert price in USD"
          value={target}
          onChangeText={(next) => setTarget(next.replace(",", ".").replace(/[^\d.]/g, ""))}
          keyboardType="decimal-pad"
          placeholder="Price in USD"
          error={target !== "" && !(value > 0) ? "Enter a price above zero." : null}
        />
        {price !== null && (
          <Text variant="label" tone="muted">
            Now {formatPriceUsd(price)}
            {target === suggestedTarget(price, direction) ? ` · suggested two per cent ${direction === "above" ? "above" : "below"}.` : "."}
          </Text>
        )}
        <Button
          label={saving ? "Saving…" : "Set alert"}
          variant="accent"
          loading={saving}
          disabled={!(value > 0) || saving}
          onPress={() => void create({ direction, target: value })}
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
});

const styles = StyleSheet.create({
  body: { padding: 16, gap: 12 },
  list: { borderTopWidth: StyleSheet.hairlineWidth * 2, borderColor: color["border-subtle"] },
  row: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    minHeight: 48,
    borderBottomWidth: StyleSheet.hairlineWidth * 2,
    borderColor: color["border-subtle"],
  },
  flex: { flex: 1 },
  delivery: {
    gap: 2,
    padding: 12,
    borderRadius: radius.card,
    borderWidth: 1,
    borderColor: color["border-subtle"],
    backgroundColor: color["surface-raised"],
  },
});
