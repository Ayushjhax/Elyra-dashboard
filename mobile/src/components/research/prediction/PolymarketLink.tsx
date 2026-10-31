import { useRef, useState } from "react";
import { Pressable, StyleSheet, View } from "react-native";
import { Copy, Link2Off, Search, TrendingUp } from "lucide-react-native";
import type { ConnectionStatus } from "@/lib/connections/state";
import { truncateMiddle } from "@/lib/format";
import type { FoundAccount, PredictionAccountResponse } from "@/lib/prediction/api";
import type { AccountFeed } from "~/lib/stores/createAccountStore";
import { LabeledInput, StatusBadge, VenueCard, VenueTile, styles as venue } from "~/components/connections/parts";
import { usdShort } from "~/components/research/prediction/format";
import { Loading, Problem } from "~/components/research/parts";
import { WideButton } from "~/components/shell/flow";
import { IconButton } from "~/components/ui/controls";
import { Text } from "~/components/ui/Text";
import { useCopy } from "~/components/wallet/parts";
import { detectAccount, linkAccount, previewAccount, unlinkAccount, usePredictionAccount } from "~/lib/stores/prediction";
import { fontFamily } from "~/theme/fonts";
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

   The project has no Polymarket artwork, so its mark is a plain tile, as on
   the website — never another venue's logo.
--------------------------------------------------------------------------- */

const EVM = /^0x[0-9a-fA-F]{40}$/;

function Preview({ found, onLink, linking }: { found: FoundAccount; onLink: () => void; linking: boolean }) {
  return (
    <View style={venue.preview} accessibilityLiveRegion="polite">
      <Text variant="body-sm" tone="secondary">
        Account found at
      </Text>
      <Text variant="body" style={styles.mono} accessibilityLabel={`Address ${found.address}`}>
        {truncateMiddle(found.address, 6, 4)}
      </Text>
      <Text variant="body" style={styles.summary}>
        {found.positionCount === 0 && found.activityCount === 0
          ? "Nothing found at this address — no positions and no activity."
          : `${found.positionCount} position${found.positionCount === 1 ? "" : "s"} · ${usdShort(found.valueUsd)} · ${found.activityCount} recent trade${found.activityCount === 1 ? "" : "s"}`}
      </Text>
      {found.sample.map((entry) => (
        <Text key={`${entry.market}-${entry.outcome}`} variant="body-sm" tone="secondary" numberOfLines={1}>
          {entry.outcome} · {entry.market} · {usdShort(entry.valueUsd)}
        </Text>
      ))}
      <WideButton label={linking ? "Linking…" : "This is my account — link it"} variant="accent" busy={linking} onPress={onLink} />
    </View>
  );
}

function Linked({ state }: { state: PredictionAccountResponse & { address: string } }) {
  const copy = useCopy();
  const [unlinking, setUnlinking] = useState(false);
  const [error, setError] = useState<string | null>(null);
  return (
    <View style={styles.body}>
      <View style={venue.address}>
        <View style={venue.flex}>
          <Text variant="body-sm" tone="secondary">
            Linked address
          </Text>
          <Text variant="body" style={styles.mono} numberOfLines={1} accessibilityLabel={`Linked address ${state.address}`}>
            {truncateMiddle(state.address, 6, 4)}
          </Text>
        </View>
        <IconButton accessibilityLabel="Copy the Polymarket address" onPress={() => void copy(state.address, "Polymarket address")}>
          <Copy size={20} strokeWidth={1.5} color={color["text-secondary"]} />
        </IconButton>
      </View>
      {state.verifiedAt === null && (
        <Text variant="body-sm" tone="caution">
          Nothing was found at this address when it was linked. That is normal for a new account; if you expected positions, check the address.
        </Text>
      )}
      <Text variant="body-sm" tone="secondary">
        Read-only — Elyra reads this address&apos;s public positions and never trades.
      </Text>
      <WideButton
        label={unlinking ? "Unlinking…" : "Unlink"}
        variant="outline"
        leading={Link2Off}
        busy={unlinking}
        onPress={async () => {
          setUnlinking(true);
          const result = await unlinkAccount();
          setError(result.ok ? null : result.error);
          setUnlinking(false);
        }}
      />
      {error !== null && <Problem>{error}</Problem>}
    </View>
  );
}

/** The account's link state comes from the shared store unless a reading is handed in. */
export function PolymarketLink({ feed: given }: { feed?: AccountFeed<PredictionAccountResponse> } = {}) {
  const store = usePredictionAccount();
  const feed = given ?? store;
  const [address, setAddress] = useState("");
  const [busy, setBusy] = useState<"find" | "check" | "link" | null>(null);
  const [found, setFound] = useState<FoundAccount | null>(null);
  const [candidates, setCandidates] = useState<FoundAccount[]>([]);
  const [note, setNote] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  /* An answer for an address that has since been changed is dropped. */
  const ticket = useRef(0);
  const state = feed.data;

  const reset = () => {
    setFound(null);
    setCandidates([]);
    setNote(null);
    setError(null);
  };
  const find = async () => {
    if (busy !== null) return;
    reset();
    const mine = ++ticket.current;
    setBusy("find");
    const result = await detectAccount();
    if (mine !== ticket.current) return;
    if (!result.ok) setError(result.error);
    else if (result.data.candidates && result.data.candidates.length > 1) {
      setCandidates(result.data.candidates);
      setNote(result.data.reason ?? null);
    } else if (result.data.detected !== true) setNote(result.data.reason ?? "No Polymarket account was found for your wallet.");
    setBusy(null);
  };
  const check = async (value: string) => {
    if (busy !== null) return;
    reset();
    if (!EVM.test(value.trim())) {
      setError("That is not a wallet address. It should start 0x and be 42 characters.");
      return;
    }
    const mine = ++ticket.current;
    setBusy("check");
    const result = await previewAccount(value.trim().toLowerCase());
    if (mine !== ticket.current) return;
    if (result.ok) setFound(result.found);
    else setError(result.error);
    setBusy(null);
  };
  const link = async (value: string) => {
    if (busy === "link") return;
    setBusy("link");
    setError(null);
    const result = await linkAccount(value);
    if (result.ok) {
      reset();
      setAddress("");
    } else setError(result.error);
    setBusy(null);
  };

  const status: { status: ConnectionStatus; label: string } =
    state === null
      ? feed.error !== null && !feed.loading
        ? { status: "attention", label: "Couldn't check" }
        : { status: "checking", label: "Checking" }
      : state.connected
        ? state.verifiedAt
          ? { status: "connected", label: "Linked" }
          : { status: "attention", label: "Unverified" }
        : { status: "not-connected", label: "Not linked" };
  const typed = address.trim();

  return (
    <VenueCard
      mark={<VenueTile icon={TrendingUp} />}
      title="Polymarket"
      subtitle="Bring your positions into Elyra. Address access only — no keys or trading."
      status={<StatusBadge status={status.status} label={status.label} />}
    >
      {feed.loading && <Loading>Checking for a linked account…</Loading>}
      {feed.error !== null && state === null && <Problem retry={feed.refetch}>Could not check whether an account is linked. {feed.error}</Problem>}
      {state !== null && state.connected && state.address !== null && <Linked state={{ ...state, address: state.address }} />}
      {state !== null && !state.connected && (
        <View style={styles.body}>
          <Pressable
            onPress={() => void find()}
            disabled={busy !== null}
            accessibilityRole="button"
            accessibilityLabel="Find my account"
            accessibilityHint="Looks for the Polymarket account your signed-in wallet controls"
            accessibilityState={{ busy: busy === "find", disabled: busy !== null }}
            style={({ pressed }) => [styles.find, pressed && styles.findPressed, busy !== null && busy !== "find" && styles.dim]}
          >
            <Search size={22} strokeWidth={1.75} color={color["accent-hover"]} />
            <Text variant="body" style={styles.findText}>
              {busy === "find" ? "Searching your wallet…" : "Find my account"}
            </Text>
          </Pressable>
          {candidates.map((candidate) => (
            <Preview key={candidate.address} found={candidate} linking={busy === "link"} onLink={() => void link(candidate.address)} />
          ))}
          {note !== null && (
            <Text variant="body-sm" tone="secondary" accessibilityLiveRegion="polite">
              {note}
            </Text>
          )}
          {state.suggestion !== null && EVM.test(state.suggestion) ? (
            <View style={venue.address}>
              <View style={venue.flex}>
                <Text variant="body-sm" tone="secondary">
                  Your connected wallet
                </Text>
                <Text variant="body" style={styles.mono}>
                  {truncateMiddle(state.suggestion, 6, 4)}
                </Text>
              </View>
              <Pressable
                onPress={() => void check(state.suggestion as string)}
                disabled={busy !== null}
                accessibilityRole="button"
                accessibilityLabel="Check your connected wallet"
                style={styles.inlineAction}
              >
                <Text variant="body" style={styles.inlineText}>
                  Check it
                </Text>
              </Pressable>
            </View>
          ) : (
            <Text variant="body" tone="secondary" style={styles.lead}>
              No EVM wallet is linked. Enter the address holding your positions.
            </Text>
          )}
          <LabeledInput
            label="or enter an address"
            value={address}
            onChangeText={(next) => {
              ticket.current += 1;
              setAddress(next);
              setFound(null);
              setError(null);
              if (busy === "check") setBusy(null);
            }}
            onSubmitEditing={() => void check(address)}
            returnKeyType="search"
            placeholder="0x…"
            error={typed.length >= 42 && !EVM.test(typed) ? "An address starts 0x and is 42 characters long." : null}
          />
          <WideButton
            label={busy === "check" ? "Checking…" : "Check address"}
            variant={EVM.test(typed) ? "accent" : "outline"}
            busy={busy === "check"}
            disabled={busy !== null || typed.length === 0}
            onPress={() => void check(address)}
          />
          {found !== null && <Preview found={found} linking={busy === "link"} onLink={() => void link(found.address)} />}
        </View>
      )}
      {error !== null && <Problem>{error}</Problem>}
    </VenueCard>
  );
}

const styles = StyleSheet.create({
  body: { gap: 16 },
  lead: { fontSize: 16, lineHeight: 23 },
  mono: { fontFamily: fontFamily("sans", 500), fontSize: 16, lineHeight: 22, letterSpacing: 0.3 },
  summary: { fontFamily: fontFamily("sans", 500), fontSize: 16, lineHeight: 22 },
  find: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 12,
    minHeight: 56,
    borderRadius: radius.panel,
    borderWidth: 1,
    borderColor: color["accent-hover"],
  },
  findPressed: { backgroundColor: color["surface-hover"] },
  findText: { fontFamily: fontFamily("sans", 500), fontSize: 17, lineHeight: 22 },
  dim: { opacity: 0.5 },
  inlineAction: { minHeight: 48, justifyContent: "center", paddingHorizontal: 14 },
  inlineText: { color: color["accent-hover"], fontFamily: fontFamily("sans", 500), fontSize: 16 },
});
