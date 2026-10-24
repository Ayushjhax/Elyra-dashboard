import { useState } from "react";
import { Linking, Pressable, StyleSheet, Switch, View } from "react-native";
import { useCalendars } from "expo-localization";
import { Bell } from "lucide-react-native";
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
import { Button } from "~/components/ui/controls";
import { Card, Screen, Skeleton } from "~/components/ui/layout";
import { Text } from "~/components/ui/Text";
import { TextField } from "~/components/ui/TextField";
import { SheetHeader } from "~/components/wallet/parts";
import { api } from "~/lib/api";
import {
  fixPush,
  offerPushPrompt,
  pushStatusLabel,
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
import { color } from "~/theme/tokens";
export default function NotificationSettingsScreen() {
  const feed = useNotificationPreferences();
  const zone = useCalendars()[0]?.timeZone ?? null;
  return (
    <View style={styles.screen}>
      <SheetHeader
        title="Notification settings"
        icon={Bell}
        closeLabel="Close notification settings"
      />
      <Screen>
        {feed.error && (
          <>
            <Text tone="negative">{feed.error}</Text>
            <Button label="Try again" onPress={feed.refetch} />
          </>
        )}
        {feed.loading ? (
          <>
            <Skeleton height={96} />
            <Skeleton height={96} />
          </>
        ) : (
          feed.data && (
            <SettingsForm
              key={zone ?? "unknown"}
              saved={feed.data}
              zone={zone}
            />
          )
        )}
      </Screen>
    </View>
  );
}
function SettingsForm({
  saved,
  zone,
}: {
  saved: NotificationPreferences;
  zone: string | null;
}) {
  const push = usePushState();
  const now = useMinute();
  const [move, setMove] = useState(String(saved.moveThresholdPct));
  const [points, setPoints] = useState(
    String(saved.predictionMoveThresholdPoints),
  );
  const [time, setTime] = useState(() =>
    clockText(
      zone
        ? summaryMinuteInZone(
            saved.dailySummaryMinute,
            saved.timezone,
            zone,
            now,
          )
        : saved.dailySummaryMinute,
    ),
  );
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [testResult, setTestResult] = useState<string | null>(null);
  const write = async (
    name: string,
    patch: Partial<NotificationPreferences>,
    after?: () => void,
  ) => {
    if (busy) return;
    const account = currentAccount();
    const ticket = sessionVersion();
    setBusy(name);
    setError(null);
    try {
      await saveNotificationPreferences(patch);
      if (currentAccount() === account && sessionVersion() === ticket)
        after?.();
    } catch (failure) {
      setError(
        failure instanceof Error
          ? failure.message
          : "Could not save that preference.",
      );
    } finally {
      setBusy(null);
    }
  };
  const toggle = (key: NotificationFlag, label: string) => {
    const next = !saved[key];
    const patch: Partial<NotificationPreferences> = { [key]: next };
    if (key === "dailySummary" && next) {
      const minute = clockMinute(time);
      if (minute === null || !zone) {
        setError("Choose a valid local summary time before enabling it.");
        return;
      }
      patch.dailySummaryMinute = minute;
      patch.timezone = zone;
    }
    void write(key, patch, () => {
      if (next && !push.granted) offerPushPrompt(label);
      else if (next && push.status !== "on") void refreshPushStatus();
    });
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
    void write("thresholds", {
      moveThresholdPct: percent,
      predictionMoveThresholdPoints: probability,
    });
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
      const result = await api.post<{ push: { sent: number; failed: number } }>(
        "/api/notifications/test",
      );
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
      if (currentAccount() === account)
        setError(
          failure instanceof Error
            ? failure.message
            : "Could not send a test notification.",
        );
    } finally {
      setBusy(null);
    }
  };
  return (
    <>
      <Card style={styles.stack}>
        <Text variant="h2">{pushStatusLabel(push.status)}</Text>
        <Text variant="body-sm" tone="secondary">
          The inbox works whether push is on or off.
        </Text>
        {push.error && (
          <Text tone="negative" variant="body-sm">
            {push.error}
          </Text>
        )}
        <Button
          label={
            push.status === "off"
              ? "Open system settings"
              : push.status === "on"
                ? "Check push status"
                : "Fix push notifications"
          }
          disabled={push.busy}
          loading={push.busy}
          onPress={() =>
            void fixPush().catch(() =>
              setError("System settings could not be opened."),
            )
          }
        />
        {push.granted && (
          <Button
            label="System notification settings"
            variant="ghost"
            onPress={() =>
              void Linking.openSettings().catch(() =>
                setError("System settings could not be opened."),
              )
            }
          />
        )}
        {push.priceChannelEnabled === false && (
          <Text tone="secondary">
            Price alerts are blocked in Android’s channel settings.
          </Text>
        )}
      </Card>
      <Text variant="h2">Updates you want</Text>
      <Text variant="body-sm" tone="secondary">
        These preferences apply to your Elyra account on every device. Alerts
        you set are always kept in the inbox.
      </Text>
      {NOTIFICATION_FLAGS.map((flag) => (
        <Pressable
          key={flag.key}
          accessibilityRole="switch"
          accessibilityLabel={flag.label}
          accessibilityState={{
            checked: saved[flag.key],
            disabled: busy !== null,
          }}
          disabled={busy !== null}
          onPress={() => toggle(flag.key, flag.label)}
          style={styles.toggle}
        >
          <View style={styles.flex}>
            <Text>{flag.label}</Text>
            <Text variant="body-sm" tone="secondary">
              {flag.detail}
            </Text>
          </View>
          <Switch
            value={saved[flag.key]}
            pointerEvents="none"
            accessible={false}
            trackColor={{
              false: color["border-strong"],
              true: color["accent-quiet"],
            }}
            thumbColor={
              saved[flag.key] ? color.accent : color["text-secondary"]
            }
          />
        </Pressable>
      ))}
      <Card style={styles.stack}>
        <Text variant="h2">Thresholds</Text>
        <TextField
          label="Large move threshold (%)"
          value={move}
          onChangeText={setMove}
          keyboardType="decimal-pad"
        />
        <TextField
          label="Prediction move threshold (points)"
          value={points}
          onChangeText={setPoints}
          keyboardType="decimal-pad"
        />
        <Text variant="body-sm" tone="secondary">
          A move from 54% to 64% is 10 points.
        </Text>
        <Button
          label="Save thresholds"
          disabled={busy !== null}
          loading={busy === "thresholds"}
          onPress={thresholds}
        />
      </Card>
      <Card style={styles.stack}>
        <Text variant="h2">Daily summary time</Text>
        <TextField
          label="Time (HH:MM, 24-hour)"
          value={time}
          onChangeText={setTime}
          keyboardType="numbers-and-punctuation"
          maxLength={5}
        />
        <Text variant="body-sm" tone="secondary">
          {zone
            ? `Device timezone: ${zone}. The saved schedule is shown in this timezone; Save keeps that local time.`
            : "Your device timezone could not be read. Set it in system settings first."}
        </Text>
        <Button
          label="Save summary time"
          disabled={busy !== null || zone === null}
          loading={busy === "time"}
          onPress={summary}
        />
      </Card>
      {error && (
        <Text tone="negative" accessibilityLiveRegion="polite">
          {error}
        </Text>
      )}
      <Button
        label="Send a test notification"
        variant="accent"
        disabled={busy !== null}
        loading={busy === "test"}
        onPress={() => void test()}
      />
      {testResult && (
        <Text
          accessibilityLiveRegion="polite"
          variant="body-sm"
          tone="secondary"
        >
          {testResult}
        </Text>
      )}
    </>
  );
}
const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: color["surface-base"] },
  stack: { gap: 12 },
  toggle: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    minHeight: 48,
    paddingVertical: 12,
  },
  flex: { flex: 1, gap: 4 },
});
