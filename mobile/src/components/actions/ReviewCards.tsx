import { StyleSheet, View } from "react-native";
import { router } from "expo-router";
import { ClipboardCheck } from "lucide-react-native";
import { swapPrefill } from "@/lib/actions/prefill";
import type { OpenAction, PreparedActionSurface } from "@/lib/actions/types";
import { Button } from "~/components/ui/controls";
import { Text } from "~/components/ui/Text";
import { Field, Notice } from "~/components/wallet/parts";
import { useElyraAuth } from "~/lib/auth/AuthProvider";
import { useOpenActions } from "~/lib/stores/actions";
import { useSecond } from "~/lib/useClock";
import { color, radius } from "~/theme/tokens";
import { formatAnswerText } from "~/lib/personalized/format";

/* ---------------------------------------------------------------------------
   Actions awaiting review — the website's PendingActions, as cards.

   Each is a real prepared action, stored on the server: a swap Elyra
   prepared in an answer or on another surface. A ready swap opens the swap
   screen with the prepared amounts filled in; it re-quotes, the wallet
   signs, and only once the swap lands — signature in hand — is the action
   recorded as confirmed. Anything else says plainly what cannot be done
   here and why. Dismiss sets it aside on the server, so it does not come
   back on the next read or on the website.
--------------------------------------------------------------------------- */

/* Where it was prepared. The website's chat surface is the default branch:
   the app names no other messaging product. */
function origin(surface: PreparedActionSurface): string {
  switch (surface) {
    case "web":
      return "Prepared on the website";
    case "app":
      return "Prepared in the app";
    case "agent":
      return "Prepared by Elyra";
    default:
      return "Prepared in your linked chat";
  }
}

/** "4:05 left" — to the second, so a card never outlives its quote unseen. */
function countdown(expiresAt: string, now: number): string {
  const seconds = Math.max(0, Math.floor((Date.parse(expiresAt) - now) / 1000));
  const minutes = Math.floor(seconds / 60);
  return `Expires in ${minutes}:${String(seconds % 60).padStart(2, "0")}`;
}

export function ReviewCard({
  entry,
  now,
  canSign,
  onDismiss,
}: {
  entry: OpenAction;
  now: number;
  canSign: boolean;
  onDismiss: () => void;
}) {
  const { action } = entry;
  const acknowledged = entry.status === "acknowledged";
  const prefill = swapPrefill(action);

  return (
    <View accessibilityLabel={`Action awaiting review: ${action.summary}`} style={styles.card}>
      <View style={styles.head}>
        <ClipboardCheck size={14} strokeWidth={1.5} color={color["agent-accent"]} />
        <Text variant="eyebrow" tone="muted" style={styles.flex}>
          Action awaiting review
        </Text>
        <View style={[styles.chip, { backgroundColor: acknowledged ? color["surface-hover"] : color["negative-bg"] }]}>
          <Text variant="label" tone={acknowledged ? "secondary" : "negative"}>
            {acknowledged ? "Acknowledged" : "Needs review"}
          </Text>
        </View>
      </View>

      <Text variant="body" style={styles.summary}>
        {action.summary}
      </Text>
      <Text variant="label" tone="secondary" accessibilityLiveRegion="none">
        {origin(entry.surface)} · {countdown(entry.expiresAt, now)}
      </Text>

      {action.fields.length > 0 && (
        <View style={styles.fields}>
          {action.fields.map((field) => (
            <Field key={field.label} label={field.label}>
              {formatAnswerText(field.value)}
            </Field>
          ))}
        </View>
      )}

      {action.warnings.map((warning) => (
        <Text key={warning} variant="label" tone="negative">
          {formatAnswerText(warning)}
        </Text>
      ))}

      <Text variant="label" tone="secondary" style={styles.status}>
        {prefill !== null
          ? canSign
            ? "Nothing is sent until your wallet signs it. The swap is re-quoted first."
            : "This account has no Solana wallet to sign it with."
          : (action.reason ?? "This kind of action cannot be carried out in Elyra.")}
      </Text>

      <View style={styles.buttons}>
        <Button label="Dismiss" variant="ghost" size="sm" onPress={onDismiss} />
        {prefill !== null ? (
          <Button
            label="Review and sign"
            variant="accent"
            size="sm"
            disabled={!canSign}
            onPress={() =>
              router.push({ pathname: "/swap", params: { from: prefill.from, to: prefill.to, amount: prefill.amount, actionId: entry.id } })
            }
          />
        ) : action.kind === "transfer" || action.kind === "withdraw" ? (
          <Button label="Open transfer" size="sm" onPress={() => router.push("/transfer")} />
        ) : null}
      </View>
    </View>
  );
}

/** Every open action, newest first; nothing at all when there are none. */
export function ReviewCards() {
  const feed = useOpenActions();
  const auth = useElyraAuth();
  const now = useSecond();
  /* The clock lapses a card between polls rather than leaving a dead one up. */
  const actions = feed.actions.filter((entry) => Date.parse(entry.expiresAt) > now);
  if (actions.length === 0) return null;

  return (
    <View style={styles.list}>
      {feed.error !== null && <Notice tone="negative">{feed.error}</Notice>}
      {actions.map((entry) => (
        <ReviewCard
          key={entry.id}
          entry={entry}
          now={now}
          canSign={auth.solanaAddress !== null}
          onDismiss={() => void feed.dismiss(entry.id)}
        />
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  list: { gap: 8 },
  card: {
    borderWidth: 1,
    borderLeftWidth: 3,
    borderColor: color["border-subtle"],
    borderLeftColor: color["agent-rail"],
    borderRadius: radius.card,
    backgroundColor: color["surface-raised"],
    padding: 12,
    gap: 4,
  },
  head: { flexDirection: "row", alignItems: "center", gap: 8 },
  flex: { flex: 1 },
  chip: { borderRadius: radius.chip, paddingHorizontal: 6, paddingVertical: 1 },
  summary: { marginTop: 6 },
  fields: {
    marginTop: 6,
    borderTopWidth: StyleSheet.hairlineWidth * 2,
    borderBottomWidth: StyleSheet.hairlineWidth * 2,
    borderColor: color["border-subtle"],
  },
  status: { marginTop: 6 },
  buttons: { flexDirection: "row", justifyContent: "flex-end", gap: 8, marginTop: 6 },
});
