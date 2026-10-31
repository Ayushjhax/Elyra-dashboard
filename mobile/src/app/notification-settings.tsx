import { useRef, useState } from "react";
import { Linking, ScrollView, StyleSheet, View } from "react-native";
import { useCalendars } from "expo-localization";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import {
  ChartColumnIncreasing,
  ChartNoAxesColumn,
  CircleDot,
  FileText,
  Percent,
  Shield,
  TrendingUp,
  type LucideIcon,
} from "lucide-react-native";
import {
  NOTIFICATION_FLAGS,
  type NotificationFlag,
  type NotificationPreferences,
} from "@/lib/notifications/types";
import {
  clockMinute,
  clockText,
  summaryMinuteInZone,
} from "@/lib/notifications/time";
import { PreferenceGroup, PushStatusCard, SwitchRow } from "~/components/notifications/parts";
import { FlowBar, FlowHeading, FlowTitle, WideButton } from "~/components/shell/flow";
import { Button } from "~/components/ui/controls";
import { Skeleton } from "~/components/ui/layout";
import { Text } from "~/components/ui/Text";
import { TextField } from "~/components/ui/TextField";
import { api } from "~/lib/api";
import {
  fixPush,
  offerPushPrompt,
  refreshPushStatus,
  usePushState,
} from "~/lib/notifications/push";
import {
  inboxStore,
  saveNotificationPreferences,
  useNotificationPreferences,
} from "~/lib/notifications/stores";
import { useMinute } from "~/lib/useClock";
import { currentAccount, sessionVersion } from "~/lib/session";
import { color, radius } from "~/theme/tokens";

/* ---------------------------------------------------------------------------
   Notification settings — this device's push status, then the account's
   preferences.

   The two are kept apart on purpose. Push is per device (usePushState, from
   lib/notifications/push.ts); the preferences live on the account
   (/api/notifications/preferences) and apply to every device and to the
   inbox. Registering or losing push never resets a preference.

   A switch moves the moment it is pressed and says "Saving…" until the
   server answers. Saves go out in order (saveNotificationPreferences queues
   them), and only the newest press for a switch decides what it shows: a
   failure puts back what the account last saved and says why.

   Coming back from system settings re-checks push on its own —
   NotificationRuntime refreshes whenever the app returns to the foreground.
--------------------------------------------------------------------------- */

/** The words on this screen; the keys and meanings are lib/notifications/types.ts. */
const COPY: Record<NotificationFlag, { label: string; detail: string; icon: LucideIcon }> = {
  priceAlerts: { label: "Price alerts", detail: "When a price crosses your level.", icon: TrendingUp },
  liquidationAlerts: { label: "Liquidation warnings", detail: "When a position nears liquidation.", icon: Shield },
  largeMoves: { label: "Market moves", detail: "Large moves in markets you watch.", icon: ChartNoAxesColumn },
  predictionAlerts: {
    label: "Probability moves",
    detail: "Moves in markets you hold, your alert rules and signal updates.",
    icon: Percent,
  },
  predictionOrderUpdates: { label: "Order updates", detail: "Fills and changes to your orders.", icon: FileText },
  predictionResolutionAlerts: { label: "Resolutions", detail: "When a position resolves in your favour.", icon: CircleDot },
  dailySummary: { label: "Daily summary", detail: "Your capital and daily market moves.", icon: ChartColumnIncreasing },
};

const GROUPS: { label: string; keys: NotificationFlag[] }[] = [
  { label: "Markets", keys: ["priceAlerts", "liquidationAlerts", "largeMoves"] },
  { label: "Predictions", keys: ["predictionAlerts", "predictionOrderUpdates", "predictionResolutionAlerts"] },
];

/* A flag the server adds later still gets a switch, under "More". */
const GROUPED = new Set<NotificationFlag>([...GROUPS.flatMap((group) => group.keys), "dailySummary"]);

export default function NotificationSettingsScreen() {
  const feed = useNotificationPreferences();
  const zone = useCalendars()[0]?.timeZone ?? null;
  const insets = useSafeAreaInsets();
  return (
    <View style={styles.screen}>
      <FlowBar closeLabel="Close notification settings" />
      <ScrollView
        contentContainerStyle={[styles.content, { paddingBottom: insets.bottom + 32 }]}
        keyboardShouldPersistTaps="handled"
      >
        <FlowTitle title="Notifications" subtitle="Preferences" />
        <PushCard />
        {feed.error && (
          <View style={styles.stack}>
            <Text tone="negative">{feed.error}</Text>
            <Button label="Try again" onPress={feed.refetch} />
          </View>
        )}
        {feed.loading ? (
          <View style={styles.stack} accessibilityLabel="Loading your preferences">
            <Skeleton height={64} rounded={radius.sheet} />
            <Skeleton height={240} rounded={radius.sheet} />
            <Skeleton height={240} rounded={radius.sheet} />
          </View>
        ) : (
          feed.data && <SettingsForm key={zone ?? "unknown"} saved={feed.data} zone={zone} />
        )}
      </ScrollView>
    </View>
  );
}

/** This device's push status, from the push store. */
function PushCard() {
  const push = usePushState();
  const [error, setError] = useState<string | null>(null);
  return (
    <PushStatusCard
      status={push.status}
      busy={push.busy}
      error={error ?? push.error}
      granted={push.granted}
      channelBlocked={push.priceChannelEnabled === false}
      onFix={() => {
        setError(null);
        void fixPush().catch(() => setError("System settings could not be opened."));
      }}
      onCheck={() => {
        setError(null);
        void refreshPushStatus();
      }}
      onSystemSettings={() => {
        setError(null);
        void Linking.openSettings().catch(() => setError("System settings could not be opened."));
      }}
    />
  );
}

function SettingsForm({ saved, zone }: { saved: NotificationPreferences; zone: string | null }) {
  const push = usePushState();
  const now = useMinute();
  const [move, setMove] = useState(String(saved.moveThresholdPct));
  const [points, setPoints] = useState(String(saved.predictionMoveThresholdPoints));
  const [time, setTime] = useState(() =>
    clockText(zone ? summaryMinuteInZone(saved.dailySummaryMinute, saved.timezone, zone, now) : saved.dailySummaryMinute),
  );
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [testResult, setTestResult] = useState<string | null>(null);
  /* What each switch shows while its save is in flight. */
  const [pending, setPending] = useState<Partial<Record<NotificationFlag, boolean>>>({});
  /* The newest press per switch: an older press's answer never decides what it shows. */
  const latest = useRef<Partial<Record<NotificationFlag, number>>>({});

  const valueOf = (key: NotificationFlag) => pending[key] ?? saved[key];

  const write = async (name: string, patch: Partial<NotificationPreferences>) => {
    if (busy) return;
    const account = currentAccount();
    const ticket = sessionVersion();
    setBusy(name);
    setError(null);
    try {
      await saveNotificationPreferences(patch);
    } catch (failure) {
      if (currentAccount() === account && sessionVersion() === ticket)
        setError(failure instanceof Error ? failure.message : "Could not save that preference.");
    } finally {
      setBusy(null);
    }
  };

  const toggle = (key: NotificationFlag) => {
    const label = COPY[key].label;
    const next = !valueOf(key);
    const patch: Partial<NotificationPreferences> = { [key]: next };
    if (key === "dailySummary" && next) {
      const minute = clockMinute(time);
      if (minute === null || !zone) {
        setError("Choose a valid local summary time before turning the daily summary on.");
        return;
      }
      patch.dailySummaryMinute = minute;
      patch.timezone = zone;
    }
    const account = currentAccount();
    const ticket = sessionVersion();
    const press = (latest.current[key] ?? 0) + 1;
    latest.current[key] = press;
    setError(null);
    setPending((current) => ({ ...current, [key]: next }));
    const settle = () =>
      setPending((current) => {
        const rest = { ...current };
        delete rest[key];
        return rest;
      });
    saveNotificationPreferences(patch).then(
      () => {
        if (latest.current[key] !== press || currentAccount() !== account || sessionVersion() !== ticket) return;
        settle();
        if (next && !push.granted) offerPushPrompt(label);
        else if (next && push.status !== "on") void refreshPushStatus();
      },
      (failure: unknown) => {
        if (latest.current[key] !== press || currentAccount() !== account || sessionVersion() !== ticket) return;
        settle();
        setError(`${label} was not saved. ${failure instanceof Error ? failure.message : "Try again."}`);
      },
    );
  };

  const thresholds = () => {
    const percent = Number(move),
      probability = Number(points);
    if (
      !move.trim() ||
      !points.trim() ||
      !Number.isFinite(percent) ||
      !Number.isFinite(probability) ||
      percent <= 0 ||
      percent > 100 ||
      probability <= 0 ||
      probability > 100
    ) {
      setError("Thresholds must be greater than 0 and at most 100.");
      return;
    }
    void write("thresholds", { moveThresholdPct: percent, predictionMoveThresholdPoints: probability });
  };

  const summary = () => {
    const minute = clockMinute(time);
    if (minute === null || !zone) {
      setError("Enter a time as HH:MM in your device's timezone.");
      return;
    }
    void write("time", { dailySummaryMinute: minute, timezone: zone });
  };

  const test = async () => {
    if (busy) return;
    const account = currentAccount();
    const ticket = sessionVersion();
    setBusy("test");
    setError(null);
    setTestResult(null);
    try {
      const result = await api.post<{ push: { sent: number; failed: number } }>("/api/notifications/test");
      if (currentAccount() !== account || sessionVersion() !== ticket) return;
      await inboxStore.refresh();
      setTestResult(
        result.push.sent > 0
          ? `Added to your inbox. Push accepted for ${result.push.sent} device${result.push.sent === 1 ? "" : "s"}.`
          : result.push.failed > 0
            ? "Added to your inbox. Push could not be sent; check push setup and try again."
            : "Added to your inbox. No device is registered for push yet.",
      );
    } catch (failure) {
      if (currentAccount() === account) setError(failure instanceof Error ? failure.message : "Could not send a test notification.");
    } finally {
      setBusy(null);
    }
  };

  const row = (key: NotificationFlag, first: boolean) => (
    <SwitchRow
      key={key}
      first={first}
      icon={COPY[key]?.icon ?? TrendingUp}
      label={COPY[key]?.label ?? key}
      detail={COPY[key]?.detail ?? ""}
      value={valueOf(key)}
      saving={pending[key] !== undefined}
      onToggle={() => toggle(key)}
    />
  );
  const extra = NOTIFICATION_FLAGS.map((flag) => flag.key).filter((key) => !GROUPED.has(key));

  return (
    <View style={styles.form}>
      <View style={styles.intro}>
        <FlowHeading>Updates you want</FlowHeading>
        <Text variant="body" tone="secondary" style={styles.lead}>
          Synced across your account. Alerts stay in your inbox.
        </Text>
      </View>

      {error && (
        <Text tone="negative" accessibilityLiveRegion="polite">
          {error}
        </Text>
      )}

      {GROUPS.map((group) => (
        <PreferenceGroup key={group.label} label={group.label}>
          {group.keys.map((key) => row(key, false))}
        </PreferenceGroup>
      ))}
      {extra.length > 0 && <PreferenceGroup label="More">{extra.map((key) => row(key, false))}</PreferenceGroup>}

      <PreferenceGroup>
        {row("dailySummary", true)}
        <View style={styles.inset}>
          <TextField
            label="Summary time (HH:MM, 24-hour)"
            value={time}
            onChangeText={setTime}
            keyboardType="numbers-and-punctuation"
            maxLength={5}
          />
          <Text variant="body-sm" tone="muted">
            {zone
              ? `Sent at this time in ${zone}, your device's timezone.`
              : "Your device timezone could not be read. Set it in system settings first."}
          </Text>
          <Button
            label="Save summary time"
            disabled={busy !== null || zone === null}
            loading={busy === "time"}
            onPress={summary}
          />
        </View>
      </PreferenceGroup>

      <PreferenceGroup label="Thresholds">
        <View style={styles.inset}>
          <TextField label="Large move threshold (%)" value={move} onChangeText={setMove} keyboardType="decimal-pad" />
          <TextField
            label="Prediction move threshold (points)"
            value={points}
            onChangeText={setPoints}
            keyboardType="decimal-pad"
          />
          <Text variant="body-sm" tone="muted">
            A move from 54% to 64% is 10 points.
          </Text>
          <Button label="Save thresholds" disabled={busy !== null} loading={busy === "thresholds"} onPress={thresholds} />
        </View>
      </PreferenceGroup>

      <WideButton label="Send a test notification" variant="outline" busy={busy === "test"} disabled={busy !== null} onPress={() => void test()} />
      {testResult && (
        <Text accessibilityLiveRegion="polite" variant="body-sm" tone="secondary">
          {testResult}
        </Text>
      )}
      <Text variant="body" tone="muted">
        Your preferences apply on every device.
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: color["surface-base"] },
  content: { paddingHorizontal: 20, gap: 20, paddingTop: 4 },
  stack: { gap: 12 },
  form: { gap: 16 },
  intro: { gap: 4, paddingTop: 12 },
  lead: { fontSize: 16, lineHeight: 22 },
  inset: { gap: 12, paddingHorizontal: 16, paddingBottom: 16, paddingTop: 4 },
});
