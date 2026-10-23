import { useEffect, useMemo, useRef, useState } from "react";
import { ActivityIndicator, KeyboardAvoidingView, ScrollView, StyleSheet, View } from "react-native";
import { router, useLocalSearchParams } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { ExternalLink, Send } from "lucide-react-native";
import { formatQty } from "@/lib/format";
import { txExplorerUrl } from "@/lib/solana/address";
import {
  looksLikeAddress,
  sendablesFrom,
  signingFailure,
  type BuiltTransfer,
  type TransferStatus,
} from "@/lib/wallet/flows";
import { Button, OptionMenu } from "~/components/ui/controls";
import { Eyebrow } from "~/components/ui/layout";
import { Text } from "~/components/ui/Text";
import { TextField } from "~/components/ui/TextField";
import { Notice, openExternal, outcomeHaptic, SheetHeader } from "~/components/wallet/parts";
import { ScanButton } from "~/components/wallet/ScanAddress";
import { api, ApiError, postForOutcome } from "~/lib/api";
import { refetchActivity } from "~/lib/stores/activity";
import { refetchWallet, useWalletDashboard } from "~/lib/stores/wallet";
import { SigningError, useSigners } from "~/lib/wallet/signer";
import { fontFamily } from "~/theme/fonts";
import { color, radius } from "~/theme/tokens";

/* ---------------------------------------------------------------------------
   Sending tokens to an address — and, under the name people look for,
   withdrawing. The website's TransferDialog, with its whole flow and its
   server contract:

     1. BUILD   /api/transfer/build — the server re-reads the holding, checks
                the recipient, sizes the amount from chain (Max is a flag the
                server resolves, never the rounded figure on screen), and
                names the one address that may sign.
     2. CONFIRM what actually moves — the server's summary, the recipient IN
                FULL (the middle of an address is where a wrong one differs),
                and the network fee on a max send. Nothing is signed before
                this screen.
     3. SIGN    in the wallet that holds the `signer` address. Never sends.
     4. SUBMIT  /api/transfer/submit — broadcasts, and waits briefly for
                confirmation. Still unresolved, it answers "pending", and
                this screen keeps watching: /api/transfer/status every three
                seconds with the transaction's lastValidBlockHeight, which is
                how "not yet" becomes "expired, nothing was sent" rather than
                a spinner with no end. After ninety seconds without an answer
                it says so, and points at the explorer.

   The dangerous field is the address, not the amount: a transfer to the
   wrong address is gone. It is checked as it is typed, refused when it is
   your own, and shown back whole before anything is signed.
--------------------------------------------------------------------------- */

const POLL_MS = 3_000;
const GIVE_UP_AFTER_MS = 90_000;

interface Pending {
  signature: string;
  signedTransaction: string;
  lastValidBlockHeight: number | null;
}

type Outcome =
  | { kind: "confirmed"; signature: string }
  | { kind: "failed"; signature: string | null; error: string }
  | { kind: "expired"; signature: string | null; error: string };

export default function TransferScreen() {
  const params = useLocalSearchParams<{ intent?: string }>();
  /* One flow, two names: "withdraw" changes the wording and nothing else. */
  const intent = params.intent === "withdraw" ? "withdraw" : "transfer";
  const title = intent === "withdraw" ? "Withdraw" : "Transfer";

  const wallet = useWalletDashboard();
  const { signerFor } = useSigners();
  const insets = useSafeAreaInsets();
  const address = wallet.address;

  const [mint, setMint] = useState("SOL");
  const [amount, setAmount] = useState("");
  const [sendMax, setSendMax] = useState(false);
  const [recipient, setRecipient] = useState("");

  const [built, setBuilt] = useState<BuiltTransfer | null>(null);
  const [building, setBuilding] = useState(false);
  const [working, setWorking] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState<Pending | null>(null);
  const [timedOut, setTimedOut] = useState(false);
  const [outcome, setOutcome] = useState<Outcome | null>(null);

  const sendables = useMemo(() => sendablesFrom(wallet.snapshot), [wallet.snapshot]);
  const selected = sendables.find((entry) => entry.mint === mint) ?? null;
  const trimmed = recipient.trim();
  const own = address !== null && trimmed === address;

  /* The haptic for each ending, once. */
  const ended = useRef<Outcome | null>(null);
  useEffect(() => {
    if (outcome === null || ended.current === outcome) return;
    ended.current = outcome;
    outcomeHaptic(outcome.kind === "confirmed" ? "success" : outcome.kind === "expired" ? "warning" : "error");
    if (outcome.kind === "confirmed") {
      /* The balance and the list on screen are now from before the send. */
      void refetchWallet();
      void refetchActivity();
    }
  }, [outcome]);

  /* Watches a pending broadcast until the chain answers. Keyed on the
     transfer alone, so nothing else re-rendering restarts the clock. */
  useEffect(() => {
    if (pending === null) return;
    let cancelled = false;
    let handle: ReturnType<typeof setTimeout> | null = null;
    const startedAt = Date.now();

    const tick = async () => {
      if (cancelled) return;
      try {
        const answer = await postForOutcome<TransferStatus>("/api/transfer/status", {
          signature: pending.signature,
          signedTransaction: pending.signedTransaction,
          lastValidBlockHeight: pending.lastValidBlockHeight,
        });
        if (cancelled) return;
        const status = answer.body;
        if (status.status === "confirmed") {
          setPending(null);
          setOutcome({ kind: "confirmed", signature: pending.signature });
          return;
        }
        if (status.status === "failed") {
          setPending(null);
          setOutcome({
            kind: status.expired === true ? "expired" : "failed",
            signature: pending.signature,
            error: status.error ?? "The transfer did not confirm.",
          });
          return;
        }
      } catch {
        /* A failed check while watching is not the transfer failing — keep
           watching within the budget. */
      }
      if (cancelled) return;
      if (Date.now() - startedAt >= GIVE_UP_AFTER_MS) {
        setTimedOut(true);
        outcomeHaptic("warning");
        return;
      }
      handle = setTimeout(() => void tick(), POLL_MS);
    };

    handle = setTimeout(() => void tick(), POLL_MS);
    return () => {
      cancelled = true;
      if (handle !== null) clearTimeout(handle);
    };
  }, [pending]);

  const review = async () => {
    setError(null);
    if (own) {
      setError("That is your own address — nothing would move.");
      return;
    }
    setBuilding(true);
    try {
      const payload = await api.post<BuiltTransfer>(
        "/api/transfer/build",
        sendMax ? { to: trimmed, mint, max: true } : { to: trimmed, mint, amount: amount.trim() },
      );
      setBuilt(payload);
    } catch (failure) {
      setError(failure instanceof ApiError ? failure.message : "The server could not be reached.");
    } finally {
      setBuilding(false);
    }
  };

  const confirm = async () => {
    if (built === null) return;
    setError(null);
    setWorking(true);
    try {
      const unsigned = built.unsignedTransaction;
      if (typeof unsigned !== "string" || typeof built.signer !== "string") {
        setError("There is nothing to sign.");
        return;
      }
      /* Only the wallet holding the address the server built for may sign. */
      const signer = signerFor(built.signer);
      const signed = await signer.signTransaction(unsigned);

      const answer = await postForOutcome<TransferStatus>("/api/transfer/submit", { signedTransaction: signed });
      const result = answer.body;
      if (result.status === "confirmed" && typeof result.signature === "string") {
        setOutcome({ kind: "confirmed", signature: result.signature });
        return;
      }
      if (result.status === "pending" && typeof result.signature === "string") {
        /* Broadcast, not yet confirmed — genuinely neither success nor
           failure yet, so it is watched rather than reported. */
        setTimedOut(false);
        setPending({ signature: result.signature, signedTransaction: signed, lastValidBlockHeight: built.lastValidBlockHeight ?? null });
        return;
      }
      setOutcome({
        kind: result.expired === true ? "expired" : "failed",
        signature: result.signature ?? null,
        error: result.error ?? "The transfer was not accepted.",
      });
    } catch (failure) {
      if (failure instanceof SigningError && failure.cancelled) setError("Cancelled — nothing was signed or sent.");
      else setError(signingFailure(failure, "The transfer could not be completed."));
    } finally {
      setWorking(false);
    }
  };

  const canReview =
    (sendMax || amount.trim().length > 0) && looksLikeAddress(trimmed) && !own && address !== null && !building;

  /* ---- what is on screen ---- */

  let body: React.ReactNode;
  let footer: React.ReactNode;

  if (outcome !== null) {
    body = (
      <View style={styles.stack}>
        {outcome.kind === "confirmed" ? (
          <Notice tone="positive">
            Sent {built?.amount} {built?.symbol}. Confirmed on Solana.
          </Notice>
        ) : outcome.kind === "expired" ? (
          <Notice tone="caution">{outcome.error}</Notice>
        ) : (
          <Notice tone="negative">{outcome.error}</Notice>
        )}
        {outcome.signature !== null && <ExplorerLink signature={outcome.signature} />}
      </View>
    );
    footer = <Button label="Done" variant="accent" onPress={() => close()} />;
  } else if (pending !== null) {
    body = (
      <View style={styles.stack}>
        <Notice
          tone={timedOut ? "caution" : "neutral"}
          icon={timedOut ? undefined : <ActivityIndicator size="small" color={color["text-secondary"]} />}
        >
          {timedOut ? "Status unknown — still not confirmed after 90 seconds." : "Broadcast — waiting for the network to confirm it."}
        </Notice>
        <Text variant="label" tone="muted">
          {timedOut
            ? "It may still land, or it may have expired unconfirmed. Check the explorer with this signature before assuming either way."
            : "This can take a few seconds on a busy network. Keep this open until it resolves."}
        </Text>
        <ExplorerLink signature={pending.signature} />
      </View>
    );
    footer = <Button label="Close" onPress={() => close()} />;
  } else if (built !== null) {
    body = (
      <View style={styles.stack}>
        <Text variant="body" accessibilityRole="header">
          {built.summary}
        </Text>
        {/* In full, and breakable. A truncated address on a confirm screen
            hides the characters a wrong one differs by. */}
        <View style={styles.box}>
          <Eyebrow>To</Eyebrow>
          <Text variant="mono-addr" selectable style={styles.gapTop}>
            {built.to}
          </Text>
        </View>
        {typeof built.networkFee === "string" ? (
          <Text variant="label" tone="muted">
            This empties the wallet — {built.networkFee} SOL of the balance pays the network fee, and nothing is left behind.
          </Text>
        ) : (
          <Text variant="label" tone="muted">
            The network fee is paid in SOL from this wallet, on top of the amount sent.
          </Text>
        )}
        <Notice tone="negative">Check the address. A transfer cannot be reversed or recalled.</Notice>
        {error !== null && <Notice tone="negative">{error}</Notice>}
      </View>
    );
    footer = (
      <>
        <View style={styles.flex}>
          <Button label="Back" onPress={() => setBuilt(null)} disabled={working} />
        </View>
        <View style={styles.flex}>
          <Button
            label={working ? "Sending" : `Confirm ${title.toLowerCase()}`}
            variant="accent"
            loading={working}
            onPress={() => void confirm()}
          />
        </View>
      </>
    );
  } else {
    body = (
      <View style={styles.stack}>
        <View style={styles.box}>
          <View style={styles.amountRow}>
            {/* Under Max this says "Everything", not a figure: for SOL the
                server subtracts the fee, so the balance shown here is not
                the number about to leave. The confirm step shows that one. */}
            <View style={styles.flex}>
              <TextField
                label="Amount"
                value={sendMax ? "Everything" : amount}
                editable={!sendMax}
                onChangeText={(next) => {
                  setSendMax(false);
                  setAmount(next.replace(",", "."));
                }}
                placeholder="0.00"
                keyboardType="decimal-pad"
                style={styles.amountInput}
              />
            </View>
            <View style={styles.amountSide}>
              <OptionMenu
                label="Token to send"
                value={mint}
                choices={sendables.map((entry) => ({ value: entry.mint, label: entry.label }))}
                onChange={(next) => {
                  setMint(next);
                  setSendMax(false);
                  setAmount("");
                }}
              />
            </View>
          </View>
          <View style={styles.balanceRow}>
            <Text variant="label" tone="muted" style={styles.flex}>
              {selected === null
                ? wallet.isLoading
                  ? "Reading balances…"
                  : "No balance to send"
                : `Balance ${formatQty(selected.amount, 6)} ${selected.label}`}
            </Text>
            {sendMax ? (
              <Button
                label={mint === "SOL" ? "Max · less the fee" : "Max · whole balance"}
                size="sm"
                variant="ghost"
                onPress={() => {
                  setSendMax(false);
                  setAmount("");
                }}
                accessibilityLabel="Max is on. Turn it off to type an amount"
              />
            ) : (
              <Button
                label="Max"
                size="sm"
                disabled={selected === null || selected.amount <= 0}
                onPress={() => {
                  setSendMax(true);
                  setAmount("");
                }}
              />
            )}
          </View>
        </View>

        {selected !== null && !selected.verified && (
          <Text variant="label" tone="muted">
            Nothing has vouched for this token. Check the mint before sending it.
          </Text>
        )}

        <View style={styles.recipientHead}>
          <View style={styles.flex}>
            <Eyebrow>{intent === "withdraw" ? "Destination address" : "Recipient address"}</Eyebrow>
          </View>
          <ScanButton onAddress={setRecipient} />
        </View>
        <TextField
          label={intent === "withdraw" ? "Destination address" : "Recipient address"}
          value={recipient}
          onChangeText={setRecipient}
          placeholder="Paste or scan a Solana address"
          autoCapitalize="none"
          autoCorrect={false}
          spellCheck={false}
          style={styles.mono}
          error={
            own
              ? "That is your own address — nothing would move."
              : trimmed.length > 0 && !looksLikeAddress(trimmed)
                ? "That does not look like a Solana address."
                : null
          }
        />

        {address === null && (
          <Text variant="label" tone="muted">
            Connect a Solana wallet to send.
          </Text>
        )}
        {error !== null && <Notice tone="negative">{error}</Notice>}
      </View>
    );
    footer = (
      <>
        <View style={styles.flex}>
          <Button label="Cancel" onPress={() => close()} />
        </View>
        <View style={styles.flex}>
          <Button
            label={building ? "Checking" : "Review"}
            variant="accent"
            loading={building}
            disabled={!canReview}
            onPress={() => void review()}
          />
        </View>
      </>
    );
  }

  return (
    <KeyboardAvoidingView behavior="height" style={styles.screen}>
      <SheetHeader title={title} icon={Send} closeLabel={`Close ${title.toLowerCase()}`} />
      <ScrollView contentContainerStyle={styles.body} keyboardShouldPersistTaps="handled">
        {body}
      </ScrollView>
      <View style={[styles.footer, { paddingBottom: insets.bottom + 12 }]}>{footer}</View>
    </KeyboardAvoidingView>
  );
}

function ExplorerLink({ signature }: { signature: string }) {
  return (
    <Button
      label="View on explorer"
      variant="ghost"
      size="sm"
      icon={<ExternalLink size={14} strokeWidth={1.5} color={color["text-secondary"]} />}
      onPress={() => openExternal(txExplorerUrl(signature))}
    />
  );
}

function close() {
  if (router.canGoBack()) router.back();
  else router.replace("/");
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: color["surface-base"] },
  body: { padding: 20 },
  stack: { gap: 14 },
  flex: { flex: 1 },
  gapTop: { marginTop: 6 },
  box: {
    borderWidth: 1,
    borderColor: color["border-subtle"],
    borderRadius: radius.card,
    backgroundColor: color["surface-raised"],
    padding: 12,
    gap: 8,
  },
  amountRow: { flexDirection: "row", alignItems: "flex-end", gap: 8 },
  amountInput: { fontSize: 20 },
  amountSide: { paddingBottom: 6 },
  balanceRow: { flexDirection: "row", alignItems: "center", gap: 8 },
  recipientHead: { flexDirection: "row", alignItems: "center", gap: 8, marginTop: 4 },
  mono: { fontFamily: fontFamily("mono", 400) },
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
