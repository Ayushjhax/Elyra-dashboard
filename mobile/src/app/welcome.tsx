import { useState, type ComponentProps, type ReactNode } from "react";
import { ActivityIndicator, Image, Linking, Platform, Pressable, StyleSheet, Text as NativeText, TextInput, View, useWindowDimensions } from "react-native";
import { KeyboardAwareScrollView } from "react-native-keyboard-controller";
import { SafeAreaView } from "react-native-safe-area-context";
import Svg, { Path } from "react-native-svg";
import { Buffer } from "buffer";
import { useLoginWithEmail, useLoginWithOAuth, useLoginWithSiws } from "@privy-io/expo";
import { useLoginWithPasskey, useSignupWithPasskey } from "@privy-io/expo/passkey";
import { ArrowRight, Fingerprint, Gift, ShieldCheck, Wallet } from "lucide-react-native";
import { Emblem, Glow } from "~/components/ui/brand";
import { Divider, Panel } from "~/components/ui/layout";
import { Text } from "~/components/ui/Text";
import { useElyraAuth } from "~/lib/auth/AuthProvider";
import { PRIVACY_URL, TERMS_URL } from "~/lib/legal";
import { useHeldReferral } from "~/lib/referral";
import { APP_IDENTITY, signatureFrom, withWallet } from "~/lib/wallet/mwa";
import { DISPLAY_SERIF, fontFamily } from "~/theme/fonts";
import { TOUCH_TARGET, color, palette, radius } from "~/theme/tokens";

/* ---------------------------------------------------------------------------
   Sign in.

   Email (a code), Google, a passkey, or the phone's own Solana wallet —
   Seed Vault on a Seeker, Phantom, Solflare — through Mobile Wallet Adapter
   and Sign-In with Solana. A wallet sign-in links that wallet to the
   account, and it is the wallet the account signs with. Anyone who signs in
   another way gets an embedded Solana wallet, as on the website.

   Errors are said plainly, beside the control that raised them, and the
   person can try again; a declined wallet prompt is "Cancelled", not a
   failure. One sign-in runs at a time: every control waits while one is in
   flight, so a second tap cannot start a second flow.

   A passkey is only a way in once one exists. When signing in with one finds
   none on this phone, the screen offers to create one — a new account, as
   Privy's passkey sign-up always is — and tells someone who already has an
   account to add a passkey to it from the dashboard instead.

   The look is a deliberate deviation (README, "Deliberate deviations"): the
   gold emblem over a faint olive glow and two hairline arcs, and a serif
   headline. Both are drawn here and nowhere else in the app — every other
   screen stays flat and Fustat. The colours are still the brand's tokens.
--------------------------------------------------------------------------- */

const DOMAIN = new URL(APP_IDENTITY.uri).host;

type Flow = "email" | "code" | "google" | "passkey" | "passkey-signup" | "wallet";

/** Where a flow's error is said: beside the control that started it. */
const ERROR_AT: Record<Flow, "email" | "alternatives" | "passkey"> = {
  email: "email",
  code: "email",
  google: "alternatives",
  wallet: "alternatives",
  passkey: "passkey",
  "passkey-signup": "passkey",
};

const EMAIL = /^\S+@\S+\.\S+$/;

function message(error: unknown, fallback: string): string {
  const text = error instanceof Error ? error.message : "";
  if (/reject|declin|cancel|denied|closed/i.test(text)) return "Cancelled — you were not signed in.";
  return text.length > 0 ? text : fallback;
}

export default function SignIn() {
  const auth = useElyraAuth();
  const invitedBy = useHeldReferral();
  const { width } = useWindowDimensions();
  const [email, setEmail] = useState("");
  const [code, setCode] = useState("");
  const [error, setError] = useState<{ at: (typeof ERROR_AT)[Flow]; text: string } | null>(null);
  const [busy, setBusy] = useState<Flow | null>(null);
  const [offerPasskeySignup, setOfferPasskeySignup] = useState(false);

  const emailLogin = useLoginWithEmail();
  const oauth = useLoginWithOAuth();
  const passkey = useLoginWithPasskey();
  const passkeySignup = useSignupWithPasskey();
  const siws = useLoginWithSiws();

  const awaitingCode = emailLogin.state.status === "awaiting-code-input" || emailLogin.state.status === "submitting-code";
  const locked = busy !== null;

  /* Editing the field answers its error, so the message goes with it. */
  const edit = (set: (value: string) => void) => (value: string) => {
    set(value);
    if (error?.at === "email") setError(null);
  };

  const run = async (kind: Flow, fallback: string, work: () => Promise<unknown>) => {
    if (busy !== null) return;
    setError(null);
    auth.clearEndedReason();
    setBusy(kind);
    try {
      await work();
    } catch (failure) {
      setError({ at: ERROR_AT[kind], text: message(failure, fallback) });
    } finally {
      setBusy(null);
    }
  };

  /* Checked on press rather than by disabling the button, so the one primary
     action always looks like one; a malformed address is said under the field. */
  const sendCode = () => {
    if (!EMAIL.test(email.trim())) {
      setError({ at: "email", text: "Enter an email address like you@example.com." });
      return;
    }
    void run("email", "The code was not sent. Try again.", () => emailLogin.sendCode({ email: email.trim() }));
  };

  const submitCode = () => {
    if (code.trim().length < 6) {
      setError({ at: "email", text: "Enter the 6-digit code from the email." });
      return;
    }
    void run("code", "That code did not work.", () => emailLogin.loginWithCode({ code: code.trim(), email }));
  };

  const connectWallet = () =>
    run("wallet", "Sign-in did not complete. Try again.", async () => {
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

  const signInWithPasskey = () =>
    run("passkey", "No Elyra passkey was used on this phone.", async () => {
      try {
        await passkey.loginWithPasskey({ relyingParty: APP_IDENTITY.uri });
      } catch {
        /* Android says only that none was chosen — none saved for
           getelyra.xyz looks the same as a dismissed sheet. */
        setOfferPasskeySignup(true);
        throw new Error("No Elyra passkey was used on this phone.");
      }
    });

  /* The headline scales with the phone: 44 at 360dp, 50 at 412dp, capped at 52. */
  const headline = Math.min(52, Math.max(38, Math.round(width * 0.122)));
  const emblem = width < 380 ? 84 : 100;

  return (
    <SafeAreaView edges={["top", "left", "right", "bottom"]} style={styles.screen}>
      <KeyboardAwareScrollView
        bottomOffset={96}
        keyboardShouldPersistTaps="handled"
        contentContainerStyle={styles.content}
        showsVerticalScrollIndicator={false}
      >
        <Atmosphere width={width} />
        <View style={styles.brand}>
          <View style={{ width: emblem * 2.2, height: emblem * 1.5, alignItems: "center", justifyContent: "center" }}>
            <Glow size={emblem * 2.2} />
            <Emblem size={emblem} />
          </View>
          <Text variant="display" accessibilityRole="header">
            Elyra
          </Text>
        </View>

        <View style={styles.intro}>
          <NativeText
            accessibilityRole="header"
            maxFontSizeMultiplier={1.2}
            style={[styles.headline, { fontSize: headline, lineHeight: Math.round(headline * 1.04) }]}
          >
            {"Your capital.\nClearer."}
          </NativeText>
          <Text variant="body" tone="muted" style={styles.lede}>
            Research, track, and trade in one place.
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

        {/* Why the last session ended, or why sign-in is unavailable in this build. */}
        {auth.endedReason !== null && (
          <Panel style={styles.notice}>
            <Text variant="body-sm" tone="caution" accessibilityLiveRegion="polite">
              {auth.endedReason}
            </Text>
          </Panel>
        )}

        {auth.available && (
          <>
            <View style={styles.form}>
              {awaitingCode ? (
                <>
                  <Field
                    label={`Code sent to ${email}`}
                    value={code}
                    onChangeText={edit(setCode)}
                    keyboardType="number-pad"
                    textContentType="oneTimeCode"
                    autoComplete="one-time-code"
                    autoFocus
                    maxLength={6}
                    returnKeyType="go"
                    onSubmitEditing={submitCode}
                    editable={!locked}
                  />
                  <PrimaryButton label="Sign in" loading={busy === "code"} disabled={locked} onPress={submitCode} />
                </>
              ) : (
                <>
                  <Field
                    label="Email address"
                    value={email}
                    onChangeText={edit(setEmail)}
                    placeholder="you@example.com"
                    keyboardType="email-address"
                    autoCapitalize="none"
                    autoCorrect={false}
                    autoComplete="email"
                    textContentType="emailAddress"
                    returnKeyType="go"
                    onSubmitEditing={sendCode}
                    editable={!locked}
                  />
                  <PrimaryButton
                    label="Continue with email"
                    loading={busy === "email"}
                    disabled={locked}
                    onPress={sendCode}
                  />
                </>
              )}
              {error?.at === "email" && <ErrorLine>{error.text}</ErrorLine>}
            </View>

            <View style={styles.or}>
              <Divider style={styles.flex} />
              <Text variant="body-sm" tone="muted">
                or continue with
              </Text>
              <Divider style={styles.flex} />
            </View>

            <View style={styles.alternatives}>
              <SecondaryButton
                label="Continue with Google"
                icon={<Image source={require("../../assets/images/google-g.png")} style={styles.googleMark} accessible={false} />}
                loading={busy === "google"}
                disabled={locked}
                onPress={() => void run("google", "Google sign-in did not complete.", () => oauth.login({ provider: "google" }))}
              />
              {Platform.OS === "android" && (
                <SecondaryButton
                  label="Connect Solana wallet"
                  icon={<Wallet size={20} strokeWidth={1.5} color={color["text-primary"]} />}
                  loading={busy === "wallet"}
                  disabled={locked}
                  onPress={() => void connectWallet()}
                />
              )}
              {error?.at === "alternatives" && <ErrorLine>{error.text}</ErrorLine>}

              <Pressable
                onPress={() => void signInWithPasskey()}
                disabled={locked}
                accessibilityRole="button"
                accessibilityLabel="Use a passkey"
                accessibilityState={{ disabled: locked, busy: busy === "passkey" }}
                style={({ pressed }) => [styles.passkey, { opacity: locked && busy !== "passkey" ? 0.5 : pressed ? 0.7 : 1 }]}
              >
                {busy === "passkey" ? (
                  <ActivityIndicator size="small" color={color["text-secondary"]} />
                ) : (
                  <Fingerprint size={22} strokeWidth={1.5} color={color["text-primary"]} />
                )}
                <Text variant="body" style={styles.buttonText} maxFontSizeMultiplier={1.4}>
                  Use a passkey
                </Text>
              </Pressable>
              {error?.at === "passkey" && <ErrorLine>{error.text}</ErrorLine>}

              {offerPasskeySignup && (
                <Panel style={styles.offer}>
                  <Text variant="body-sm">New to Elyra? Create an account that signs in with a passkey on this phone.</Text>
                  <SecondaryButton
                    label="Create a passkey"
                    icon={<Fingerprint size={20} strokeWidth={1.5} color={color["text-primary"]} />}
                    loading={busy === "passkey-signup"}
                    disabled={locked}
                    onPress={() =>
                      void run("passkey-signup", "The passkey was not created.", () =>
                        passkeySignup.signupWithPasskey({ relyingParty: APP_IDENTITY.uri }),
                      )
                    }
                  />
                  <Text variant="body-sm" tone="secondary">
                    Already have an account? Sign in another way, then add a passkey in Account → Dashboard.
                  </Text>
                </Panel>
              )}
            </View>
          </>
        )}

        <View style={styles.footer}>
          <ShieldCheck size={26} strokeWidth={1.5} color={color["border-accent"]} />
          <NativeText maxFontSizeMultiplier={1.3} style={styles.promise}>
            Your keys. Your control.
          </NativeText>
          <Text variant="body-sm" tone="muted" style={styles.center}>
            Elyra never holds your keys. Not financial advice.
          </Text>
          <View style={styles.legal}>
            <LegalLink label="Privacy" url={PRIVACY_URL} />
            <View style={styles.legalRule} />
            <LegalLink label="Terms" url={TERMS_URL} />
          </View>
        </View>
      </KeyboardAwareScrollView>
    </SafeAreaView>
  );
}

/** A labelled field: the label is visible and is also what a screen reader reads. */
function Field({ label, ...props }: { label: string } & ComponentProps<typeof TextInput>) {
  const [focused, setFocused] = useState(false);
  return (
    <View style={styles.field}>
      <Text variant="body-sm" tone="secondary">
        {label}
      </Text>
      <TextInput
        {...props}
        accessibilityLabel={label}
        placeholderTextColor={color["text-muted"]}
        selectionColor={color.accent}
        cursorColor={color.accent}
        onFocus={(event) => {
          setFocused(true);
          props.onFocus?.(event);
        }}
        onBlur={(event) => {
          setFocused(false);
          props.onBlur?.(event);
        }}
        style={[styles.input, focused && styles.inputFocused]}
      />
    </View>
  );
}

function PrimaryButton({ label, loading, disabled, onPress }: { label: string; loading: boolean; disabled: boolean; onPress: () => void }) {
  return (
    <Pressable
      onPress={onPress}
      disabled={disabled}
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ disabled, busy: loading }}
      style={({ pressed }) => [
        styles.control,
        styles.primary,
        disabled && !loading ? styles.primaryDisabled : pressed ? styles.primaryPressed : null,
      ]}
    >
      <View style={styles.trailingSpacer} />
      <Text variant="body" tone={disabled && !loading ? "muted" : "on-accent"} style={[styles.buttonText, styles.flexCenter]} maxFontSizeMultiplier={1.4}>
        {label}
      </Text>
      <View style={styles.trailing}>
        {loading ? (
          <ActivityIndicator size="small" color={color["text-on-accent"]} />
        ) : (
          <ArrowRight size={22} strokeWidth={1.5} color={disabled ? color["text-muted"] : color["text-on-accent"]} />
        )}
      </View>
    </Pressable>
  );
}

function SecondaryButton({
  label,
  icon,
  loading,
  disabled,
  onPress,
}: {
  label: string;
  icon: ReactNode;
  loading: boolean;
  disabled: boolean;
  onPress: () => void;
}) {
  return (
    <Pressable
      onPress={onPress}
      disabled={disabled}
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ disabled, busy: loading }}
      android_ripple={{ color: color["surface-hover"] }}
      style={({ pressed }) => [
        styles.control,
        styles.secondary,
        pressed && styles.secondaryPressed,
        disabled && !loading && styles.dimmed,
      ]}
    >
      {loading ? <ActivityIndicator size="small" color={color["text-secondary"]} /> : icon}
      <Text variant="body" style={styles.buttonText} numberOfLines={1} maxFontSizeMultiplier={1.4}>
        {label}
      </Text>
    </Pressable>
  );
}

function ErrorLine({ children }: { children: ReactNode }) {
  return (
    <Text variant="body-sm" tone="negative" accessibilityLiveRegion="polite">
      {children}
    </Text>
  );
}

function LegalLink({ label, url }: { label: string; url: string }) {
  return (
    <Pressable
      onPress={() => void Linking.openURL(url)}
      accessibilityRole="link"
      accessibilityLabel={label}
      style={({ pressed }) => [styles.legalLink, { opacity: pressed ? 0.7 : 1 }]}
    >
      <Text variant="body-sm" tone="secondary">
        {label}
      </Text>
    </Pressable>
  );
}

/**
 * Two faint gold hairlines in the top corners, scrolling with the brand area
 * so they never cross the headline or the form. Decoration only: it never
 * takes a tap.
 */
function Atmosphere({ width }: { width: number }) {
  const height = 200;
  return (
    <View pointerEvents="none" style={[styles.atmosphere, { width, height }]}>
      <Svg width={width} height={height}>
        <Path d={`M ${width * 0.36} 0 C ${width * 0.3} ${height * 0.4}, ${width * 0.14} ${height * 0.62}, 0 ${height * 0.74}`} stroke={palette.olive} strokeOpacity={0.24} strokeWidth={1} fill="none" />
        <Path d={`M ${width} ${height * 0.46} C ${width * 0.9} ${height * 0.5}, ${width * 0.8} ${height * 0.64}, ${width * 0.74} ${height * 0.98}`} stroke={palette.olive} strokeOpacity={0.2} strokeWidth={1} fill="none" />
      </Svg>
    </View>
  );
}

const CONTROL_HEIGHT = 56;

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: color["surface-base"] },
  /* Offsets are from the content's border box, so 0 is the screen's edge. */
  atmosphere: { position: "absolute", top: 0, left: 0 },
  content: { flexGrow: 1, paddingHorizontal: 24, paddingTop: 8, paddingBottom: 24, gap: 24 },
  brand: { alignItems: "center", gap: 2 },
  intro: { gap: 10 },
  headline: { fontFamily: DISPLAY_SERIF, color: color["text-primary"], letterSpacing: -0.5 },
  lede: { fontSize: 16, lineHeight: 22 },
  invited: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    minHeight: TOUCH_TARGET,
    paddingHorizontal: 12,
    borderRadius: radius.card,
    borderWidth: 1,
    borderColor: color["accent-quiet"],
    backgroundColor: color["surface-raised"],
  },
  notice: { padding: 12 },
  form: { gap: 16 },
  field: { gap: 8 },
  input: {
    minHeight: CONTROL_HEIGHT,
    paddingHorizontal: 16,
    borderRadius: radius.sheet,
    borderWidth: 1,
    borderColor: color["border-strong"],
    backgroundColor: color["surface-panel"],
    color: color["text-primary"],
    fontFamily: fontFamily("sans", 400),
    /* 16, as every field on a touch screen is (CLAUDE.md). */
    fontSize: 16,
  },
  inputFocused: { borderColor: color["focus-ring"] },
  control: {
    minHeight: CONTROL_HEIGHT,
    borderRadius: radius.sheet,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 12,
    paddingHorizontal: 16,
    overflow: "hidden",
  },
  primary: { backgroundColor: color["accent-hover"] },
  primaryPressed: { backgroundColor: color.accent },
  primaryDisabled: { backgroundColor: color["surface-raised"] },
  secondary: { borderWidth: 1, borderColor: color["border-strong"], backgroundColor: color["surface-panel"] },
  secondaryPressed: { backgroundColor: color["surface-hover"] },
  dimmed: { opacity: 0.5 },
  buttonText: { fontFamily: fontFamily("sans", 500), fontSize: 16, lineHeight: 22 },
  flexCenter: { flex: 1, textAlign: "center" },
  trailing: { width: 24, alignItems: "flex-end" },
  trailingSpacer: { width: 24 },
  googleMark: { width: 22, height: 22 },
  or: { flexDirection: "row", alignItems: "center", gap: 14 },
  alternatives: { gap: 12 },
  passkey: { minHeight: TOUCH_TARGET, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 10, alignSelf: "center", paddingHorizontal: 16 },
  offer: { gap: 12, padding: 16 },
  footer: { marginTop: "auto", alignItems: "center", gap: 6, paddingTop: 8 },
  promise: { fontFamily: DISPLAY_SERIF, color: color["text-primary"], fontSize: 22, lineHeight: 28, textAlign: "center", marginTop: 4 },
  center: { textAlign: "center" },
  legal: { flexDirection: "row", alignItems: "center", gap: 8, marginTop: 8 },
  legalRule: { width: 1, height: 18, backgroundColor: color["border-strong"] },
  legalLink: { minHeight: TOUCH_TARGET, minWidth: TOUCH_TARGET, paddingHorizontal: 12, alignItems: "center", justifyContent: "center" },
  flex: { flex: 1 },
});
