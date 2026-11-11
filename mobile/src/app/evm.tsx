import { useMemo, useRef, useState } from "react";
import { ActivityIndicator, KeyboardAvoidingView, ScrollView, StyleSheet, View } from "react-native";
import { router, useLocalSearchParams } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { ArrowLeftRight, ExternalLink, Send } from "lucide-react-native";
import { EVM_CHAINS, evmScopeId, isEvmAddress, type EvmChainKey } from "@/lib/evm/chains";
import { swapTokens } from "@/lib/evm/swap";
import type { BuiltEvmStep } from "@/lib/evm/wire";
import { formatQty, formatUsd } from "@/lib/format";
import { runEvmTx, type EvmTxRun } from "@/lib/wallet/runEvmTx";
import { Button, OptionMenu } from "~/components/ui/controls";
import { Eyebrow } from "~/components/ui/layout";
import { Text } from "~/components/ui/Text";
import { TextField } from "~/components/ui/TextField";
import { Notice, openExternal, outcomeHaptic, SheetHeader } from "~/components/wallet/parts";
import { api, ApiError } from "~/lib/api";
import { refetchActivity } from "~/lib/stores/activity";
import { refreshPortfolio, usePortfolio } from "~/lib/stores/portfolio";
import { apiFetch, useEvmSigner } from "~/lib/wallet/evmSigner";
import { fontFamily } from "~/theme/fonts";
import { color, radius } from "~/theme/tokens";

/* ---------------------------------------------------------------------------
   Sending and swapping on Ethereum and Robinhood Chain — the website's
   EvmSendDialog and EvmSwapDialog, as one screen: `?action=send|swap` and
   `?chain=ethereum|robinhood`.

   The website's rules, kept. The server builds every transaction for the
   session's own address and seals it; the embedded EVM wallet signs it here;
   the server checks the signer and every field against the build before it
   broadcasts (lib/evm/tx.ts), and nothing says "sent" until the chain says
   so (lib/wallet/runEvmTx.ts, shared with the website). The recipient is
   shown back IN FULL before signing — Privy's embedded wallet signs without
   a prompt of its own, so this confirm step is the prompt.

   Stock tokens are sendable, never swappable (lib/evm/swap.ts).
--------------------------------------------------------------------------- */

interface BuiltSend extends BuiltEvmStep {
  to: string;
  amount: string;
  symbol: string;
  verified: boolean;
  toIsContract: boolean;
}

interface BuiltSwap extends BuiltEvmStep {
  step: "approve" | "swap";
  quote: {
    sellSymbol: string;
    buySymbol: string;
    sellAmount: string;
    buyAmount: string;
    buyAmountMin: string;
    slippagePct: number;
    route: string;
    routeFeeUsd: number | null;
  };
}

function message(error: unknown, fallback: string): string {
  return error instanceof ApiError || error instanceof Error ? error.message : fallback;
}

export default function EvmScreen() {
  const params = useLocalSearchParams<{ action?: string; chain?: string; asset?: string; from?: string; amount?: string }>();
  const chain: EvmChainKey = params.chain === "robinhood" ? "robinhood" : "ethereum";
  const action = params.action === "swap" ? "swap" : "send";
  const network = EVM_CHAINS[chain].name;
  const signer = useEvmSigner();
  const insets = useSafeAreaInsets();
  const title = action === "send" ? `Send on ${EVM_CHAINS[chain].shortName}` : `Swap on ${EVM_CHAINS[chain].shortName}`;

  return (
    <KeyboardAvoidingView behavior="height" style={styles.screen}>
      <SheetHeader title={title} icon={action === "send" ? Send : ArrowLeftRight} closeLabel={`Close ${action}`} />
      {signer.address === null ? (
        <View style={styles.body}>
          <Text variant="body-sm" tone="secondary">
            Your EVM wallet on this account is a linked external wallet. Elyra signs only with its own embedded wallet, so{" "}
            {action} on {network} from that wallet&apos;s own app.
          </Text>
        </View>
      ) : action === "send" ? (
        <SendFlow chain={chain} initialAsset={params.asset ?? "native"} bottom={insets.bottom} />
      ) : (
        <SwapFlow chain={chain} initialFrom={params.from ?? "ETH"} initialAmount={params.amount ?? ""} bottom={insets.bottom} />
      )}
    </KeyboardAvoidingView>
  );
}

/* ---- shared ---- */

function close() {
  if (router.canGoBack()) router.back();
  else router.replace("/");
}

function useOutcome() {
  const [pending, setPending] = useState<string | null | undefined>(undefined);
  const [run, setRun] = useState<EvmTxRun | null>(null);
  const finish = (result: EvmTxRun) => {
    setPending(undefined);
    setRun(result);
    outcomeHaptic(result.ok ? "success" : result.unresolved === true ? "warning" : "error");
    if (result.ok) {
      void refreshPortfolio();
      void refetchActivity();
    }
  };
  return { pending, setPending, run, finish };
}

function OutcomeView({ run, pending, done }: { run: EvmTxRun | null; pending: string | null | undefined; done: string }) {
  if (run !== null && (run.ok || run.hash !== undefined)) {
    return (
      <View style={styles.stack}>
        <Notice tone={run.ok ? "positive" : run.unresolved === true ? "caution" : "negative"}>{run.ok ? done : run.error}</Notice>
        {run.href ? <ExplorerButton href={run.href} /> : null}
      </View>
    );
  }
  if (pending !== undefined) {
    return (
      <View style={styles.stack}>
        <Notice tone="neutral" icon={<ActivityIndicator size="small" color={color["text-secondary"]} />}>
          Broadcast — waiting for the network to confirm it.
        </Notice>
        <Text variant="label" tone="muted">
          Ethereum blocks come every twelve seconds and a busy network can take longer. Keep this open until it resolves.
        </Text>
        {pending !== null && <ExplorerButton href={pending} />}
      </View>
    );
  }
  return null;
}

function ExplorerButton({ href }: { href: string }) {
  return (
    <Button
      label="View on explorer"
      variant="ghost"
      size="sm"
      icon={<ExternalLink size={14} strokeWidth={1.5} color={color["text-secondary"]} />}
      onPress={() => openExternal(href)}
    />
  );
}

function Footer({ bottom, children }: { bottom: number; children: React.ReactNode }) {
  return <View style={[styles.footer, { paddingBottom: bottom + 12 }]}>{children}</View>;
}

/* ---- send ---- */

function SendFlow({ chain, initialAsset, bottom }: { chain: EvmChainKey; initialAsset: string; bottom: number }) {
  const network = EVM_CHAINS[chain].name;
  const signer = useEvmSigner();
  const feed = usePortfolio();
  const [asset, setAsset] = useState(initialAsset);
  const [amount, setAmount] = useState("");
  const [sendMax, setSendMax] = useState(false);
  const [recipient, setRecipient] = useState("");
  const [built, setBuilt] = useState<BuiltSend | null>(null);
  const [busy, setBusy] = useState<"building" | "sending" | null>(null);
  const [error, setError] = useState<string | null>(null);
  const outcome = useOutcome();
  const abort = useRef<AbortController | null>(null);

  const options = useMemo(() => {
    if (feed.snapshot === null || signer.address === null) return [{ value: "native", label: "ETH", quantity: 0, verified: true }];
    const scope = evmScopeId(chain, signer.address);
    const rows = feed.snapshot.spot
      .filter((holding) => holding.scopeId === scope && holding.quantity > 0)
      .map((holding) => ({ value: holding.address ?? "native", label: holding.symbol, quantity: holding.quantity, verified: holding.verified }));
    return rows.some((row) => row.value === "native") ? rows : [{ value: "native", label: "ETH", quantity: 0, verified: true }, ...rows];
  }, [feed.snapshot, signer.address, chain]);
  const selected = options.find((option) => option.value.toLowerCase() === asset.toLowerCase()) ?? null;
  const trimmed = recipient.trim();

  const review = async () => {
    setError(null);
    setBusy("building");
    try {
      setBuilt(await api.post<BuiltSend>("/api/evm/transfer/build", { chain, asset, to: trimmed, ...(sendMax ? { max: true } : { amount }) }));
    } catch (caught: unknown) {
      setError(message(caught, "That send could not be prepared."));
    } finally {
      setBusy(null);
    }
  };

  const confirm = async () => {
    if (built === null) return;
    setError(null);
    setBusy("sending");
    abort.current = new AbortController();
    const result = await runEvmTx(apiFetch, (tx) => signer.sign(tx), built, {
      onBroadcast: (_hash, href) => outcome.setPending(href),
      signal: abort.current.signal,
    });
    setBusy(null);
    if (!result.ok && result.hash === undefined) {
      outcome.setPending(undefined);
      setError(result.error);
      return;
    }
    outcome.finish(result);
  };

  const finished = outcome.run !== null || outcome.pending !== undefined;
  const canReview = busy === null && isEvmAddress(trimmed) && (sendMax || amount.trim().length > 0);

  return (
    <>
      <ScrollView contentContainerStyle={styles.body} keyboardShouldPersistTaps="handled">
        {finished ? (
          <OutcomeView run={outcome.run} pending={outcome.pending} done={`Sent ${built?.amount ?? ""} ${built?.symbol ?? ""} on ${network}.`} />
        ) : built !== null ? (
          <View style={styles.stack}>
            <Text variant="body" accessibilityRole="header">
              {built.summary}
            </Text>
            {/* In full, and breakable: the middle of an address is where a wrong one differs. */}
            <View style={styles.box}>
              <Eyebrow>To</Eyebrow>
              <Text variant="mono-addr" selectable style={styles.gapTop}>
                {built.to}
              </Text>
            </View>
            {built.toIsContract && (
              <Notice tone="caution">
                {`This address is a contract, not a personal wallet. Send only if it is set up to receive ${built.symbol} on ${network}.`}
              </Notice>
            )}
            {!built.verified && (
              <Text variant="label" tone="muted">
                {built.symbol} is not on Elyra&apos;s verified list. Check the token before sending it.
              </Text>
            )}
            <Text variant="label" tone="muted">
              Network fee: up to {built.networkFeeMax} ETH, paid on {network}.
            </Text>
            <Notice tone="negative">
              {`Check the address and the network. A send cannot be reversed, and funds sent on ${network} arrive only on ${network}.`}
            </Notice>
            {error !== null && <Notice tone="negative">{error}</Notice>}
          </View>
        ) : (
          <View style={styles.stack}>
            <View style={styles.box}>
              <View style={styles.amountRow}>
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
                    value={selected?.value ?? asset}
                    choices={options.map((option) => ({ value: option.value, label: option.label }))}
                    onChange={(next) => {
                      setAsset(next);
                      setSendMax(false);
                      setAmount("");
                    }}
                  />
                </View>
              </View>
              <View style={styles.balanceRow}>
                <Text variant="label" tone="muted" style={styles.flex}>
                  {selected === null ? "No balance to send" : `Balance ${formatQty(selected.quantity, 6)} ${selected.label} on ${network}`}
                </Text>
                <Button
                  label={sendMax ? (asset === "native" ? "Max · less the fee" : "Max · whole balance") : "Max"}
                  size="sm"
                  variant={sendMax ? "ghost" : undefined}
                  disabled={selected === null || selected.quantity <= 0}
                  onPress={() => {
                    setSendMax(!sendMax);
                    setAmount("");
                  }}
                />
              </View>
            </View>
            {selected !== null && !selected.verified && (
              <Text variant="label" tone="muted">
                Nothing has vouched for this token. Check the contract before sending it.
              </Text>
            )}
            <Eyebrow>Recipient address</Eyebrow>
            <TextField
              label="Recipient address"
              value={recipient}
              onChangeText={setRecipient}
              placeholder="0x…"
              autoCapitalize="none"
              autoCorrect={false}
              spellCheck={false}
              style={styles.mono}
              error={trimmed.length > 0 && !isEvmAddress(trimmed) ? "That does not look like an EVM address (0x and 40 hex characters)." : null}
            />
            {error !== null && <Notice tone="negative">{error}</Notice>}
          </View>
        )}
      </ScrollView>
      <Footer bottom={bottom}>
        {finished ? (
          <View style={styles.flex}>
            <Button label={outcome.run?.ok === true ? "Done" : "Close"} onPress={() => close()} />
          </View>
        ) : (
          <>
            <View style={styles.flex}>
              <Button label={built !== null ? "Back" : "Cancel"} disabled={busy !== null} onPress={() => (built !== null ? setBuilt(null) : close())} />
            </View>
            <View style={styles.flex}>
              {built !== null ? (
                <Button label={busy === "sending" ? "Sending" : "Confirm send"} variant="accent" loading={busy === "sending"} onPress={() => void confirm()} />
              ) : (
                <Button label={busy === "building" ? "Checking" : "Review"} variant="accent" loading={busy === "building"} disabled={!canReview} onPress={() => void review()} />
              )}
            </View>
          </>
        )}
      </Footer>
    </>
  );
}

/* ---- swap ---- */

function SwapFlow({ chain, initialFrom, initialAmount, bottom }: { chain: EvmChainKey; initialFrom: string; initialAmount: string; bottom: number }) {
  const network = EVM_CHAINS[chain].name;
  const signer = useEvmSigner();
  const tokens = useMemo(() => swapTokens(chain), [chain]);
  const start = tokens.find((token) => token.symbol.toUpperCase() === initialFrom.toUpperCase())?.symbol ?? "ETH";
  const [from, setFrom] = useState(start);
  const [to, setTo] = useState(tokens.find((token) => token.symbol !== start && /^USD/.test(token.symbol))?.symbol ?? "ETH");
  const [amount, setAmount] = useState(initialAmount);
  const [built, setBuilt] = useState<BuiltSwap | null>(null);
  const [approved, setApproved] = useState(false);
  const [busy, setBusy] = useState<"quoting" | "signing" | null>(null);
  const [error, setError] = useState<string | null>(null);
  const outcome = useOutcome();
  const abort = useRef<AbortController | null>(null);

  const quote = () => api.post<BuiltSwap>("/api/evm/swap/build", { chain, fromSymbol: from, toSymbol: to, amount });

  const review = async () => {
    setError(null);
    setBusy("quoting");
    try {
      setBuilt(await quote());
    } catch (caught: unknown) {
      setError(message(caught, "That swap could not be quoted."));
    } finally {
      setBusy(null);
    }
  };

  const confirm = async () => {
    if (built === null) return;
    setError(null);
    setBusy("signing");
    abort.current = new AbortController();
    const result = await runEvmTx(apiFetch, (tx) => signer.sign(tx), built, {
      onBroadcast: (_hash, href) => outcome.setPending(href),
      signal: abort.current.signal,
    });
    if (!result.ok) {
      setBusy(null);
      if (result.hash === undefined) {
        outcome.setPending(undefined);
        setError(result.error);
      } else outcome.finish(result);
      return;
    }
    if (built.step === "approve") {
      /* Approved: the swap is quoted fresh now, not from the stale first quote. */
      outcome.setPending(undefined);
      setApproved(true);
      setBusy("quoting");
      try {
        setBuilt(await quote());
      } catch (caught: unknown) {
        setBuilt(null);
        setError(`The approval landed, but a fresh quote could not be fetched: ${message(caught, "try again")}`);
      } finally {
        setBusy(null);
      }
      return;
    }
    setBusy(null);
    outcome.finish(result);
  };

  const finished = outcome.run !== null || (outcome.pending !== undefined && built?.step === "swap");
  const choices = tokens.map((token) => ({ value: token.symbol, label: token.symbol }));

  return (
    <>
      <ScrollView contentContainerStyle={styles.body} keyboardShouldPersistTaps="handled">
        {finished ? (
          <OutcomeView
            run={outcome.run}
            pending={outcome.pending}
            done={`Swapped ${built?.quote.sellAmount ?? ""} ${built?.quote.sellSymbol ?? ""} for ${built?.quote.buySymbol ?? ""} on ${network}.`}
          />
        ) : built !== null ? (
          <View style={styles.stack}>
            {built.step === "approve" ? (
              <>
                <Text variant="body" accessibilityRole="header">
                  Step 1 of 2 — {built.summary}.
                </Text>
                <Text variant="label" tone="muted">
                  The swap router needs permission to move exactly {built.quote.sellAmount} {built.quote.sellSymbol}. Once that
                  confirms, Elyra fetches a fresh quote for the swap itself.
                </Text>
              </>
            ) : (
              <>
                {approved && (
                  <Text variant="label" tone="positive">
                    Approval confirmed. Step 2 of 2 — the swap.
                  </Text>
                )}
                <View style={styles.box}>
                  <Row label="You sell" value={`${built.quote.sellAmount} ${built.quote.sellSymbol}`} />
                  <Row label="You receive" value={`≈ ${built.quote.buyAmount} ${built.quote.buySymbol}`} />
                  <Row label="At least" value={`${built.quote.buyAmountMin} ${built.quote.buySymbol} (${built.quote.slippagePct}% slippage)`} />
                  <Row label="Route" value={`${built.quote.route} via LI.FI`} />
                  {built.quote.routeFeeUsd !== null && <Row label="Route fee" value={`${formatUsd(built.quote.routeFeeUsd)}, taken from the swap`} />}
                </View>
              </>
            )}
            <Text variant="label" tone="muted">
              Network fee: up to {built.networkFeeMax} ETH, paid on {network}.
            </Text>
            {outcome.pending !== undefined && (
              <Notice tone="neutral" icon={<ActivityIndicator size="small" color={color["text-secondary"]} />}>
                Waiting for the approval to confirm.
              </Notice>
            )}
            {error !== null && <Notice tone="negative">{error}</Notice>}
          </View>
        ) : (
          <View style={styles.stack}>
            <View style={styles.box}>
              <View style={styles.amountRow}>
                <View style={styles.flex}>
                  <TextField
                    label="Amount to sell"
                    value={amount}
                    onChangeText={(next) => setAmount(next.replace(",", "."))}
                    placeholder="0.00"
                    keyboardType="decimal-pad"
                    style={styles.amountInput}
                  />
                </View>
                <View style={styles.amountSide}>
                  <OptionMenu label="Token to sell" value={from} choices={choices} onChange={setFrom} />
                </View>
              </View>
            </View>
            <View style={[styles.box, styles.receiveRow]}>
              <Text variant="body-sm" tone="secondary" style={styles.flex}>
                Receive
              </Text>
              <OptionMenu label="Token to buy" value={to} choices={choices} onChange={setTo} />
            </View>
            {from === to && <Notice tone="negative">Choose two different tokens.</Notice>}
            <Text variant="label" tone="muted">
              Quoted by LI.FI, which charges its own fee; the quote shows it. Robinhood Stock Tokens are not swappable in Elyra —
              they are securities with sale restrictions Elyra cannot check.
            </Text>
            {error !== null && <Notice tone="negative">{error}</Notice>}
          </View>
        )}
      </ScrollView>
      <Footer bottom={bottom}>
        {finished ? (
          <View style={styles.flex}>
            <Button label={outcome.run?.ok === true ? "Done" : "Close"} onPress={() => close()} />
          </View>
        ) : (
          <>
            <View style={styles.flex}>
              <Button label={built !== null ? "Back" : "Cancel"} disabled={busy !== null} onPress={() => (built !== null ? setBuilt(null) : close())} />
            </View>
            <View style={styles.flex}>
              {built !== null ? (
                <Button
                  label={busy === "quoting" ? "Quoting" : busy === "signing" ? "Signing" : built.step === "approve" ? "Approve" : "Confirm swap"}
                  variant="accent"
                  loading={busy !== null}
                  onPress={() => void confirm()}
                />
              ) : (
                <Button
                  label={busy === "quoting" ? "Quoting" : "Review"}
                  variant="accent"
                  loading={busy === "quoting"}
                  disabled={busy !== null || from === to || amount.trim().length === 0}
                  onPress={() => void review()}
                />
              )}
            </View>
          </>
        )}
      </Footer>
    </>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.row}>
      <Text variant="label" tone="muted">
        {label}
      </Text>
      <Text variant="data-sm" style={styles.rowValue}>
        {value}
      </Text>
    </View>
  );
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
  receiveRow: { flexDirection: "row", alignItems: "center" },
  row: { flexDirection: "row", justifyContent: "space-between", alignItems: "baseline", gap: 12 },
  rowValue: { flexShrink: 1, textAlign: "right" },
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
