import { useState } from "react";
import { Linking, Platform, StyleSheet, View } from "react-native";
import { Buffer } from "buffer";
import { useLoginWithEmail, useLoginWithOAuth, useLoginWithSiws } from "@privy-io/expo";
import { useLoginWithPasskey, useSignupWithPasskey } from "@privy-io/expo/passkey";
import { Fingerprint, Gift, Mail, Wallet } from "lucide-react-native";
import { Button } from "~/components/ui/controls";
import { Divider, Panel, Screen } from "~/components/ui/layout";
import { ElyraMark } from "~/components/ui/marks";
import { Text } from "~/components/ui/Text";
import { TextField } from "~/components/ui/TextField";
import { useElyraAuth } from "~/lib/auth/AuthProvider";
import { PRIVACY_URL, TERMS_URL } from "~/lib/legal";
import { useHeldReferral } from "~/lib/referral";
import { APP_IDENTITY, signatureFrom, withWallet } from "~/lib/wallet/mwa";
import { color, radius } from "~/theme/tokens";

/* ---------------------------------------------------------------------------
   Sign in.

   Email (a code), Google, a passkey, or the phone's own Solana wallet —
   Seed Vault on a Seeker, Phantom, Solflare — through Mobile Wallet Adapter
   and Sign-In with Solana. A wallet sign-in links that wallet to the
   account, and it is the wallet the account signs with. Anyone who signs in
   another way gets an embedded Solana wallet, as on the website.

   Errors are said plainly and the person can try again; a declined wallet
   prompt is "Cancelled", not a failure.

   A passkey is only a way in once one exists. When signing in with one finds
   none on this phone, the screen offers to create one — a new account, as
   Privy's passkey sign-up always is — and tells someone who already has an
   account to add a passkey to it from the dashboard instead.
--------------------------------------------------------------------------- */

const DOMAIN = new URL(APP_IDENTITY.uri).host;

function message(error: unknown, fallback: string): string {
  const text = error instanceof Error ? error.message : "";
  if (/reject|declin|cancel|denied|closed/i.test(text)) return "Cancelled — you were not signed in.";
  return text.length > 0 ? text : fallback;
}

export default function SignIn() {
  const auth = useElyraAuth();
  const invitedBy = useHeldReferral();
  const [email, setEmail] = useState("");
  const [code, setCode] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState<"email" | "code" | "google" | "passkey" | "passkey-signup" | "wallet" | null>(null);
  const [offerPasskeySignup, setOfferPasskeySignup] = useState(false);

  const emailLogin = useLoginWithEmail({ onError: (failure) => setError(message(failure, "That did not work.")) });
  const oauth = useLoginWithOAuth({ onError: (failure) => setError(message(failure, "Google sign-in did not complete.")) });
  const passkey = useLoginWithPasskey();
  const passkeySignup = useSignupWithPasskey({ onError: (failure) => setError(message(failure, "The passkey was not created.")) });
  const siws = useLoginWithSiws();

  const awaitingCode = emailLogin.state.status === "awaiting-code-input" || emailLogin.state.status === "submitting-code";

  const run = async (kind: NonNullable<typeof busy>, work: () => Promise<unknown>) => {
    setError(null);
    auth.clearEndedReason();
    setBusy(kind);
    try {
      await work();
    } catch (failure) {
      setError(message(failure, "Sign-in did not complete. Try again."));
    } finally {
      setBusy(null);
    }
  };

  const connectWallet = () =>
    run("wallet", async () => {
      await withWallet(async (wallet, address, account) => {
        const { message: siwsMessage } = await siws.generateMessage({
          wallet: { address },
          from: { domain: DOMAIN, uri: APP_IDENTITY.uri },
        });
        const bytes = new Uint8Array(Buffer.from(siwsMessage, "utf8"));
        const { signed_payloads } = await wallet.signMessages({
          addresses: [account.address],
          payloads: [Buffer.from(bytes).toString("base64")],
        });
        const signed = signed_payloads[0];
        if (signed === undefined) throw new Error("The wallet app returned no signature.");
        const signature = signatureFrom(new Uint8Array(Buffer.from(signed, "base64")), bytes);
        await siws.login({
          message: siwsMessage,
          signature: Buffer.from(signature).toString("base64"),
          wallet: { connectorType: "mobile_wallet_adapter", walletClientType: account.label ?? "mobile_wallet_adapter" },
        });
      });
    });

  return (
    <Screen edges={["top", "left", "right", "bottom"]} contentStyle={styles.content}>
      <View style={styles.head}>
        <ElyraMark size={56} />
        <Text variant="display" accessibilityRole="header">
          Elyra
        </Text>
        <Text variant="body" tone="secondary" style={styles.center}>
          Your capital across every venue, an analyst that shows its sources, and swaps signed in your own wallet.
        </Text>
      </View>

      {/* A referral link brought this phone here; the code is sent when the new account is created. */}
      {invitedBy !== null && (
        <View style={styles.invited} accessibilityLiveRegion="polite">
          <Gift size={16} strokeWidth={1.5} color={color.accent} />
          <Text variant="body-sm" style={styles.flex}>
            Invited by a friend
          </Text>
          <Text variant="data-sm" tone="muted">
            {invitedBy}
          </Text>
        </View>
      )}

      {(auth.endedReason ?? error) !== null && (
        <Panel style={styles.notice}>
          <Text variant="body-sm" tone={error !== null ? "negative" : "caution"} accessibilityLiveRegion="polite">
            {error ?? auth.endedReason}
          </Text>
        </Panel>
      )}

      {auth.available && (
        <>
          <Panel style={styles.block}>
            {awaitingCode ? (
              <>
                <TextField
                  label={`Code sent to ${email}`}
                  value={code}
                  onChangeText={setCode}
                  keyboardType="number-pad"
                  textContentType="oneTimeCode"
                  autoComplete="one-time-code"
                  autoFocus
                  maxLength={6}
                />
                <Button
                  label="Sign in"
                  variant="accent"
                  loading={busy === "code"}
                  disabled={code.trim().length < 6}
                  onPress={() => void run("code", () => emailLogin.loginWithCode({ code: code.trim(), email }))}
                />
              </>
            ) : (
              <>
                <TextField
                  label="Email"
                  value={email}
                  onChangeText={setEmail}
                  keyboardType="email-address"
                  autoCapitalize="none"
                  autoComplete="email"
                  textContentType="emailAddress"
                  placeholder="you@example.com"
                />
                <Button
                  label="Email me a code"
                  variant="accent"
                  icon={<Mail size={16} strokeWidth={1.5} color={color["text-on-accent"]} />}
                  loading={busy === "email"}
                  disabled={!/^\S+@\S+\.\S+$/.test(email.trim())}
                  onPress={() => void run("email", () => emailLogin.sendCode({ email: email.trim() }))}
                />
              </>
            )}
          </Panel>

          <View style={styles.or}>
            <Divider style={styles.flex} />
            <Text variant="label" tone="muted">
              or
            </Text>
            <Divider style={styles.flex} />
          </View>

          <View style={styles.block}>
            {Platform.OS === "android" && (
              <Button
                label="Connect a Solana wallet"
                icon={<Wallet size={16} strokeWidth={1.5} color={color["text-primary"]} />}
                loading={busy === "wallet"}
                onPress={() => void connectWallet()}
              />
            )}
            <Button
              label="Continue with Google"
              loading={busy === "google"}
              onPress={() => void run("google", () => oauth.login({ provider: "google" }))}
            />
            <Button
              label="Use a passkey"
              icon={<Fingerprint size={16} strokeWidth={1.5} color={color["text-primary"]} />}
              loading={busy === "passkey"}
              onPress={() =>
                void run("passkey", async () => {
                  try {
                    await passkey.loginWithPasskey({ relyingParty: APP_IDENTITY.uri });
                  } catch {
                    /* Android says only that none was chosen — none saved for
                       getelyra.xyz looks the same as a dismissed sheet. */
                    setOfferPasskeySignup(true);
                    throw new Error("No Elyra passkey was used on this phone.");
                  }
                })
              }
            />
          </View>

          {offerPasskeySignup && (
            <Panel style={styles.block}>
              <Text variant="body-sm">New to Elyra? Create an account that signs in with a passkey on this phone.</Text>
              <Button
                label="Create a passkey"
                icon={<Fingerprint size={16} strokeWidth={1.5} color={color["text-primary"]} />}
                loading={busy === "passkey-signup"}
                onPress={() => void run("passkey-signup", () => passkeySignup.signupWithPasskey({ relyingParty: APP_IDENTITY.uri }))}
              />
              <Text variant="body-sm" tone="secondary">
                Already have an account? Sign in another way, then add a passkey in Account → Dashboard.
              </Text>
            </Panel>
          )}
        </>
      )}

      <Text variant="label" tone="muted" style={styles.center}>
        Elyra never holds your keys. Not financial advice.
      </Text>
      <View style={styles.legal}>
        <Button label="Privacy policy" size="sm" variant="ghost" onPress={() => void Linking.openURL(PRIVACY_URL)} />
        <Button label="Terms" size="sm" variant="ghost" onPress={() => void Linking.openURL(TERMS_URL)} />
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  content: { gap: 16, paddingTop: 40, paddingBottom: 32 },
  head: { alignItems: "center", gap: 10, paddingBottom: 8 },
  center: { textAlign: "center" },
  notice: { padding: 12 },
  invited: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    minHeight: 48,
    paddingHorizontal: 12,
    borderRadius: radius.card,
    borderWidth: 1,
    borderColor: color["accent-quiet"],
    backgroundColor: color["surface-raised"],
  },
  block: { gap: 12, padding: 16 },
  or: { flexDirection: "row", alignItems: "center", gap: 12 },
  legal: { flexDirection: "row", justifyContent: "center", gap: 8 },
  flex: { flex: 1 },
});
