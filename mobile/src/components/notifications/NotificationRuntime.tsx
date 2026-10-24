import { useEffect, useRef, useState } from "react";
import { AppState, Pressable, StyleSheet, View } from "react-native";
import * as Notifications from "expo-notifications";
import { router, type Href } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Bell, X } from "lucide-react-native";
import { accountKey } from "@/lib/account";
import { notificationRoute } from "@/lib/notifications/routes";
import { Button, IconButton } from "~/components/ui/controls";
import { Dialog, useToast } from "~/components/ui/overlays";
import { Text } from "~/components/ui/Text";
import { useElyraAuth } from "~/lib/auth/AuthProvider";
import { currentAccount, sessionVersion } from "~/lib/session";
import {
  inboxStore,
  markNotificationsRead,
  useInbox,
} from "~/lib/notifications/stores";
import {
  acceptPushPrompt,
  clearPushSession,
  dismissPushPrompt,
  refreshPushStatus,
  startPushSession,
  usePushState,
} from "~/lib/notifications/push";
import {
  notificationIntent,
  ownedNotification,
  type NotificationIntent,
} from "~/lib/notifications/intents";
import { useAppStore } from "~/lib/store";
import { color, radius } from "~/theme/tokens";

// Foreground delivery uses Elyra's banner; background delivery uses Android.
Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowBanner: false,
    shouldShowList: false,
    shouldPlaySound: false,
    shouldSetBadge: false,
  }),
});
const intentFor = (notification: Notifications.Notification) =>
  notificationIntent(notification.request);
export function NotificationRuntime() {
  const auth = useElyraAuth();
  const key = accountKey(auth);
  const feed = useInbox(); // Presence and unread state are independent of push permission.
  const push = usePushState();
  const toast = useToast();
  const insets = useSafeAreaInsets();
  const getToken = useRef(auth.getAccessToken);
  const [banner, setBanner] = useState<Notifications.Notification | null>(null);
  const [pending, setPending] = useState<NotificationIntent | null>(null);
  const handling = useRef<string | null>(null);
  const handled = useRef(new Set<string>());
  const keyRef = useRef(key);
  useEffect(() => {
    keyRef.current = key;
  }, [key]);
  useEffect(() => {
    getToken.current = auth.getAccessToken;
  }, [auth.getAccessToken]);
  useEffect(() => {
    if (!key) return;
    startPushSession({ account: key, getToken: () => getToken.current() });
    return () => clearPushSession(key);
  }, [key]);
  useEffect(() => {
    const change = AppState.addEventListener("change", (state) => {
      if (state === "active") void refreshPushStatus();
    });
    let previousNative = "";
    const token = Notifications.addPushTokenListener((native) => {
      const signature = JSON.stringify(native);
      if (signature === previousNative) return;
      previousNative = signature;
      void refreshPushStatus(native);
    });
    const received = Notifications.addNotificationReceivedListener(
      (notification) => {
        const intent = intentFor(notification);
        const account = keyRef.current;
        const ticket = sessionVersion();
        if (!account || !intent) return;
        void inboxStore.refresh().then(() => {
          if (sessionVersion() !== ticket || currentAccount() !== account)
            return;
          if (
            ownedNotification(intent, inboxStore.snapshot().data) &&
            AppState.currentState === "active"
          )
            setBanner(notification);
        });
      },
    );
    const respond = (response: Notifications.NotificationResponse) => {
      if (response.actionIdentifier !== Notifications.DEFAULT_ACTION_IDENTIFIER)
        return;
      const intent = intentFor(response.notification);
      if (intent) void inboxStore.refresh().then(() => setPending(intent));
    };
    const response =
      Notifications.addNotificationResponseReceivedListener(respond);
    void Notifications.getLastNotificationResponseAsync()
      .then((last) => {
        if (last) respond(last);
      })
      .catch(() => {});
    return () => {
      change.remove();
      token.remove();
      received.remove();
      response.remove();
    };
  }, []);
  useEffect(() => {
    if (!banner) return;
    const timer = setTimeout(() => setBanner(null), 8000);
    return () => clearTimeout(timer);
  }, [banner]);
  useEffect(() => {
    if (
      !pending ||
      !key ||
      currentAccount() !== key ||
      !feed.data?.accountId ||
      handling.current === pending.identifier ||
      handled.current.has(pending.identifier)
    )
      return;
    const owned = ownedNotification(pending, feed.data);
    if (!owned) {
      handled.current.add(pending.identifier);
      void Notifications.clearLastNotificationResponseAsync();
      return;
    }
    const account = key;
    const ticket = sessionVersion();
    handling.current = pending.identifier;
    void (async () => {
      try {
        if (owned.notificationId)
          await markNotificationsRead([owned.notificationId]);
      } catch {
        toast(
          "Opened the notification, but its read status could not be saved.",
          "negative",
        );
      }
      if (currentAccount() !== account || sessionVersion() !== ticket) {
        handling.current = null;
        return;
      }
      const route = notificationRoute(owned.route);
      if (owned.route === "/agent")
        useAppStore.getState().setAgentTab("actions");
      if (owned.route === "/personalized")
        useAppStore.getState().setAgentTab("capital-intelligence");
      handled.current.add(pending.identifier);
      router.push(route as Href);
      await Notifications.clearLastNotificationResponseAsync();
      handling.current = null;
    })();
  }, [pending, key, feed.data, toast]);
  const visibleBanner =
    banner &&
    key &&
    key === currentAccount() &&
    ownedNotification(intentFor(banner), feed.data)
      ? banner
      : null;
  return (
    <>
      {visibleBanner && (
        <View
          style={[styles.banner, { top: insets.top + 8 }]}
          accessibilityLiveRegion="polite"
        >
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={`Open ${visibleBanner.request.content.title ?? "notification"}`}
            style={styles.bannerBody}
            onPress={() => {
              setPending(intentFor(visibleBanner));
              setBanner(null);
            }}
          >
            <Bell size={20} color={color.accent} strokeWidth={1.5} />
            <View style={styles.flex}>
              <Text variant="h2">{visibleBanner.request.content.title}</Text>
              <Text variant="body-sm" tone="secondary" numberOfLines={3}>
                {visibleBanner.request.content.body}
              </Text>
            </View>
          </Pressable>
          <IconButton
            accessibilityLabel="Dismiss notification banner"
            onPress={() => setBanner(null)}
          >
            <X size={18} color={color["text-secondary"]} />
          </IconButton>
        </View>
      )}
      <Dialog
        open={push.prompt !== null}
        title="Hear when it matters"
        onClose={dismissPushPrompt}
      >
        <Text>
          {push.prompt?.label}. Elyra can send these updates to this phone, with
          the same message kept in your inbox.
        </Text>
        <Text tone="secondary" variant="body-sm">
          Your inbox works even if you choose not to allow push notifications.
        </Text>
        {push.error && <Text tone="negative">{push.error}</Text>}
        <Button
          label={push.status === "off" ? "Open system settings" : "Continue"}
          variant="accent"
          loading={push.busy}
          onPress={() => void acceptPushPrompt()}
        />
        <Button
          label="Inbox only for now"
          disabled={push.busy}
          onPress={dismissPushPrompt}
        />
      </Dialog>
    </>
  );
}
const styles = StyleSheet.create({
  banner: {
    position: "absolute",
    left: 16,
    right: 16,
    borderRadius: radius.card,
    borderWidth: 1,
    borderColor: color["border-strong"],
    backgroundColor: color["surface-raised"],
    flexDirection: "row",
    alignItems: "center",
    zIndex: 100,
  },
  bannerBody: {
    flex: 1,
    flexDirection: "row",
    gap: 12,
    padding: 16,
    minHeight: 48,
  },
  flex: { flex: 1, gap: 4 },
});
