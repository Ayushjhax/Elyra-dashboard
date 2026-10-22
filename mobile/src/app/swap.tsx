import { useEffect, useRef, useState } from "react";
import { KeyboardAvoidingView, ScrollView, StyleSheet, View } from "react-native";
import { router, useLocalSearchParams } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { ArrowDown, ArrowLeftRight, ExternalLink } from "lucide-react-native";
import { formatAge } from "@/lib/format";
import { txExplorerUrl } from "@/lib/solana/address";
import { signingFailure, type SwapQuote, type SwapSubmitted, type TokenGroup } from "@/lib/wallet/flows";
import { Button, OptionMenu } from "~/components/ui/controls";
import { Eyebrow } from "~/components/ui/layout";
import { Text } from "~/components/ui/Text";
import { TextField } from "~/components/ui/TextField";
import { Field, Notice, openExternal, outcomeHaptic, SheetHeader } from "~/components/wallet/parts";
import { api, ApiError } from "~/lib/api";
import { useOpenActions } from "~/lib/stores/actions";
import { refetchActivity } from "~/lib/stores/activity";
import { refetchWallet, useWalletDashboard } from "~/lib/stores/wallet";
import { useSecond } from "~/lib/useClock";
import { SigningError, useSigners } from "~/lib/wallet/signer";
import { color, radius } from "~/theme/tokens";

/* ---------------------------------------------------------------------------
   The swap, end to end — the website's SwapDialog.

     1. QUOTE   /api/swap/build — the server asks Jupiter for an order built
                for this account's wallet and returns the unsigned bytes and
                the address that must sign them.
     2. SIGN    in the wallet holding that address. Sign-only: the bytes
                come back here, signed, and are not sent from the phone.
     3. SUBMIT  /api/swap/submit — the server hands the signed bytes to
                Jupiter's execute endpoint, unmodified.

   A quote goes stale in about twenty seconds, and a swap that executes at a
   price the person never saw is the failure to avoid. So nothing older than
   that is ever signed: pressing Confirm on a quote that has aged re-quotes
   first and shows the fresh numbers, and only a quote that is on screen and
   fresh is signed. (The website re-quotes inside the same press; here the
   embedded wallet has no screen of its own, so the fresh numbers are shown
   before the signature rather than behind it.)

   Opened from a review card it is prefilled with the prepared amounts, and
   every value stays editable; once the swap lands, the action is recorded
   as confirmed with its signature.
--------------------------------------------------------------------------- */

/** A quote older than this is re-quoted before it is signed. */
const FRESH_MS = 20_000;

export default function SwapScreen() {
  const params = useLocalSearchParams<{ from?: string; to?: string; amount?: string; actionId?: string }>();
  const wallet = useWalletDashboard();
  const actions = useOpenActions();
  const { signerFor } = useSigners();
  const insets = useSafeAreaInsets();
  const now = useSecond();

  const [groups, setGroups] = useState<TokenGroup[]>([]);
  const [fromSymbol, setFromSymbol] = useState(params.from ?? "SOL");
  const [toSymbol, setToSymbol] = useState(params.to ?? "USDC");
  const [amount, setAmount] = useState(params.amount ?? "");

  const [quote, setQuote] = useState<{ payload: SwapQuote; at: number } | null>(null);
  const [quoting, setQuoting] = useState(false);
  const [working, setWorking] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [signature, setSignature] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    api
      .get<{ groups?: TokenGroup[] }>("/api/swap/tokens", { auth: false })
      .then((payload) => {
        if (!cancelled) setGroups(payload.groups ?? []);
      })
      .catch(() => {
        /* The prefilled or default pair still works; only the picker is lost. */
      });
    return () => {
      cancelled = true;
    };
  }, []);

  /* Recorded once, whichever way the screen is left afterwards. */
  const recorded = useRef(false);

  const symbols = Array.from(new Set([...groups.flatMap((group) => group.symbols), fromSymbol, toSymbol]));
  const choices = symbols.map((symbol) => ({ value: symbol, label: symbol }));

  const build = async (): Promise<SwapQuote | null> => {
    try {
      return await api.post<SwapQuote>("/api/swap/build", { fromSymbol, toSymbol, amount: amount.trim() });
    } catch (failure) {
      setError(failure instanceof ApiError ? failure.message : "That could not be quoted.");
      return null;
    }
  };

  const requote = async () => {
    setError(null);
    setQuoting(true);
    const payload = await build();
    if (payload !== null) setQuote({ payload, at: Date.now() });
    setQuoting(false);
  };

  const ready = quote?.payload.action?.readiness === "ready";
  const fresh = quote !== null && now - quote.at < FRESH_MS;

  const sign = async () => {
    if (quote === null) return;
    /* An aged quote is never signed: re-quote, and let the person see the
       new numbers first. */
    if (Date.now() - quote.at >= FRESH_MS) {
      await requote();
      return;
    }
    setError(null);
    setWorking(true);
    try {
      const { unsignedTransaction, quoteRef, signer } = quote.payload;
      if (typeof unsignedTransaction !== "string" || unsignedTransaction.length === 0 || typeof quoteRef !== "string") {
        setError(quote.payload.action?.reason ?? "There is nothing to sign for that route.");
        return;
      }
      if (typeof signer !== "string") {
        setError("The server did not say which wallet must sign. Nothing was signed.");
        return;
      }
      const signed = await signerFor(signer).signTransaction(unsignedTransaction);
      const result = await api.post<SwapSubmitted>("/api/swap/submit", { signedTransaction: signed, quoteRef });
      if (typeof result.signature !== "string") {
        setError(result.error ?? "The swap did not land.");
        outcomeHaptic("error");
        return;
      }
      setSignature(result.signature);
      outcomeHaptic("success");
      void refetchWallet();
      void refetchActivity();
      if (params.actionId !== undefined && !recorded.current) {
        recorded.current = true;
        void actions.confirm(params.actionId, result.signature);
      }
    } catch (failure) {
      if (failure instanceof SigningError && failure.cancelled) {
        setError("Cancelled — nothing was signed or sent.");
      } else {
        setError(failure instanceof ApiError ? failure.message : signingFailure(failure, "The swap could not be completed."));
        outcomeHaptic("error");
      }
    } finally {
      setWorking(false);
    }
  };

  const edit = (apply: () => void) => {
    apply();
    setQuote(null);
    setError(null);
  };

  const canQuote = amount.trim().length > 0 && fromSymbol !== toSymbol && wallet.address !== null && !working;

  return (
    <KeyboardAvoidingView behavior="height" style={styles.screen}>
      <SheetHeader title="Swap" icon={ArrowLeftRight} closeLabel="Close swap" />
      <ScrollView contentContainerStyle={styles.body} keyboardShouldPersistTaps="handled">
        {signature !== null ? (
          <View style={styles.stack}>
            <Notice tone="positive">Swap landed.</Notice>
            {params.actionId !== undefined && actions.error !== null && <Notice tone="caution">{actions.error}</Notice>}
            <Button
              label="View on explorer"
              variant="ghost"
              size="sm"
              icon={<ExternalLink size={14} strokeWidth={1.5} color={color["text-secondary"]} />}
              onPress={() => openExternal(txExplorerUrl(signature))}
            />
          </View>
        ) : (
          <View style={styles.stack}>
            <View style={styles.box}>
              <View style={styles.pair}>
                <View style={styles.flex}>
                  <TextField
                    label="You pay"
                    value={amount}
                    onChangeText={(next) => edit(() => setAmount(next.replace(",", ".")))}
                    placeholder="0.00"
                    keyboardType="decimal-pad"
                    style={styles.amountInput}
                  />
                </View>
                <View style={styles.picker}>
                  <OptionMenu label="Token to sell" value={fromSymbol} choices={choices} onChange={(next) => edit(() => setFromSymbol(next))} />
                </View>
              </View>
              <View style={styles.arrow}>
                <ArrowDown size={16} strokeWidth={1.5} color={color["text-muted"]} />
              </View>
              <View style={styles.pair}>
                <Text variant="label" tone="secondary" style={styles.flex}>
                  You receive
                </Text>
                <OptionMenu label="Token to receive" value={toSymbol} choices={choices} onChange={(next) => edit(() => setToSymbol(next))} />
              </View>
            </View>

            {fromSymbol === toSymbol && (
              <Text variant="label" tone="negative">
                Choose two different tokens.
              </Text>
            )}

            {quote?.payload.action !== undefined && (
              <View style={styles.box}>
                <View style={styles.quoteHead}>
                  <Eyebrow>Quote</Eyebrow>
                  <Text variant="label" tone={fresh ? "muted" : "caution"}>
                    {fresh ? `Quoted ${formatAge(quote.at, now)}` : "Out of date — re-quoted before signing"}
                  </Text>
                </View>
                {quote.payload.action.fields.map((row) => (
                  <Field key={row.label} label={row.label}>
                    {row.value}
                  </Field>
                ))}
              </View>
            )}

            {(quote?.payload.action?.warnings ?? []).map((warning) => (
              <Notice key={warning} tone="neutral">
                {warning}
              </Notice>
            ))}

            {quote?.payload.action !== undefined && !ready && (
              <Notice tone="negative">Cannot be executed. {quote.payload.action.reason}</Notice>
            )}

            {quote !== null && ready && (
              <Text variant="label" tone="muted">
                Nothing is sent until your wallet signs it. Routed by Jupiter.
              </Text>
            )}

            {wallet.address === null && (
              <Text variant="label" tone="muted">
                Connect a Solana wallet to swap.
              </Text>
            )}
            {error !== null && <Notice tone="negative">{error}</Notice>}
          </View>
        )}
      </ScrollView>

      <View style={[styles.footer, { paddingBottom: insets.bottom + 12 }]}>
        <View style={styles.flex}>
          <Button label={signature === null ? "Cancel" : "Done"} variant={signature === null ? "quiet" : "accent"} onPress={() => (router.canGoBack() ? router.back() : router.replace("/"))} />
        </View>
        {signature === null && (
          <View style={styles.flex}>
            {ready ? (
              <Button
                label={working ? "Confirming" : quoting ? "Re-quoting" : fresh ? "Confirm swap" : "Re-quote"}
                variant="accent"
                loading={working || quoting}
                onPress={() => void sign()}
              />
            ) : (
              <Button
                label={quoting ? "Quoting" : "Get quote"}
                variant="accent"
                loading={quoting}
                disabled={!canQuote}
                onPress={() => void requote()}
              />
            )}
          </View>
        )}
      </View>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: color["surface-base"] },
  body: { padding: 20 },
  stack: { gap: 14 },
  flex: { flex: 1 },
  box: {
    borderWidth: 1,
    borderColor: color["border-subtle"],
    borderRadius: radius.card,
    backgroundColor: color["surface-raised"],
    padding: 12,
    gap: 4,
  },
  pair: { flexDirection: "row", alignItems: "flex-end", gap: 8 },
  picker: { paddingBottom: 6 },
  amountInput: { fontSize: 20 },
  arrow: { alignItems: "center", paddingVertical: 4 },
  quoteHead: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 8, paddingBottom: 2 },
  footer: {
    flexDirection: "row",
    gap: 8,
    paddingHorizontal: 20,
    paddingTop: 12,
    borderTopWidth: StyleSheet.hairlineWidth * 2,
    borderTopColor: color["border-subtle"],
    backgroundColor: color["surface-base"],
  },
});
