import { useEffect } from "react";
import { StyleSheet, View } from "react-native";
import { ClipboardCheck } from "lucide-react-native";
import { router } from "expo-router";
import { swapPrefill } from "@/lib/actions/prefill";
import type { PreparedAction } from "@/lib/personalized/types";
import { ReviewCard } from "~/components/actions/ReviewCards";
import { Text } from "~/components/ui/Text";
import { Button } from "~/components/ui/controls";
import { formatAnswerText } from "~/lib/personalized/format";
import { Field } from "~/components/wallet/parts";
import { useElyraAuth } from "~/lib/auth/AuthProvider";
import { refreshActions, useOpenActions } from "~/lib/stores/actions";
import { useSecond } from "~/lib/useClock";
import { color, radius } from "~/theme/tokens";

/* ---------------------------------------------------------------------------
   The review card under an answer that prepared an action.

   A ready action is stored on the server, so it is the same card the
   Actions tab shows, read from the same shared store: "Review and sign"
   opens Swap prefilled, and finishing it there clears it here too. One
   that is no longer open — signed, dismissed or expired — says so rather
   than offering a dead button.

   A preview that is not ready was never stored. It is shown with its reason
   and no button, because nothing can carry it out.
--------------------------------------------------------------------------- */

function Preview({ action }: { action: PreparedAction }) {
  const prefill = swapPrefill(action);
  return (
    <View
      accessibilityLabel={`Prepared action: ${action.summary}`}
      style={styles.card}
    >
      <View style={styles.head}>
        <ClipboardCheck
          size={14}
          strokeWidth={1.5}
          color={color["text-muted"]}
        />
        <Text variant="eyebrow" tone="muted">
          {prefill ? "Prepared action" : "Prepared · not ready"}
        </Text>
      </View>
      <Text variant="body">{action.summary}</Text>
      {action.fields.map((field) => (
        <Field key={field.label} label={field.label}>
          {formatAnswerText(field.value)}
        </Field>
      ))}
      {action.warnings.map((warning) => (
        <Text key={warning} variant="label" tone="negative">
          {formatAnswerText(warning)}
        </Text>
      ))}
      {prefill ? (
        <Button
          label="Review and sign"
          variant="accent"
          onPress={() =>
            router.push({
              pathname: "/swap",
              params: { ...prefill, personalized: "1" },
            })
          }
        />
      ) : (
        <Text variant="label" tone="secondary">
          {action.reason ??
            "This kind of action cannot be carried out in Elyra."}
        </Text>
      )}
    </View>
  );
}

export function InlineAction({
  action,
  id,
}: {
  action: PreparedAction;
  id: string | null;
}) {
  const feed = useOpenActions();
  const auth = useElyraAuth();
  const now = useSecond();

  /* The answer has just stored it; read it now rather than at the next poll. */
  useEffect(() => {
    if (id !== null) void refreshActions();
  }, [id]);

  if (id === null) return <Preview action={action} />;
  if (feed.error !== null)
    return (
      <View style={styles.card}>
        <Text tone="negative">{feed.error}</Text>
        <Button label="Reload action" onPress={() => void refreshActions()} />
      </View>
    );
  const open = feed.actions.find(
    (entry) => entry.id === id && Date.parse(entry.expiresAt) > now,
  );
  if (open !== undefined) {
    return (
      <ReviewCard
        entry={open}
        now={now}
        canSign={auth.solanaAddress !== null}
        onDismiss={() => void feed.dismiss(open.id)}
      />
    );
  }
  if (feed.loading || feed.refreshing) return null;
  return (
    <Text variant="label" tone="muted">
      {action.summary} — no longer open: it was finished, dismissed or has
      expired.
    </Text>
  );
}

const styles = StyleSheet.create({
  card: {
    gap: 4,
    padding: 12,
    borderRadius: radius.card,
    borderWidth: 1,
    borderColor: color["border-subtle"],
    backgroundColor: color["surface-raised"],
  },
  head: { flexDirection: "row", alignItems: "center", gap: 8 },
});
