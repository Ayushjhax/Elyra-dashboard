import { useState } from "react";
import { Pressable, StyleSheet, View } from "react-native";
import { Bell, BellOff, ChevronDown, ChevronRight, RotateCcw, Trash2 } from "lucide-react-native";
import { alertState, distancePct } from "@/lib/alerts/rules";
import type { AppDelivery, PriceAlert } from "@/lib/alerts/types";
import { formatPriceUsd, formatRelativeTime, formatTimestamp } from "@/lib/format";
import { WideButton } from "~/components/shell/flow";
import { IconButton } from "~/components/ui/controls";
import { CoinMark } from "~/components/ui/marks";
import { Text, type TextTone } from "~/components/ui/Text";
import { fontFamily } from "~/theme/fonts";
import { color, radius } from "~/theme/tokens";

/* ---------------------------------------------------------------------------
   One price rule, as a card: the market and its state, what it waits for
   and how far away that is, then — opened — the two prices, WHEN and THEN
   in full, and when it was set and last fired.

   The state is the shared rule (lib/alerts/rules.ts): Fired once the server
   stamped it; Crossed when the live price is already past the level but the
   next five-minute check has not sent it yet; Armed otherwise. WHEN says
   "at or above" because that is what the delivery check tests (price >=
   target), not a crossing from below.

   THEN is where the server says a crossing goes (appDelivery), never a
   promise of push the account cannot keep.
--------------------------------------------------------------------------- */

const STATE: Record<"Armed" | "Crossed" | "Fired", { dot: string; tone: TextTone; background: string }> = {
  Armed: { dot: color.positive, tone: "positive", background: color["positive-bg"] },
  Crossed: { dot: color.caution, tone: "caution", background: color["caution-bg"] },
  Fired: { dot: color["text-muted"], tone: "secondary", background: color["surface-raised"] },
};

const THEN: Record<AppDelivery, { title: string; detail: string }> = {
  push: { title: "Push + inbox", detail: "Notify once when triggered" },
  inbox: { title: "Inbox only — push is off", detail: "Saved to your inbox once when triggered" },
  off: { title: "Inbox only — price alerts are off", detail: "Saved to your inbox once when triggered" },
  none: { title: "Not delivered yet", detail: "Shown here when it triggers. Turn on notifications to be told." },
};

/** A stable name for a rule's settings — what the server de-duplicates a rule on. */
export function ruleKey(rule: { symbol: string; direction: "above" | "below"; target: number }): string {
  return `${rule.symbol.toUpperCase()}:${rule.direction}:${rule.target}`;
}

function Column({ label, value, note, first = false, small = false }: { label: string; value: string; note?: string; first?: boolean; small?: boolean }) {
  return (
    <View style={[styles.column, !first && styles.columnRule]}>
      <Text variant="body" tone="secondary" style={styles.columnLabel}>
        {label}
      </Text>
      <Text variant="body" style={[styles.columnValue, small && styles.columnValueSmall]} numberOfLines={2}>
        {value}
      </Text>
      {note !== undefined && (
        <Text variant="body-sm" tone="muted" style={styles.columnNote}>
          {note}
        </Text>
      )}
    </View>
  );
}

export function PriceRuleCard({
  alert,
  price,
  logo,
  delivery,
  now,
  defaultOpen = false,
  onRearm,
  onRemove,
}: {
  alert: PriceAlert;
  price: number | undefined;
  logo: { logo: string | null; fallbackLogo: string | null };
  delivery: AppDelivery;
  now: number;
  defaultOpen?: boolean;
  onRearm: () => Promise<void>;
  onRemove: () => void;
}) {
  const [open, setOpen] = useState(defaultOpen);
  const [rearming, setRearming] = useState(false);
  const state = alertState(alert, price);
  const look = STATE[state];
  const verb = alert.direction === "above" ? "Rises above" : "Falls below";
  const target = formatPriceUsd(alert.target);
  const name = `${alert.symbol} ${verb.toLowerCase()} ${target}`;
  const distance = distancePct(alert.target, price);

  let line: string;
  let lineTone: TextTone = "secondary";
  if (state === "Fired") {
    line = `Fired ${alert.triggeredAt ? formatRelativeTime(alert.triggeredAt, now) : ""}${alert.triggeredPrice != null ? ` at ${formatPriceUsd(alert.triggeredPrice)}` : ""} — off until re-armed`;
    lineTone = "muted";
  } else if (state === "Crossed") {
    line = delivery === "none" ? "Past the target — not sent anywhere yet" : "Past the target — sent on the next check";
    lineTone = "caution";
  } else if (distance === null) {
    line = `No live price for ${alert.symbol} right now`;
    lineTone = "muted";
  } else {
    line = `${Math.abs(distance).toFixed(2)}% ${distance >= 0 ? "above" : "below"} current price`;
  }

  const then = THEN[delivery];
  const rearm = async () => {
    if (rearming) return;
    setRearming(true);
    await onRearm();
    setRearming(false);
  };

  return (
    <View style={styles.card}>
      <View style={styles.head}>
        <Pressable
          onPress={() => setOpen((value) => !value)}
          accessibilityRole="button"
          accessibilityState={{ expanded: open }}
          accessibilityLabel={`${name}. ${state}. ${line}`}
          accessibilityHint={open ? "Hides the rule's details" : "Shows the rule's details"}
          style={styles.toggle}
        >
          {open ? (
            <ChevronDown size={22} strokeWidth={1.5} color={color["text-secondary"]} />
          ) : (
            <ChevronRight size={22} strokeWidth={1.5} color={color["text-secondary"]} />
          )}
          <CoinMark symbol={alert.symbol} logo={logo.logo} fallbackLogo={logo.fallbackLogo} size={44} />
          <Text variant="body" numberOfLines={1} style={[styles.symbol, styles.shrink]}>
            {alert.symbol}
          </Text>
          <View style={[styles.status, { backgroundColor: look.background }]}>
            <View style={[styles.dot, { backgroundColor: look.dot }]} />
            <Text variant="body-sm" tone={look.tone} maxFontSizeMultiplier={1.3} style={styles.statusText}>
              {state}
            </Text>
          </View>
        </Pressable>
        {/* Opened, the card has a full-width Re-arm instead. */}
        {state === "Fired" && !open && (
          <IconButton accessibilityLabel={`Re-arm ${name}`} onPress={() => void rearm()} disabled={rearming}>
            <RotateCcw size={20} strokeWidth={1.5} color={color["text-secondary"]} />
          </IconButton>
        )}
        <IconButton accessibilityLabel={`Remove ${name}`} onPress={onRemove}>
          <Trash2 size={22} strokeWidth={1.5} color={color["text-secondary"]} />
        </IconButton>
      </View>

      <View style={styles.summary}>
        <Text variant="body" tone={state === "Fired" ? "secondary" : "primary"} style={styles.condition}>
          {verb} {target}
        </Text>
        <Text variant="body" tone={lineTone} style={styles.line}>
          {line}
        </Text>
      </View>

      {open && (
        <>
          <View style={styles.columns}>
            <Column first label="Current price" value={price === undefined ? "—" : formatPriceUsd(price)} />
            <Column label="Target price" value={target} />
          </View>

          <View style={styles.rule} />

          <View style={styles.block}>
            <Text variant="eyebrow" tone="secondary" accessibilityRole="header">
              When
            </Text>
            <Text variant="body" style={styles.sentence}>
              {alert.symbol} trades at or {alert.direction} {target}
            </Text>
            <Text variant="eyebrow" tone="secondary" accessibilityRole="header" style={styles.then}>
              Then
            </Text>
            <View style={styles.delivery}>
              {delivery === "none" ? (
                <BellOff size={24} strokeWidth={1.5} color={color["text-secondary"]} />
              ) : (
                <Bell size={24} strokeWidth={1.5} color={color["text-primary"]} />
              )}
              <View style={styles.flex}>
                <Text variant="body" style={styles.deliveryTitle}>
                  {then.title}
                </Text>
                <Text variant="body" tone="secondary" style={styles.deliveryDetail}>
                  {then.detail}
                </Text>
              </View>
            </View>
          </View>

          <View style={styles.rule} />

          <View style={styles.columns}>
            <Column
              first
              small
              label="Created"
              value={alert.createdAt ? `${formatTimestamp(alert.createdAt)} UTC` : "—"}
              note={alert.createdPrice !== null ? `At ${formatPriceUsd(alert.createdPrice)}` : undefined}
            />
            <Column
              small
              label="Last fired"
              value={alert.triggeredAt ? `${formatTimestamp(alert.triggeredAt)} UTC` : "Never"}
              note={alert.triggeredAt && alert.triggeredPrice != null ? `At ${formatPriceUsd(alert.triggeredPrice)}` : undefined}
            />
          </View>

          {state === "Fired" && (
            <View style={styles.rearm}>
              <WideButton label="Re-arm this rule" variant="outline" leading={RotateCcw} busy={rearming} onPress={() => void rearm()} />
            </View>
          )}
        </>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1, minWidth: 0 },
  shrink: { flexShrink: 1 },
  card: {
    borderRadius: radius.sheet,
    borderWidth: 1,
    borderColor: color["border-subtle"],
    backgroundColor: color["surface-panel"],
    overflow: "hidden",
    paddingBottom: 6,
  },
  head: { flexDirection: "row", alignItems: "center", paddingRight: 4, paddingTop: 6 },
  toggle: { flex: 1, minWidth: 0, minHeight: 60, flexDirection: "row", alignItems: "center", gap: 12, paddingLeft: 14 },
  symbol: { fontFamily: fontFamily("sans", 500), fontSize: 19, lineHeight: 25 },
  status: { flexDirection: "row", alignItems: "center", gap: 7, paddingHorizontal: 12, paddingVertical: 5, borderRadius: radius.pill, borderWidth: 1, borderColor: color["border-subtle"] },
  statusText: { fontSize: 15, lineHeight: 20 },
  dot: { width: 8, height: 8, borderRadius: 4 },
  summary: { paddingLeft: 48, paddingRight: 20, paddingBottom: 12, gap: 2 },
  condition: { fontFamily: fontFamily("sans", 500), fontSize: 20, lineHeight: 27, fontVariant: ["tabular-nums"] },
  line: { fontSize: 15, lineHeight: 21 },
  columns: { flexDirection: "row", paddingLeft: 48, paddingRight: 16, paddingVertical: 12 },
  column: { flex: 1, minWidth: 0, gap: 3, paddingRight: 12 },
  columnRule: { borderLeftWidth: StyleSheet.hairlineWidth * 2, borderLeftColor: color["border-strong"], paddingLeft: 16, paddingRight: 0 },
  columnLabel: { fontSize: 15, lineHeight: 20 },
  columnValue: { fontFamily: fontFamily("sans", 500), fontSize: 19, lineHeight: 25, fontVariant: ["tabular-nums"] },
  columnValueSmall: { fontSize: 16, lineHeight: 22 },
  columnNote: { fontSize: 14, lineHeight: 19 },
  rule: { height: StyleSheet.hairlineWidth * 2, backgroundColor: color["border-subtle"], marginLeft: 20, marginRight: 20 },
  block: { paddingLeft: 48, paddingRight: 20, paddingVertical: 14, gap: 6 },
  sentence: { fontSize: 16, lineHeight: 22, fontVariant: ["tabular-nums"] },
  then: { marginTop: 8 },
  delivery: { flexDirection: "row", alignItems: "center", gap: 16, paddingTop: 2 },
  deliveryTitle: { fontFamily: fontFamily("sans", 500), fontSize: 16, lineHeight: 22 },
  deliveryDetail: { fontSize: 15, lineHeight: 20 },
  rearm: { paddingHorizontal: 16, paddingTop: 4, paddingBottom: 10 },
});
