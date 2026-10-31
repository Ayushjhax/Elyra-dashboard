import { useCallback, useEffect, useState } from "react";
import { Linking, StyleSheet, View } from "react-native";
import * as LocalAuthentication from "expo-local-authentication";
import { router, type Href } from "expo-router";
import { Bell, EyeOff, FileText, Fingerprint, RefreshCw, SlidersHorizontal, Smartphone, Trash2 } from "lucide-react-native";
import type { MarketFilter } from "@/lib/types";
import { WideButton } from "~/components/shell/flow";
import { FactRow, PreferenceSwitchRow, SettingsGroup, SettingsPage, SettingsRow } from "~/components/shell/settings";
import { OptionMenu } from "~/components/ui/controls";
import { Text } from "~/components/ui/Text";
import { useToast } from "~/components/ui/overlays";
import { api, ApiError } from "~/lib/api";
import { PRIVACY_URL, versionLabel } from "~/lib/legal";
import { useAppStore } from "~/lib/store";
import { confirmBeforeSigning, SigningError } from "~/lib/wallet/signer";
import { color } from "~/theme/tokens";

/* ---------------------------------------------------------------------------
   Settings — this phone's preferences, and what the app is.

   Hiding balances, the signing check, the market type the ledger opens on
   and the search history are this phone's (lib/store.ts); notification
   preferences are the account's and live on their own screen. Turning the
   signing check off asks for the check first, so a phone left unlocked
   cannot have it switched off by someone else.

   About reads /api/health — booleans only, no secret — so a problem with
   the deployment shows up here as words rather than as screens failing one
   by one.
--------------------------------------------------------------------------- */

const MARKET_TYPES: { value: MarketFilter; label: string }[] = [
  { value: "all", label: "All markets" },
  { value: "spot", label: "Spot" },
  { value: "perps", label: "Perps" },
  { value: "prediction", label: "Prediction" },
  { value: "defi", label: "DeFi" },
];

interface Health {
  ok: boolean;
  version: string;
  commit: string | null;
  configured: Record<string, boolean>;
}

const API_HOST = (() => {
  try {
    return new URL(process.env.EXPO_PUBLIC_API_URL ?? "").host;
  } catch {
    return "Not set";
  }
})();

/** What the phone can check a signature against: nothing, or a fingerprint, face or screen lock. */
function useEnrolment(): boolean | null {
  const [enrolled, setEnrolled] = useState<boolean | null>(null);
  useEffect(() => {
    let live = true;
    void Promise.all([LocalAuthentication.hasHardwareAsync(), LocalAuthentication.isEnrolledAsync()])
      .then(([hardware, any]) => live && setEnrolled(hardware && any))
      .catch(() => live && setEnrolled(false));
    return () => {
      live = false;
    };
  }, []);
  return enrolled;
}

function useHealth(): { health: Health | null; error: string | null; checking: boolean; check: () => void } {
  const [health, setHealth] = useState<Health | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [checking, setChecking] = useState(true);
  /* The read itself sets state only when it answers, so the first one can
     run from an effect; "Check again" marks it as checking first. */
  const load = useCallback(() => {
    api
      .get<Health>("/api/health", { auth: false, timeoutMs: 10_000 })
      .then((body) => {
        setHealth(body);
        setError(null);
      })
      .catch((failure: unknown) => {
        setHealth(null);
        setError(failure instanceof ApiError ? failure.message : "Could not reach Elyra.");
      })
      .finally(() => setChecking(false));
  }, []);
  useEffect(load, [load]);
  const check = useCallback(() => {
    setChecking(true);
    load();
  }, [load]);
  return { health, error, checking, check };
}

/* What the health route's flags mean to a person, for the ones a feature
   visibly depends on. */
const DEPENDENCIES: { key: string; label: string }[] = [
  { key: "auth", label: "Sign-in" },
  { key: "database", label: "Account data" },
  { key: "prices", label: "Prices" },
  { key: "solanaRpc", label: "Solana network" },
  { key: "agent", label: "Ask Elyra" },
];
/* Not "push": its flag is EXPO_ACCESS_TOKEN, which push works without
   (lib/notifications/push.ts), so it is no measure of whether pushes arrive. */

export default function SettingsScreen() {
  const toast = useToast();
  const hidden = useAppStore((state) => state.balancesHidden);
  const setHidden = useAppStore((state) => state.setBalancesHidden);
  const requireAuth = useAppStore((state) => state.requireAuthToSign);
  const setRequireAuth = useAppStore((state) => state.setRequireAuthToSign);
  const marketType = useAppStore((state) => state.marketType);
  const setMarketType = useAppStore((state) => state.setMarketType);
  const recent = useAppStore((state) => state.recentSearches.length);
  const clearRecent = useAppStore((state) => state.clearRecentSearches);
  const enrolled = useEnrolment();
  const { health, error, checking, check } = useHealth();
  const [switching, setSwitching] = useState(false);

  const changeSigning = async (next: boolean) => {
    if (next) {
      setRequireAuth(true);
      return;
    }
    /* Off only after the check it turns off. */
    setSwitching(true);
    try {
      await confirmBeforeSigning(true);
      setRequireAuth(false);
    } catch (failure) {
      if (!(failure instanceof SigningError && failure.cancelled)) toast("The check could not run, so it stays on.", "negative");
    } finally {
      setSwitching(false);
    }
  };

  const missing = health === null ? [] : DEPENDENCIES.filter((entry) => health.configured[entry.key] === false);

  const statusValue = checking
    ? "Checking…"
    : health !== null
      ? missing.length === 0
        ? `Up · ${health.version}${health.commit ? ` · ${health.commit}` : ""}`
        : `Up · ${missing.length} not set up`
      : "Unreachable";
  const statusTone = checking ? "muted" : health === null ? "negative" : missing.length === 0 ? "positive" : "caution";

  return (
    <SettingsPage title="Settings" subtitle="Make Elyra yours.">
      <SettingsGroup label="Privacy">
        <PreferenceSwitchRow
          first
          icon={EyeOff}
          title="Hide balances"
          detail="Mask amounts across the app."
          value={hidden}
          onChange={setHidden}
        />
      </SettingsGroup>

      <SettingsGroup label="Security">
        <PreferenceSwitchRow
          first
          icon={Fingerprint}
          title="Biometric signing"
          detail={
            enrolled === false
              ? "Nothing is set up on this phone to check against, so Elyra signs without asking. Add a fingerprint or screen lock in Android settings."
              : "Elyra asks for your fingerprint, face or screen lock before your wallet signs a swap or transfer."
          }
          value={requireAuth}
          onChange={(next) => void changeSigning(next)}
          busy={switching}
        />
      </SettingsGroup>

      <SettingsGroup label="Notifications">
        <SettingsRow
          first
          icon={Bell}
          title="Notifications"
          detail="Push, inbox and your update preferences. They apply to your account on every device."
          onPress={() => router.push("/notification-settings" as Href)}
        />
      </SettingsGroup>

      <SettingsGroup label="Defaults">
        <SettingsRow
          first
          icon={SlidersHorizontal}
          title="Default market type"
          detail="What the portfolio's positions, orders and history open filtered to."
        >
          <OptionMenu label="Default market type" choices={MARKET_TYPES} value={marketType} onChange={setMarketType} />
        </SettingsRow>
      </SettingsGroup>

      <SettingsGroup label="Data & privacy">
        <SettingsRow
          first
          icon={Smartphone}
          title="On this phone"
          detail="Stored locally: preferences, starred markets, recent searches and opened report PDFs."
          note="Alerts, conversations and connections are stored on Elyra's servers. Signing out clears downloaded PDFs."
        >
          <WideButton
            label={recent === 0 ? "No recent searches" : `Clear ${recent} recent ${recent === 1 ? "search" : "searches"}`}
            variant="outline"
            disabled={recent === 0}
            accessibilityHint="Clears only your search history. Starred markets stay."
            onPress={() => {
              clearRecent();
              toast("Cleared your recent searches", "positive");
            }}
          />
        </SettingsRow>
        <SettingsRow
          icon={FileText}
          title="Privacy policy"
          detail="What is collected, who processes it and for how long."
          trailing="external"
          onPress={() => void Linking.openURL(PRIVACY_URL)}
        />
      </SettingsGroup>

      <SettingsGroup danger>
        <SettingsRow
          first
          icon={Trash2}
          tone="negative"
          title="Delete account"
          detail="Deletes your Elyra account and data, on the app and the website."
          accessibilityHint="Opens the confirmation. Nothing is deleted yet."
          onPress={() => router.push("/delete-account" as Href)}
        />
      </SettingsGroup>

      <SettingsGroup label="About">
        <FactRow first label="Version" value={versionLabel()} />
        <FactRow label="API" value={API_HOST} />
        <FactRow label="API status" value={statusValue} tone={statusTone} dot />
        {missing.length > 0 && (
          <View style={styles.aboutNote}>
            <Text variant="body-sm" tone="secondary">
              Not set up on this deployment: {missing.map((entry) => entry.label).join(", ")}. Those features say so where you
              use them.
            </Text>
          </View>
        )}
        {error !== null && (
          <View style={styles.aboutNote}>
            <Text variant="body-sm" tone="negative" accessibilityLiveRegion="polite">
              {error}
            </Text>
            <WideButton label="Check again" variant="outline" leading={RefreshCw} busy={checking} onPress={check} />
          </View>
        )}
      </SettingsGroup>
    </SettingsPage>
  );
}

const styles = StyleSheet.create({
  aboutNote: {
    gap: 12,
    paddingHorizontal: 20,
    paddingVertical: 14,
    borderTopWidth: StyleSheet.hairlineWidth * 2,
    borderTopColor: color["border-subtle"],
  },
});
