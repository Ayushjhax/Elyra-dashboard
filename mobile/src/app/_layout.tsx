import { useEffect } from "react";
import { StyleSheet } from "react-native";
import { useFonts } from "expo-font";
import { Stack } from "expo-router";
import * as SplashScreen from "expo-splash-screen";
import { StatusBar } from "expo-status-bar";
import * as SystemUI from "expo-system-ui";
import { GestureHandlerRootView } from "react-native-gesture-handler";
import { KeyboardProvider } from "react-native-keyboard-controller";
import { SafeAreaProvider } from "react-native-safe-area-context";
import { BottomSheetModalProvider } from "@gorhom/bottom-sheet";
import { Restoring } from "~/components/shell/Restoring";
import { UpdateRequired } from "~/components/shell/UpdateRequired";
import { AuthProvider, useElyraAuth } from "~/lib/auth/AuthProvider";
import { ToastProvider } from "~/components/ui/overlays";
import { useAppStore } from "~/lib/store";
import { useVersionGate } from "~/lib/versionGate";
import { FONT_FILES } from "~/theme/fonts";
import { color } from "~/theme/tokens";
import { NotificationRuntime } from "~/components/notifications/NotificationRuntime";
import { APP_VERSION } from "~/lib/api";
import { initCrashReporting, withCrashReporting } from "~/lib/crash";

/* ---------------------------------------------------------------------------
   The root: fonts (the splash stays up until they load, so text never
   renders in a fallback face first), the forest system bars, the providers,
   the persisted preferences, and the version gate.

   Signed-in and signed-out routes are separated with Stack.Protected, on the
   real session. While Privy restores a session the app shows a neutral
   skeleton — never the sign-in screen, which would flash at everyone who is
   already signed in.
--------------------------------------------------------------------------- */

void SplashScreen.preventAutoHideAsync();
initCrashReporting(APP_VERSION);

export default withCrashReporting(RootLayout);

function RootLayout() {
  const [fontsLoaded, fontError] = useFonts(FONT_FILES);
  const gate = useVersionGate();

  useEffect(() => {
    void useAppStore.persist.rehydrate();
    void SystemUI.setBackgroundColorAsync(color["surface-base"]);
  }, []);

  const ready = (fontsLoaded || fontError !== null) && gate.status !== "checking";
  useEffect(() => {
    if (ready) void SplashScreen.hideAsync();
  }, [ready]);

  if (!ready) return null;

  return (
    <GestureHandlerRootView style={styles.root}>
      <SafeAreaProvider>
        {/* The chat's composer rides the keyboard (react-native-keyboard-controller). */}
        <KeyboardProvider>
        <StatusBar style="light" />
        {gate.status === "blocked" ? (
          <UpdateRequired minimum={gate.config.minSupportedVersion} />
        ) : (
          <AuthProvider>
            <ToastProvider>
              <BottomSheetModalProvider>
                <Navigator />
                <NotificationRuntime />
              </BottomSheetModalProvider>
            </ToastProvider>
          </AuthProvider>
        )}
        </KeyboardProvider>
      </SafeAreaProvider>
    </GestureHandlerRootView>
  );
}

const MODALS = ["wallet", "swap", "transfer", "receive", "search", "notifications", "alert"] as const;

/* Pushed screens: the portfolio's detail views and the account dashboard. */
const DETAILS = ["capital", "holdings", "risk", "defi", "orders", "fills", "activity", "dashboard", "asset/[symbol]", "notification-settings", "report/[id]", "company/[query]", "prediction/[id]", "connections", "referrals", "automation", "settings", "legal", "licenses", "delete-account"] as const;

function Navigator() {
  const auth = useElyraAuth();
  if (!auth.ready) return <Restoring error={auth.startError} />;
  return (
    <Stack
      screenOptions={{
        headerShown: false,
        contentStyle: { backgroundColor: color["surface-base"] },
        animation: "fade",
      }}
    >
      <Stack.Protected guard={auth.authenticated}>
        <Stack.Screen name="(tabs)" />
        {MODALS.map((name) => (
          <Stack.Screen key={name} name={name} options={{ presentation: "modal", animation: "slide_from_bottom" }} />
        ))}
        {DETAILS.map((name) => (
          <Stack.Screen key={name} name={name} options={{ animation: "slide_from_right" }} />
        ))}
        {/* Development builds only (the screen redirects in a release). */}
        <Stack.Screen name="dev" options={{ presentation: "modal", animation: "slide_from_bottom" }} />
      </Stack.Protected>
      {/* The only route a signed-out person can reach, so it is where they land. */}
      <Stack.Protected guard={!auth.authenticated}>
        <Stack.Screen name="welcome" />
      </Stack.Protected>
    </Stack>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: color["surface-base"] },
});
