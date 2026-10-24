import { useRef, useState } from "react";
import { Pressable, StyleSheet, View } from "react-native";
import { Check, ChevronDown } from "lucide-react-native";
import { parseBacktestRequest } from "@/lib/backtest/parse";
import type { CatalogueStrategy, CompareResponse, RunResponse, StrategyCatalogue } from "@/lib/backtest/types";
import { BacktestResult, ComparisonResult } from "~/components/research/BacktestResult";
import { Card, Chips, Loading, Problem, styles as shared, useResearch } from "~/components/research/parts";
import { Button, SegmentedControl } from "~/components/ui/controls";
import { BottomSheet, type BottomSheetHandle } from "~/components/ui/overlays";
import { Text } from "~/components/ui/Text";
import { TextField } from "~/components/ui/TextField";
import { api, ApiError } from "~/lib/api";
import { color, radius } from "~/theme/tokens";

/* ---------------------------------------------------------------------------
   The Backtest lab — the website's BacktestsTab, plus what the chat's
   /backtest did.

   Two ways in. TYPE IT: "SOL rsi 12 1h 1y" or "compare macd, rsi and
   bollinger on sol", read by the same parser the chat used
   (lib/backtest/parse.ts); one strategy runs, several compare, none asks
   which. PICK IT: asset, timeframe, period, a strategy from the catalogue
   with the controls its own parameter metadata describes, and the costs.

   Fee and slippage default to 10 bps each, never zero: a frictionless
   backtest is the easiest way to make any strategy look good.
--------------------------------------------------------------------------- */

const SYMBOLS = ["SOL", "BTC", "ETH"];
const TIMEFRAMES = ["15m", "1h", "4h", "1d"];
const PERIODS = [
  { value: 90, label: "3M" },
  { value: 182, label: "6M" },
  { value: 365, label: "1Y" },
];
const DEFAULT_STRATEGY = "RSI_12_MEAN_REVERSION_V1";
const MAX_COMPARE = 6;
const EXAMPLES = ["SOL rsi 12 1h 1y", "BTC macd 4h 6m", "compare macd, rsi and bollinger on sol"];

type Mode = "run" | "compare";
type Outcome = { kind: "run"; result: RunResponse } | { kind: "compare"; result: CompareResponse } | null;

function numberOr(value: string): number {
  return value.trim() === "" ? Number.NaN : Number(value.replace(",", "."));
}

/** The catalogue in a sheet, grouped by kind. One pick, or several to compare. */
function StrategySheet({
  sheet,
  catalogue,
  selected,
  multiple,
  onPick,
}: {
  sheet: React.RefObject<BottomSheetHandle | null>;
  catalogue: StrategyCatalogue;
  selected: string[];
  multiple: boolean;
  onPick: (id: string) => void;
}) {
  return (
    <BottomSheet ref={sheet} title={multiple ? `Compare up to ${MAX_COMPARE}` : "Strategy"}>
      {catalogue.categories.map((category) => (
        <View key={category.id}>
          <Text variant="eyebrow" tone="muted" style={styles.group}>
            {category.label}
          </Text>
          {catalogue.strategies
            .filter((strategy) => strategy.category === category.id)
            .map((strategy) => {
              const on = selected.includes(strategy.id);
              return (
                <Pressable
                  key={strategy.id}
                  onPress={() => onPick(strategy.id)}
                  accessibilityRole={multiple ? "checkbox" : "menuitem"}
                  accessibilityState={multiple ? { checked: on } : { selected: on }}
                  style={styles.option}
                >
                  <View style={shared.flex}>
                    <Text variant="body">{strategy.name}</Text>
                    <Text variant="label" tone="muted" numberOfLines={2}>
                      {strategy.rules.entry}
                    </Text>
                  </View>
                  {on && <Check size={16} strokeWidth={1.5} color={color.accent} />}
                </Pressable>
              );
            })}
        </View>
      ))}
    </BottomSheet>
  );
}

function Logic({ strategy }: { strategy: CatalogueStrategy | null }) {
  if (strategy === null) return null;
  return (
    <View style={styles.logic}>
      <Text variant="label" tone="muted">
        Entry · {strategy.rules.entry}
      </Text>
      <Text variant="label" tone="muted">
        Exit · {strategy.rules.exit}
      </Text>
      <Text variant="label" tone="muted">
        Long only · signal at bar close, fill at next bar open · funding, shorts and leverage not simulated
      </Text>
    </View>
  );
}

export function BacktestsTab({ active }: { active: boolean }) {
  const catalogue = useResearch<StrategyCatalogue>(active ? "/api/backtest/strategies" : null);
  const sheet = useRef<BottomSheetHandle>(null);

  const [sentence, setSentence] = useState("");
  const [mode, setMode] = useState<Mode>("run");
  const [symbol, setSymbol] = useState("SOL");
  const [timeframe, setTimeframe] = useState("1h");
  const [days, setDays] = useState(365);
  const [strategyId, setStrategyId] = useState(DEFAULT_STRATEGY);
  const [compareIds, setCompareIds] = useState<string[]>([DEFAULT_STRATEGY, "MACD_CROSS_V1"]);
  const [params, setParams] = useState<Record<string, string>>({});
  const [fee, setFee] = useState("10");
  const [slippage, setSlippage] = useState("10");

  const [running, setRunning] = useState(false);
  const [outcome, setOutcome] = useState<Outcome>(null);
  const [error, setError] = useState<string | null>(null);

  const strategies = catalogue.data?.strategies ?? [];
  const strategy = strategies.find((entry) => entry.id === strategyId) ?? null;
  const nameOf = (id: string) => strategies.find((entry) => entry.id === id)?.name ?? id;

  const feeBps = numberOr(fee);
  const slippageBps = numberOr(slippage);
  const paramValues = Object.fromEntries((strategy?.parameters ?? []).map((parameter) => [parameter.key, params[parameter.key] === undefined ? parameter.default : numberOr(params[parameter.key])]));
  const invalid =
    !Number.isFinite(feeBps) || feeBps < 0 || feeBps > 1000
      ? "Fee must be between 0 and 1,000 bps."
      : !Number.isFinite(slippageBps) || slippageBps < 0 || slippageBps > 1000
        ? "Slippage must be between 0 and 1,000 bps."
        : (strategy?.parameters ?? []).some((parameter) => !Number.isFinite(paramValues[parameter.key]))
          ? "Every parameter needs a number."
          : null;

  const go = async (work: () => Promise<Outcome>) => {
    if (running) return;
    setRunning(true);
    setError(null);
    try {
      setOutcome(await work());
    } catch (failure) {
      setOutcome(null);
      setError(failure instanceof ApiError ? failure.message : "The backtest could not be run. Check the inputs and try again.");
    } finally {
      setRunning(false);
    }
  };

  const runOne = (body: Record<string, unknown>) =>
    go(async () => ({ kind: "run", result: await api.post<RunResponse>("/api/backtest/run", { robustness: true, ...body }, { timeoutMs: 180_000 }) }));
  const compare = (body: Record<string, unknown>) =>
    go(async () => ({ kind: "compare", result: await api.post<CompareResponse>("/api/backtest/compare", body, { timeoutMs: 180_000 }) }));

  /* Typed: one strategy runs, several compare, none asks which. */
  const runSentence = () => {
    const text = sentence.trim();
    if (text.length === 0) return;
    const parsed = parseBacktestRequest(text);
    if (parsed.strategyIds.length === 0) {
      setOutcome(null);
      setError(`Which strategy? I did not recognise one in "${text}". Try "${EXAMPLES[0]}", or pick one below.`);
      return;
    }
    const common = { symbol: parsed.symbol, timeframe: parsed.timeframe, days: parsed.days, ...(parsed.feeBps === undefined ? {} : { feeBps: parsed.feeBps }) };
    if (parsed.strategyIds.length > 1) void compare({ ...common, strategies: parsed.strategyIds.slice(0, MAX_COMPARE) });
    else void runOne({ ...common, strategy: parsed.strategyIds[0], params: parsed.params, query: text });
  };

  const runPicked = () => {
    if (invalid !== null) return;
    const common = { symbol, timeframe, days, feeBps, slippageBps };
    if (mode === "compare") void compare({ ...common, strategies: compareIds });
    else void runOne({ ...common, strategy: strategyId, params: paramValues });
  };

  const pick = (id: string) => {
    if (mode === "run") {
      setStrategyId(id);
      setParams({});
      sheet.current?.dismiss();
      return;
    }
    setCompareIds((current) => (current.includes(id) ? current.filter((entry) => entry !== id) : current.length >= MAX_COMPARE ? current : [...current, id]));
  };

  const reset = () => {
    setSentence("");
    setSymbol("SOL");
    setTimeframe("1h");
    setDays(365);
    setStrategyId(DEFAULT_STRATEGY);
    setParams({});
    setFee("10");
    setSlippage("10");
    setOutcome(null);
    setError(null);
  };

  return (
    <View style={styles.tab}>
      <Card>
        <Text variant="h2">Type a backtest</Text>
        <TextField
          label="Strategy, asset, timeframe and period"
          value={sentence}
          onChangeText={setSentence}
          placeholder={EXAMPLES[0]}
          autoCapitalize="none"
          returnKeyType="go"
          onSubmitEditing={runSentence}
          editable={!running}
        />
        <View style={shared.row}>
          {EXAMPLES.map((example) => (
            <Button key={example} label={example} size="sm" variant="ghost" onPress={() => setSentence(example)} />
          ))}
        </View>
        <Button label={running ? "Running…" : "Run"} variant="accent" loading={running} disabled={running || sentence.trim().length === 0} onPress={runSentence} />
      </Card>

      <Card>
        <Text variant="h2">Or build one</Text>
        <SegmentedControl<Mode>
          accessibilityLabel="Run one or compare"
          value={mode}
          onChange={setMode}
          choices={[
            { value: "run", label: "One strategy" },
            { value: "compare", label: "Compare" },
          ]}
        />
        <Text variant="label" tone="secondary">
          Asset
        </Text>
        <Chips label="Asset" value={symbol} onChange={setSymbol} options={SYMBOLS.map((value) => ({ value, label: value }))} />
        <Text variant="label" tone="secondary">
          Timeframe
        </Text>
        <Chips label="Timeframe" value={timeframe} onChange={setTimeframe} options={TIMEFRAMES.map((value) => ({ value, label: value }))} />
        <Text variant="label" tone="secondary">
          Period
        </Text>
        <Chips label="Period" value={days} onChange={setDays} options={PERIODS} />

        <Text variant="label" tone="secondary">
          {mode === "run" ? "Strategy" : `Strategies · ${compareIds.length} of up to ${MAX_COMPARE}`}
        </Text>
        {catalogue.loading && <Loading>Loading strategies…</Loading>}
        {catalogue.error !== null && <Problem retry={catalogue.reload}>{catalogue.error}</Problem>}
        {catalogue.data !== null && (
          <Pressable onPress={() => sheet.current?.present()} accessibilityRole="button" accessibilityHint="Opens the strategies" style={styles.picker} disabled={running}>
            <Text variant="body" style={shared.flex} numberOfLines={2}>
              {mode === "run" ? (strategy?.name ?? "Choose a strategy") : compareIds.map(nameOf).join(", ") || "Choose strategies"}
            </Text>
            <ChevronDown size={16} strokeWidth={1.5} color={color["text-muted"]} />
          </Pressable>
        )}
        {mode === "run" && <Logic strategy={strategy} />}

        {mode === "run" && strategy !== null && strategy.parameters.length > 0 && (
          <View style={styles.grid}>
            {strategy.parameters.map((parameter) => (
              <View key={parameter.key} style={styles.cell}>
                <TextField
                  label={parameter.label}
                  value={params[parameter.key] ?? String(parameter.default)}
                  onChangeText={(next) => setParams((current) => ({ ...current, [parameter.key]: next }))}
                  keyboardType="decimal-pad"
                  accessibilityHint={parameter.description}
                  editable={!running}
                />
              </View>
            ))}
          </View>
        )}
        <View style={styles.grid}>
          <View style={styles.cell}>
            <TextField label="Fee (bps)" value={fee} onChangeText={setFee} keyboardType="decimal-pad" editable={!running} />
          </View>
          <View style={styles.cell}>
            <TextField label="Slippage (bps)" value={slippage} onChangeText={setSlippage} keyboardType="decimal-pad" editable={!running} />
          </View>
        </View>
        {invalid !== null && (
          <Text variant="label" tone="negative">
            {invalid}
          </Text>
        )}
        <View style={shared.row}>
          <Button
            label={running ? "Running…" : mode === "run" ? "Run backtest" : "Compare"}
            variant="accent"
            loading={running}
            disabled={running || invalid !== null || catalogue.data === null || (mode === "compare" && compareIds.length < 2)}
            onPress={runPicked}
          />
          <Button label="Reset" variant="ghost" disabled={running} onPress={reset} />
        </View>
        {mode === "compare" && compareIds.length < 2 && (
          <Text variant="label" tone="muted">
            Choose at least two strategies to compare.
          </Text>
        )}
      </Card>

      {running && <Loading>Running the simulation against historical bars…</Loading>}
      {error !== null && <Problem>{error}</Problem>}
      {outcome === null && !running && error === null && (
        <Text variant="body-sm" tone="secondary" style={shared.center}>
          Run a test to see results here.
        </Text>
      )}
      {outcome?.kind === "run" && <BacktestResult result={outcome.result} />}
      {outcome?.kind === "compare" && <ComparisonResult result={outcome.result} />}

      {catalogue.data !== null && (
        <StrategySheet sheet={sheet} catalogue={catalogue.data} selected={mode === "run" ? [strategyId] : compareIds} multiple={mode === "compare"} onPick={pick} />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  tab: { gap: 12 },
  group: { paddingHorizontal: 16, paddingTop: 12, paddingBottom: 4 },
  option: { flexDirection: "row", alignItems: "center", gap: 12, minHeight: 56, paddingHorizontal: 16, paddingVertical: 8 },
  picker: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    minHeight: 48,
    paddingHorizontal: 12,
    borderRadius: radius.control,
    borderWidth: 1,
    borderColor: color["border-strong"],
    backgroundColor: color["surface-raised"],
  },
  logic: { gap: 2 },
  grid: { flexDirection: "row", flexWrap: "wrap", gap: 12 },
  cell: { flexBasis: "45%", flexGrow: 1 },
});
