import { useState } from "react";
import { StyleSheet, View } from "react-native";
import type { ExecutionView, ExitView, PredictionViewResponse } from "@/lib/prediction/api";
import { isPredictionFailure } from "@/lib/prediction/api";
import { percent, usdShort } from "~/components/research/prediction/format";
import { Card, Chips, Loading, Problem, styles as shared, useResearch } from "~/components/research/parts";
import { Text } from "~/components/ui/Text";
import { TextField } from "~/components/ui/TextField";

/* ---------------------------------------------------------------------------
   What an order of a given size would actually get, and what exiting a
   holding would realise — walked through the live book level by level by
   the API, never estimated from the mark.

   Read-only arithmetic on public data: nothing here places an order. The
   mark is not a price anyone is offering for a whole position, which is why
   the exit is shown in tranches.
--------------------------------------------------------------------------- */

const SIZES = [
  { value: 100, label: "$100" },
  { value: 500, label: "$500" },
  { value: 2_500, label: "$2.5k" },
  { value: 10_000, label: "$10k" },
];

function Figure({ label, value, tone }: { label: string; value: string; tone?: "caution" }) {
  return (
    <View style={styles.figure}>
      <Text variant="label" tone="muted">
        {label}
      </Text>
      <Text variant="data-sm" tone={tone ?? "primary"}>
        {value}
      </Text>
    </View>
  );
}

export function ExecutionPanel({ marketId, outcome, active }: { marketId: string; outcome: string | null; active: boolean }) {
  const [side, setSide] = useState<"buy" | "sell">("buy");
  const [size, setSize] = useState(500);
  const path = `/api/app/prediction?view=execution&market=${encodeURIComponent(marketId)}&side=${side}&notionalUsd=${size}${outcome ? `&outcome=${encodeURIComponent(outcome)}` : ""}`;
  const feed = useResearch<PredictionViewResponse<ExecutionView>>(active ? path : null, { timeoutMs: 30_000 });
  const data = feed.data?.data;
  const view = data !== undefined && !isPredictionFailure(data) ? data : null;

  return (
    <Card>
      <Text variant="eyebrow" tone="muted">
        Execution estimate · {outcome ?? "first outcome"}
      </Text>
      <Chips
        label="Side"
        value={side}
        onChange={setSide}
        options={[
          { value: "buy", label: "Buying" },
          { value: "sell", label: "Selling" },
        ]}
      />
      <Chips label="Size" value={size} onChange={setSize} options={SIZES} />
      {feed.loading && <Loading>Walking the book…</Loading>}
      {feed.error !== null && <Problem retry={feed.reload}>{feed.error}</Problem>}
      {data !== undefined && isPredictionFailure(data) && <Problem retry={feed.reload}>{data.error}</Problem>}
      {view !== null && (
        <>
          <View style={styles.figures}>
            <Figure label="At the touch" value={percent(view.touchPct)} />
            <Figure label="Average fill" value={percent(view.averageFillPct)} />
            <Figure label="Worst fill" value={percent(view.worstFillPct)} />
            <Figure label="Slippage" value={`${view.slippagePoints.toFixed(2)} pts`} tone={view.slippagePoints > 1 ? "caution" : undefined} />
            <Figure label="Shares" value={view.shares.toLocaleString("en-US", { maximumFractionDigits: 0 })} />
            <Figure label="Levels used" value={String(view.levelsConsumed)} />
          </View>
          {!view.filled && (
            <Text variant="label" tone="caution">
              The book cannot absorb the whole order: {usdShort(view.unfilledUsd)} would be left unfilled.
            </Text>
          )}
          {view.warnings.map((warning) => (
            <Text key={warning} variant="label" tone="caution">
              {warning}
            </Text>
          ))}
        </>
      )}
      <Text variant="label" tone="muted">
        Slippage is signed so a positive figure is always worse for the trader. An estimate from the book now; it places no order.
      </Text>
    </Card>
  );
}

export function ExitPanel({ marketId, outcome, held, active }: { marketId: string; outcome: string | null; held: number | null; active: boolean }) {
  const [typed, setTyped] = useState<string | null>(null);
  /* Asked when editing ends, not on every keystroke — each ask walks the book. */
  const [asked, setAsked] = useState<string | null>(null);
  const initial = held !== null ? String(Math.round(held)) : "100";
  const text = typed ?? initial;
  const shares = Number((asked ?? initial).replace(",", "."));
  const valid = Number.isFinite(shares) && shares > 0;
  const typedValid = Number(text.replace(",", ".")) > 0;
  const path = `/api/app/prediction?view=exit&market=${encodeURIComponent(marketId)}&shares=${valid ? shares : 0}${outcome ? `&outcome=${encodeURIComponent(outcome)}` : ""}`;
  const feed = useResearch<PredictionViewResponse<ExitView>>(active && valid ? path : null, { timeoutMs: 30_000 });
  const data = feed.data?.data;
  const view = data !== undefined && !isPredictionFailure(data) ? data : null;

  return (
    <Card>
      <Text variant="eyebrow" tone="muted">
        Exit liquidity · {outcome ?? "first outcome"}
      </Text>
      <TextField
        label={held !== null ? "Shares (prefilled with what you hold)" : "Shares held"}
        value={text}
        onChangeText={setTyped}
        onEndEditing={() => setAsked(text)}
        keyboardType="decimal-pad"
        error={!typedValid ? "Enter a number of shares above zero." : null}
      />
      {feed.loading && valid && <Loading>Walking the bids…</Loading>}
      {feed.error !== null && <Problem retry={feed.reload}>{feed.error}</Problem>}
      {data !== undefined && isPredictionFailure(data) && <Problem retry={feed.reload}>{data.error}</Problem>}
      {view !== null && (
        <>
          <Text variant="label" tone="secondary">
            Mark {percent(view.markPct)} — not a price anyone is offering for the whole position.
          </Text>
          {view.tranches.map((tranche) => (
            <View key={tranche.fraction} style={styles.tranche}>
              <Text variant="data-sm" style={styles.fraction}>
                {Math.round(tranche.fraction * 100)}%
              </Text>
              <Text variant="label" tone="secondary" style={shared.flex}>
                {tranche.shares.toLocaleString("en-US", { maximumFractionDigits: 0 })} sh at {percent(tranche.averagePct)} · {tranche.slippagePoints.toFixed(2)} pts
                {tranche.filled ? "" : " · not fully fillable"}
              </Text>
              <Text variant="data-sm">{usdShort(tranche.proceedsUsd)}</Text>
            </View>
          ))}
        </>
      )}
    </Card>
  );
}

const styles = StyleSheet.create({
  figures: { flexDirection: "row", flexWrap: "wrap", rowGap: 8, columnGap: 12 },
  figure: { flexBasis: "30%", flexGrow: 1, gap: 2 },
  tranche: { flexDirection: "row", alignItems: "center", gap: 8, minHeight: 36 },
  fraction: { width: 44 },
});
