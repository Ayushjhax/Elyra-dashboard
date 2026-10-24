import { forwardRef, useImperativeHandle, useRef, useState } from "react";
import { StyleSheet, View } from "react-native";
import { describeRule, type AlertKind } from "@/lib/prediction/alertTypes";
import { Chips } from "~/components/research/parts";
import { RuleRow } from "~/components/research/prediction/Lists";
import { Button } from "~/components/ui/controls";
import { BottomSheet, type BottomSheetHandle } from "~/components/ui/overlays";
import { Text } from "~/components/ui/Text";
import { TextField } from "~/components/ui/TextField";
import { outcomeHaptic } from "~/components/wallet/parts";
import { createAlert, useMarketAlerts } from "~/lib/stores/prediction";
import { useMinute } from "~/lib/useClock";

/* ---------------------------------------------------------------------------
   Alerts on one prediction market, in a sheet.

   Three conditions a person can state plainly: an outcome's probability
   rises above a level, falls below one, or moves by a number of points; or
   the market resolves. The engine evaluates them on its delivery tick and a
   crossing arrives through the notifications engine — push and the inbox,
   as the person's notification settings allow. An alert tells; it never
   trades.

   Probabilities are entered in percent and stored as a 0–1 price, which is
   the unit the rule table keeps for price alerts; a move is in points.
--------------------------------------------------------------------------- */

type Condition = "price_above" | "price_below" | "probability_change" | "market_resolution";

export interface AlertSheetHandle {
  open: () => void;
}

export const AlertSheet = forwardRef<
  AlertSheetHandle,
  { marketId: string; question: string; outcomes: string[]; current: number | null }
>(function AlertSheet({ marketId, question, outcomes, current }, ref) {
  const sheet = useRef<BottomSheetHandle>(null);
  const now = useMinute();
  const { feed, rules } = useMarketAlerts(marketId);
  const [condition, setCondition] = useState<Condition>("price_above");
  const [outcome, setOutcome] = useState<string | null>(null);
  const [level, setLevel] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useImperativeHandle(ref, () => ({ open: () => sheet.current?.present() }));

  const chosen = outcome ?? outcomes[0] ?? null;
  const value = Number(level.replace(",", "."));
  const needsLevel = condition !== "market_resolution";
  const validLevel =
    !needsLevel ||
    (condition === "probability_change" ? Number.isFinite(value) && value > 0 && value <= 100 : Number.isFinite(value) && value > 0 && value < 100);
  const kind: AlertKind = condition;
  const threshold = !needsLevel ? null : condition === "probability_change" ? value : value / 100;

  const save = async () => {
    if (!validLevel || saving) return;
    setSaving(true);
    setError(null);
    const result = await createAlert({ market: marketId, outcome: chosen, kind, threshold });
    setSaving(false);
    if (result.ok) {
      setLevel("");
      outcomeHaptic("success");
    } else {
      setError(result.error);
      outcomeHaptic("error");
    }
  };

  return (
    <BottomSheet ref={sheet} title="Alerts on this market">
      <View style={styles.body}>
        <Text variant="body-sm" tone="secondary" numberOfLines={3}>
          {question}
        </Text>
        {feed.loading ? (
          <Text variant="label" tone="muted">
            Reading your alerts…
          </Text>
        ) : rules.length === 0 ? (
          <Text variant="label" tone="muted">
            No alerts on this market yet.
          </Text>
        ) : (
          rules.map((rule) => <RuleRow key={rule.id} rule={rule} now={now} />)
        )}

        {outcomes.length > 1 && (
          <>
            <Text variant="label" tone="secondary">
              Outcome
            </Text>
            <Chips label="Outcome" value={chosen ?? ""} onChange={setOutcome} options={outcomes.map((label) => ({ value: label, label }))} />
          </>
        )}
        <Text variant="label" tone="secondary">
          Tell me when it…
        </Text>
        <Chips<Condition>
          label="Condition"
          value={condition}
          onChange={(next) => {
            setCondition(next);
            setLevel("");
          }}
          options={[
            { value: "price_above", label: "Rises above" },
            { value: "price_below", label: "Falls below" },
            { value: "probability_change", label: "Moves by" },
            { value: "market_resolution", label: "Resolves" },
          ]}
        />
        {needsLevel && (
          <TextField
            label={condition === "probability_change" ? "Points of probability" : "Probability, in percent"}
            value={level}
            onChangeText={(next) => setLevel(next.replace(/[^\d.,]/g, ""))}
            keyboardType="decimal-pad"
            placeholder={condition === "probability_change" ? "5" : current !== null ? (current * 100).toFixed(0) : "50"}
            error={level !== "" && !validLevel ? (condition === "probability_change" ? "Between 0 and 100 points." : "Between 0 and 100 percent.") : null}
          />
        )}
        {current !== null && needsLevel && (
          <Text variant="label" tone="muted">
            {chosen ?? "This outcome"} is priced at {(current * 100).toFixed(1)}% now.
          </Text>
        )}
        <Button
          label={saving ? "Saving…" : `Alert me${needsLevel && validLevel && level !== "" ? ` · ${describeRule({ kind, threshold })}` : ""}`}
          variant="accent"
          loading={saving}
          disabled={saving || !validLevel || (needsLevel && level === "")}
          onPress={() => void save()}
        />
        {error !== null && (
          <Text variant="label" tone="negative">
            {error}
          </Text>
        )}
        <Text variant="label" tone="muted">
          A crossing arrives as a notification and in your inbox, as your notification settings allow. Alerts tell you; they never trade.
        </Text>
      </View>
    </BottomSheet>
  );
});

const styles = StyleSheet.create({
  body: { padding: 16, gap: 10 },
});
