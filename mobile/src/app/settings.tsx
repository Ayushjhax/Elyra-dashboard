import { useCallback, useEffect, useState } from "react";
import { Linking, Pressable, StyleSheet, Switch, View } from "react-native";
import * as LocalAuthentication from "expo-local-authentication";
import { router, type Href } from "expo-router";
import { ChevronRight, ExternalLink } from "lucide-react-native";
import type { MarketFilter } from "@/lib/types";
import { DetailScreen } from "~/components/portfolio/parts";
import { Button, OptionMenu } from "~/components/ui/controls";
import { Text } from "~/components/ui/Text";
import { useToast } from "~/components/ui/overlays";
import { api, ApiError } from "~/lib/api";
import { PRIVACY_URL, versionLabel } from "~/lib/legal";
import { useAppStore } from "~/lib/store";
import { confirmBeforeSigning, SigningError } from "~/lib/wallet/signer";
import { color, radius, TOUCH_TARGET } from "~/theme/tokens";

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

function Group({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <View style={styles.group}>
      <Text variant="eyebrow" tone="muted" accessibilityRole="header">
        {title}
      </Text>
      <View style={styles.panel}>{children}</View>
    </View>
  );
}

function SwitchRow({
  label,
  detail,
  value,
  onChange,
  disabled = false,
  last = false,
}: {
  label: string;
  detail: string;
  value: boolean;
  onChange: (next: boolean) => void;
  disabled?: boolean;
  last?: boolean;
}) {
  return (
    <Pressable
      accessibilityRole="switch"
      accessibilityLabel={label}
      accessibilityHint={detail}
      accessibilityState={{ checked: value, disabled }}
      disabled={disabled}
      onPress={() => onChange(!value)}
      style={[styles.row, !last && styles.ruled]}
    >
      <View style={styles.flex}>
        <Text>{label}</Text>
        <Text variant="body-sm" tone="secondary">
          {detail}
        </Text>
      </View>
      <Switch
        value={value}
        pointerEvents="none"
        accessible={false}
        trackColor={{ false: color["border-strong"], true: color["accent-quiet"] }}
        thumbColor={value ? color.accent : color["text-secondary"]}
      />
    </Pressable>
  );
}

function LinkRow({ label, detail, onPress, external = false, last = false }: { label: string; detail?: string; onPress: () => void; external?: boolean; last?: boolean }) {
  return (
    <Pressable
      accessibilityRole={external ? "link" : "button"}
      accessibilityHint={detail}
      onPress={onPress}
      android_ripple={{ color: color["surface-hover"] }}
      style={[styles.row, !last && styles.ruled]}
    >
      <View style={styles.flex}>
        <Text>{label}</Text>
        {detail !== undefined && (
          <Text variant="body-sm" tone="secondary">
            {detail}
          </Text>
        )}
      </View>
      {external ? (
        <ExternalLink size={16} strokeWidth={1.5} color={color["text-muted"]} />
      ) : (
        <ChevronRight size={16} strokeWidth={1.5} color={color["text-muted"]} />
      )}
    </Pressable>
  );
}

function Fact({ label, value, tone = "primary", last = false }: { label: string; value: string; tone?: "primary" | "positive" | "negative" | "caution" | "muted"; last?: boolean }) {
  return (
    <View style={[styles.row, !last && styles.ruled]} accessible accessibilityLabel={`${label}: ${value}`}>
      <Text tone="secondary" style={styles.flex}>
        {label}
      </Text>
      <Text variant="data" tone={tone} style={styles.value}>
        {value}
      </Text>
    </View>
  );
}

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
  { key: "push", label: "Push notifications" },
];

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

  return (
    <DetailScreen title="Settings">
      <Group title="Privacy">
        <SwitchRow
          label="Hide balances"
          detail="Masks every amount in the app until you show them again. Handy in public."
          value={hidden}
          onChange={setHidden}
          last
        />
      </Group>

      <Group title="Security">
        <SwitchRow
          label="Require fingerprint or face to sign"
          detail={
            enrolled === false
              ? "Nothing is set up on this phone to check against, so Elyra signs without asking. Add a fingerprint or screen lock in Android settings."
              : "Your phone checks it's you before your wallet signs anything — every swap and transfer."
          }
          value={requireAuth}
          onChange={(next) => void changeSigning(next)}
          disabled={switching}
          last
        />
      </Group>

      <Group title="Notifications">
        <LinkRow
          label="Notifications"
          detail="Push, the inbox and which updates you get. These apply to your account on every device."
          onPress={() => router.push("/notification-settings" as Href)}
          last
        />
      </Group>

      <Group title="Defaults">
        <View style={[styles.row]}>
          <View style={styles.flex}>
            <Text>Default market type</Text>
            <Text variant="body-sm" tone="secondary">
              What the portfolio&apos;s positions, orders and history open filtered to.
            </Text>
          </View>
          <OptionMenu label="Default market type" choices={MARKET_TYPES} value={marketType} onChange={setMarketType} />
        </View>
      </Group>

      <Group title="Data & privacy">
        <View style={[styles.row, styles.ruled, styles.column]}>
          <Text>On this phone</Text>
          <Text variant="body-sm" tone="secondary">
            Your preferences, starred markets and recent searches, and any report PDFs you opened. Your account&apos;s
            data — alerts, conversations, connections — is kept by Elyra&apos;s servers, not here. Signing out clears the
            PDFs.
          </Text>
          <Button
            label={recent === 0 ? "No recent searches" : `Clear ${recent} recent ${recent === 1 ? "search" : "searches"}`}
            size="sm"
            disabled={recent === 0}
            onPress={() => {
              clearRecent();
              toast("Cleared your recent searches", "positive");
            }}
          />
        </View>
        <LinkRow label="Privacy policy" detail="What Elyra collects, who processes it, and for how long" external onPress={() => void Linking.openURL(PRIVACY_URL)} />
        <LinkRow
          label="Delete account"
          detail="Deletes your Elyra account and its data, on the app and the website"
          onPress={() => router.push("/delete-account" as Href)}
          last
        />
      </Group>

      <Group title="About">
        <Fact label="Version" value={versionLabel()} />
        <Fact label="API" value={API_HOST} />
        <Fact
          label="API status"
          value={
            checking
              ? "Checking…"
              : health !== null
                ? missing.length === 0
                  ? `Up · ${health.version}${health.commit ? ` · ${health.commit}` : ""}`
                  : `Up · ${missing.length} not set up`
                : "Unreachable"
          }
          tone={checking ? "muted" : health === null ? "negative" : missing.length === 0 ? "positive" : "caution"}
          last={missing.length === 0 && error === null}
        />
        {missing.length > 0 && (
          <View style={[styles.row, styles.column]}>
            <Text variant="body-sm" tone="secondary">
              Not set up on this deployment: {missing.map((entry) => entry.label).join(", ")}. Those features say so where you
              use them.
            </Text>
          </View>
        )}
        {error !== null && (
          <View style={[styles.row, styles.column]}>
            <Text variant="body-sm" tone="negative" accessibilityLiveRegion="polite">
              {error}
            </Text>
            <Button label="Check again" size="sm" onPress={check} />
          </View>
        )}
      </Group>
    </DetailScreen>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1, minWidth: 0, gap: 2 },
  group: { gap: 8 },
  panel: {
    borderRadius: radius.panel,
    borderWidth: 1,
    borderColor: color["border-subtle"],
    backgroundColor: color["surface-panel"],
    overflow: "hidden",
  },
  row: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    minHeight: TOUCH_TARGET + 8,
    paddingHorizontal: 16,
    paddingVertical: 12,
  },
  column: { flexDirection: "column", alignItems: "stretch", gap: 8 },
  ruled: { borderBottomWidth: StyleSheet.hairlineWidth * 2, borderBottomColor: color["border-subtle"] },
  value: { flexShrink: 1, textAlign: "right" },
});
