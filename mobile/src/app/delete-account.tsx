import { useState } from "react";
import { Linking, StyleSheet, View } from "react-native";
import { Check, Minus, TriangleAlert } from "lucide-react-native";
import { truncateMiddle } from "@/lib/format";
import { DetailScreen } from "~/components/portfolio/parts";
import { Button } from "~/components/ui/controls";
import { Text } from "~/components/ui/Text";
import { TextField } from "~/components/ui/TextField";
import { Notice, outcomeHaptic } from "~/components/wallet/parts";
import { api, ApiError } from "~/lib/api";
import { useElyraAuth } from "~/lib/auth/AuthProvider";
import { clearLocalData } from "~/lib/localData";
import { color, radius } from "~/theme/tokens";

/* ---------------------------------------------------------------------------
   Delete account — in the app, as the dApp Store requires.

   Two steps. The first says exactly what goes and what does not, including
   that this is the same account as the website's, so it goes there too.
   The second asks for the word DELETE, typed. Only then does
   DELETE /api/account run (lib/auth/deletion.ts on the server), and once it
   has answered the app signs out and wipes what this phone kept
   (lib/localData.ts).

   A failure says so and leaves the person signed in to try again; the
   server's delete is idempotent, so a retry finishes whatever the last
   attempt did not.
--------------------------------------------------------------------------- */

const DELETED = [
  "Your Elyra profile",
  "Registered devices and your notification inbox",
  "Price alerts, prediction alert rules and notification settings",
  "Ask Elyra conversations and what Elyra remembers about you",
  "Research reports, their PDFs, and backtests",
  "Exchange and Polymarket connections, with their stored keys",
  "Watchlists, referrals and points",
];

const CONFIRM_WORD = "DELETE";

function Line({ kept = false, children }: { kept?: boolean; children: string }) {
  return (
    <View style={styles.line}>
      {kept ? (
        <Minus size={16} strokeWidth={1.5} color={color["text-muted"]} />
      ) : (
        <Check size={16} strokeWidth={1.5} color={color.negative} />
      )}
      <Text variant="body-sm" style={styles.flex}>
        {children}
      </Text>
    </View>
  );
}

export default function DeleteAccountScreen() {
  const auth = useElyraAuth();
  const [step, setStep] = useState<"explain" | "confirm">("explain");
  const [typed, setTyped] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const embedded = auth.account?.solanaIsEmbedded === true;
  const address = auth.solanaAddress;

  const remove = async () => {
    if (typed !== CONFIRM_WORD || busy) return;
    setBusy(true);
    setError(null);
    try {
      await api.delete("/api/account", { confirm: CONFIRM_WORD }, { timeoutMs: 45_000 });
    } catch (failure) {
      setBusy(false);
      outcomeHaptic("error");
      setError(failure instanceof ApiError ? failure.message : "Your account could not be deleted. Try again.");
      return;
    }
    outcomeHaptic("success");
    /* Signed out first, so nothing reads for the account while its data is
       wiped; the sign-in screen then says why. */
    await auth.logout("Your Elyra account was deleted, on the app and the website.").catch(() => {});
    await clearLocalData();
  };

  return (
    <DetailScreen title="Delete account">
      {step === "explain" ? (
        <>
          <View style={styles.warning}>
            <TriangleAlert size={18} strokeWidth={1.5} color={color.negative} />
            <View style={styles.flex}>
              <Text variant="body">This deletes your Elyra account everywhere</Text>
              <Text variant="body-sm" tone="secondary">
                The app and getelyra.xyz share one account, so it is deleted on the website too. It can&apos;t be undone.
              </Text>
            </View>
          </View>

          <View style={styles.panel}>
            <Text variant="eyebrow" tone="muted" accessibilityRole="header">
              Deleted
            </Text>
            {DELETED.map((entry) => (
              <Line key={entry}>{entry}</Line>
            ))}
            <Line>Your sign-in, so this login can&apos;t be used with Elyra again</Line>
          </View>

          <View style={styles.panel}>
            <Text variant="eyebrow" tone="muted" accessibilityRole="header">
              Not deleted
            </Text>
            <Line kept>Your on-chain history. Transactions on Solana are public and permanent; nobody can remove them.</Line>
            <Line kept>
              {address === null
                ? "Your wallet. Its funds stay at its address."
                : `Your wallet ${truncateMiddle(address, 4, 4)} and its funds, which stay at its address.`}
            </Line>
          </View>

          {embedded ? (
            <Notice tone="caution">
              Your wallet is an Elyra embedded wallet. Once the account is deleted you can&apos;t sign in to reach it, so export its
              key first at getelyra.xyz (Wallet, then Export wallet) or move its funds to a wallet you hold.
            </Notice>
          ) : (
            <Notice tone="neutral">Your wallet&apos;s key is held by your wallet app, so the wallet is not affected.</Notice>
          )}

          {embedded && <Button label="Open getelyra.xyz to export" variant="ghost" onPress={() => void Linking.openURL("https://getelyra.xyz")} />}
          <Button label="Continue" variant="danger" onPress={() => setStep("confirm")} />
        </>
      ) : (
        <>
          <Text variant="body" accessibilityRole="header">
            Type DELETE to confirm
          </Text>
          <Text variant="body-sm" tone="secondary">
            Your account, and everything listed on the last screen, is deleted from Elyra on the app and the website. This phone is
            then signed out and cleared.
          </Text>
          <TextField
            label="Confirmation"
            value={typed}
            onChangeText={(next) => setTyped(next.trim().toUpperCase())}
            autoCapitalize="characters"
            autoCorrect={false}
            autoComplete="off"
            placeholder={CONFIRM_WORD}
            editable={!busy}
            onSubmitEditing={() => void remove()}
          />
          {error !== null && <Notice tone="negative">{error}</Notice>}
          <Button
            label={busy ? "Deleting…" : "Delete my account"}
            variant="danger"
            loading={busy}
            disabled={typed !== CONFIRM_WORD}
            onPress={() => void remove()}
          />
          <Button
            label="Keep my account"
            variant="ghost"
            disabled={busy}
            onPress={() => {
              setTyped("");
              setError(null);
              setStep("explain");
            }}
          />
        </>
      )}
    </DetailScreen>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1, minWidth: 0, gap: 2 },
  warning: {
    flexDirection: "row",
    gap: 12,
    padding: 16,
    borderRadius: radius.panel,
    borderWidth: 1,
    borderColor: color.negative,
    backgroundColor: color["surface-panel"],
  },
  panel: {
    gap: 10,
    padding: 16,
    borderRadius: radius.panel,
    borderWidth: 1,
    borderColor: color["border-subtle"],
    backgroundColor: color["surface-panel"],
  },
  line: { flexDirection: "row", alignItems: "flex-start", gap: 10 },
});
