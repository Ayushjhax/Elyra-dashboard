import { useState } from "react";
import { StyleSheet, View } from "react-native";
import { Search } from "lucide-react-native";
import { truncateMiddle } from "@/lib/format";
import type { FoundAccount, PredictionAccountResponse } from "@/lib/prediction/api";
import { usdShort } from "~/components/research/prediction/format";
import { Card, Loading, Problem, styles as shared } from "~/components/research/parts";
import { Button } from "~/components/ui/controls";
import { Text } from "~/components/ui/Text";
import { TextField } from "~/components/ui/TextField";
import { useCopy } from "~/components/wallet/parts";
import { detectAccount, linkAccount, previewAccount, unlinkAccount, usePredictionAccount } from "~/lib/stores/prediction";
import { color, radius } from "~/theme/tokens";

/* ---------------------------------------------------------------------------
   Linking a Polymarket account — the website's PolymarketCard.

   An ADDRESS, read-only: never a key, a seed or a signature. Polymarket
   holds positions in a contract wallet, not the wallet that controls it, so
   there are three ways to name it, and only one links by itself:

     Find my account   derives where this wallet's account could live and
                       checks each; exactly one holding something is linked,
                       several are handed back to choose from.
     Connected wallet  checks the signed-in EVM wallet and SHOWS what is
                       there; linking it is a second, separate press.
     An address        the same check for one typed in.

   Every address is read live before it is saved, so a typo shows an empty
   preview instead of becoming a wrong link. One saved with nothing at it is
   marked unverified, because "a new account" and "a typo" look alike and
   only the person can tell them apart.
--------------------------------------------------------------------------- */

const EVM = /^0x[0-9a-fA-F]{40}$/;

function Preview({ found, onLink, linking }: { found: FoundAccount; onLink: () => void; linking: boolean }) {
  return (
    <View style={styles.preview}>
      <Text variant="mono-addr" tone="secondary">
        {truncateMiddle(found.address, 6, 4)}
      </Text>
      <Text variant="body-sm">
        {found.positionCount === 0 && found.activityCount === 0
          ? "Nothing found at this address — no positions and no activity."
          : `${found.positionCount} position${found.positionCount === 1 ? "" : "s"} · ${usdShort(found.valueUsd)} · ${found.activityCount} recent trade${found.activityCount === 1 ? "" : "s"}`}
      </Text>
      {found.sample.map((entry) => (
        <Text key={`${entry.market}-${entry.outcome}`} variant="label" tone="muted" numberOfLines={1}>
          {entry.outcome} · {entry.market} · {usdShort(entry.valueUsd)}
        </Text>
      ))}
      <Button label={linking ? "Linking…" : "This is my account — link it"} size="sm" variant="accent" loading={linking} disabled={linking} onPress={onLink} />
    </View>
  );
}

function Linked({ state }: { state: PredictionAccountResponse & { address: string } }) {
  const copy = useCopy();
  const [unlinking, setUnlinking] = useState(false);
  const [error, setError] = useState<string | null>(null);
  return (
    <View style={styles.body}>
      <View style={styles.address}>
        <Text variant="mono-addr" style={shared.flex} numberOfLines={1}>
          {truncateMiddle(state.address, 6, 4)}
        </Text>
        <Button label="Copy" size="sm" variant="ghost" accessibilityLabel="Copy the Polymarket address" onPress={() => void copy(state.address, "Polymarket address")} />
      </View>
      {state.verifiedAt === null && (
        <Text variant="label" tone="caution">
          Nothing was found at this address when it was linked. That is normal for a new account; if you expected positions, check the address.
        </Text>
      )}
      <View style={shared.row}>
        <Text variant="label" tone="muted" style={shared.flex}>
          Read-only — Elyra reads this address&apos;s public positions and never trades.
        </Text>
        <Button
          label={unlinking ? "Unlinking…" : "Unlink"}
          size="sm"
          variant="ghost"
          disabled={unlinking}
          onPress={async () => {
            setUnlinking(true);
            const result = await unlinkAccount();
            setError(result.ok ? null : result.error);
            setUnlinking(false);
          }}
        />
      </View>
      {error !== null && <Problem>{error}</Problem>}
    </View>
  );
}

export function PolymarketLink() {
  const feed = usePredictionAccount();
  const [address, setAddress] = useState("");
  const [busy, setBusy] = useState<"find" | "check" | "link" | null>(null);
  const [found, setFound] = useState<FoundAccount | null>(null);
  const [candidates, setCandidates] = useState<FoundAccount[]>([]);
  const [note, setNote] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const state = feed.data;

  const reset = () => {
    setFound(null);
    setCandidates([]);
    setNote(null);
    setError(null);
  };
  const find = async () => {
    reset();
    setBusy("find");
    const result = await detectAccount();
    if (!result.ok) setError(result.error);
    else if (result.data.candidates && result.data.candidates.length > 1) {
      setCandidates(result.data.candidates);
      setNote(result.data.reason ?? null);
    } else if (result.data.detected !== true) setNote(result.data.reason ?? "No Polymarket account was found for your wallet.");
    setBusy(null);
  };
  const check = async (value: string) => {
    reset();
    if (!EVM.test(value.trim())) {
      setError("That is not a wallet address. It should start 0x and be 42 characters.");
      return;
    }
    setBusy("check");
    const result = await previewAccount(value.trim().toLowerCase());
    if (result.ok) setFound(result.found);
    else setError(result.error);
    setBusy(null);
  };
  const link = async (value: string) => {
    setBusy("link");
    setError(null);
    const result = await linkAccount(value);
    if (result.ok) {
      reset();
      setAddress("");
    } else setError(result.error);
    setBusy(null);
  };

  return (
    <Card>
      <View style={shared.row}>
        <Text variant="h2" style={shared.flex}>
          Polymarket account
        </Text>
        <Text variant="label" tone={state?.connected ? (state.verifiedAt ? "positive" : "caution") : "muted"}>
          {state === null ? "Checking" : state.connected ? (state.verifiedAt ? "Linked" : "Unverified") : "Not linked"}
        </Text>
      </View>
      {feed.loading && <Loading>Checking for a linked account…</Loading>}
      {feed.error !== null && state === null && <Problem retry={feed.refetch}>Could not check whether an account is linked. {feed.error}</Problem>}
      {state !== null && state.connected && state.address !== null && <Linked state={{ ...state, address: state.address }} />}
      {state !== null && !state.connected && (
        <View style={styles.body}>
          <Text variant="body-sm" tone="secondary">
            Link the address that holds your Polymarket positions to see them beside the rest of your capital. An address only — Elyra never asks for keys and cannot trade.
          </Text>
          <Button
            label={busy === "find" ? "Searching your wallet…" : "Find my account"}
            loading={busy === "find"}
            disabled={busy !== null}
            icon={<Search size={15} strokeWidth={1.5} color={color["text-primary"]} />}
            onPress={() => void find()}
          />
          {candidates.map((candidate) => (
            <Preview key={candidate.address} found={candidate} linking={busy === "link"} onLink={() => void link(candidate.address)} />
          ))}
          {state.suggestion !== null && EVM.test(state.suggestion) ? (
            <View style={shared.row}>
              <Text variant="label" tone="secondary" style={shared.flex}>
                Your connected wallet · {truncateMiddle(state.suggestion, 6, 4)}
              </Text>
              <Button label="Check it" size="sm" variant="ghost" disabled={busy !== null} onPress={() => void check(state.suggestion as string)} />
            </View>
          ) : (
            <Text variant="label" tone="muted">
              This account has no EVM wallet, so enter the address that holds your positions.
            </Text>
          )}
          <TextField label="Or enter an address" value={address} onChangeText={setAddress} placeholder="0x…" autoCapitalize="none" autoCorrect={false} />
          <Button label={busy === "check" ? "Checking…" : "Check address"} size="sm" loading={busy === "check"} disabled={busy !== null || address.trim().length === 0} onPress={() => void check(address)} />
          {found !== null && <Preview found={found} linking={busy === "link"} onLink={() => void link(found.address)} />}
          {note !== null && (
            <Text variant="label" tone="secondary">
              {note}
            </Text>
          )}
        </View>
      )}
      {error !== null && <Problem>{error}</Problem>}
    </Card>
  );
}

const styles = StyleSheet.create({
  body: { gap: 10 },
  address: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    paddingLeft: 12,
    borderRadius: radius.card,
    borderWidth: 1,
    borderColor: color["border-subtle"],
    backgroundColor: color["surface-base"],
  },
  preview: { gap: 4, padding: 10, borderRadius: radius.card, borderWidth: 1, borderColor: color["border-strong"] },
});
