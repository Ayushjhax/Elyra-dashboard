import { useRef, useState } from "react";
import { Pressable, StyleSheet, TextInput, View, useWindowDimensions } from "react-native";
import { ArrowRight, Check, ChevronDown, Info, RotateCcw, Sparkles } from "lucide-react-native";
import { parseBacktestRequest } from "@/lib/backtest/parse";
import type { CatalogueStrategy, CompareResponse, RunResponse, StrategyCatalogue } from "@/lib/backtest/types";
import { LabeledInput } from "~/components/connections/parts";
import { BacktestResult, ComparisonResult } from "~/components/research/BacktestResult";
import { Chips, Loading, OrDivider, Problem, SerifHeading, TabIntro, styles as shared, useResearch } from "~/components/research/parts";
import { WideButton } from "~/components/shell/flow";
import { Rule, SurfaceCard } from "~/components/shell/surface";
import { Button } from "~/components/ui/controls";
import { BottomSheet, type BottomSheetHandle } from "~/components/ui/overlays";
import { Text } from "~/components/ui/Text";
import { api, ApiError } from "~/lib/api";
import { checkBuilder } from "~/lib/backtestForm";
import { fontFamily } from "~/theme/fonts";
import { color, radius, TOUCH_TARGET } from "~/theme/tokens";

/* ---------------------------------------------------------------------------
   The Backtest lab — the website's BacktestsTab, plus what the chat's
   /backtest did.

   Two ways in. TYPE IT: "SOL rsi 12 1h 1y" or "compare macd, rsi and
   bollinger on sol", read by the same parser the chat used
   (lib/backtest/parse.ts); one strategy runs, several compare, none asks
   which. PICK IT: asset, timeframe, period, a strategy from the catalogue
   with the controls its own parameter metadata describes, and the costs.

   Fee and slippage default to 10 bps each, never zero: a frictionless
   backtest is the easiest way to make any strategy look good. The
   builder's values are checked against the catalogue's own bounds
   (lib/backtestForm.ts) and never changed to make them pass.

   The entry and exit lines are the catalogue's, the engine's own words.
   Compare runs each strategy on its defaults, as the API does.
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
const EXAMPLES = ["SOL rsi 12 1h 1y", "BTC macd 4h 6m", "Compare MACD, RSI and Bollinger on SOL"];

type Mode = "run" | "compare";
type Outcome = { kind: "run"; result: RunResponse } | { kind: "compare"; result: CompareResponse } | null;

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

/** A label beside its choices on a wider phone, above them on a narrow one. */
function SettingRow({ label, beside, children }: { label: string; beside: boolean; children: React.ReactNode }) {
  return (
    <View style={beside ? styles.settingBeside : styles.settingAbove}>
      <Text variant="body" style={[styles.settingLabel, beside && styles.settingLabelBeside]}>
        {label}
      </Text>
      <View style={shared.flex}>{children}</View>
    </View>
  );
}

/** The engine's own entry and exit rules, and how it fills. */
function Logic({ strategy, beside }: { strategy: CatalogueStrategy; beside: boolean }) {
  return (
    <SurfaceCard>
      <SerifHeading>Strategy logic</SerifHeading>
      {(["entry", "exit"] as const).map((side) => (
        <SettingRow key={side} label={side === "entry" ? "Entry" : "Exit"} beside={beside}>
          <View style={styles.rule}>
            <Text variant="body" style={styles.ruleText}>
              {strategy.rules[side]}
            </Text>
          </View>
        </SettingRow>
      ))}
      <Rule />
      <Text variant="body" tone="secondary" style={styles.note}>
        Signal at bar close · Fill at next bar open.
      </Text>
    </SurfaceCard>
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

  const { width, fontScale } = useWindowDimensions();
  const beside = width / Math.max(1, fontScale) >= 400;
  const check = checkBuilder({ strategy: mode === "run" ? strategy : null, params, fee, slippage, timeframe });
  const invalid = check.ok ? null : check.error;
  const [sentenceError, setSentenceError] = useState<string | null>(null);

  const busy = useRef(false);
  const go = async (work: () => Promise<Outcome>) => {
    if (busy.current) return;
    busy.current = true;
    setRunning(true);
    setError(null);
    try {
      setOutcome(await work());
    } catch (failure) {
      setOutcome(null);
      setError(failure instanceof ApiError ? failure.message : "The backtest could not be run. Check the inputs and try again.");
    } finally {
      busy.current = false;
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
      setSentenceError(`Which strategy? None was recognised in “${text}”. Try “${EXAMPLES[0]}”, or build one below.`);
      return;
    }
    setSentenceError(null);
    const common = { symbol: parsed.symbol, timeframe: parsed.timeframe, days: parsed.days, ...(parsed.feeBps === undefined ? {} : { feeBps: parsed.feeBps }) };
    if (parsed.strategyIds.length > 1) void compare({ ...common, strategies: parsed.strategyIds.slice(0, MAX_COMPARE) });
    else void runOne({ ...common, strategy: parsed.strategyIds[0], params: parsed.params, query: text });
  };

  const runPicked = () => {
    if (!check.ok) return;
    const common = { symbol, timeframe, days, feeBps: check.feeBps, slippageBps: check.slippageBps };
    if (mode === "compare") void compare({ ...common, strategies: compareIds });
    else void runOne({ ...common, strategy: strategyId, params: check.params });
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
    setSentenceError(null);
  };

  const pickerLabel = mode === "run" ? (strategy?.name ?? "Choose a strategy") : compareIds.map(nameOf).join(", ") || "Choose strategies";
  const canRunPicked = !running && invalid === null && catalogue.data !== null && (mode === "run" ? strategy !== null : compareIds.length >= 2);

  return (
    <View style={styles.tab}>
      <TabIntro title="Test your thinking." lead="Explore a strategy before you act." />

      <SurfaceCard>
        <View style={styles.head}>
          <SerifHeading>Type a backtest</SerifHeading>
          <Text variant="body" tone="secondary" style={styles.note}>
            Strategy, asset, timeframe and period
          </Text>
        </View>
        <View style={[styles.input, sentenceError !== null && styles.inputError]}>
          <Sparkles size={22} strokeWidth={1.5} color={color["accent-hover"]} />
          <TextInput
            value={sentence}
            onChangeText={(next) => {
              setSentence(next);
              setSentenceError(null);
            }}
            placeholder={EXAMPLES[0]}
            placeholderTextColor={color["text-muted"]}
            selectionColor={color.accent}
            autoCapitalize="none"
            autoCorrect={false}
            returnKeyType="go"
            onSubmitEditing={runSentence}
            editable={!running}
            accessibilityLabel="Type a backtest: strategy, asset, timeframe and period"
            accessibilityHint={sentenceError ?? undefined}
            style={styles.inputText}
          />
        </View>
        {sentenceError !== null && (
          <Text variant="body-sm" tone="negative" accessibilityLiveRegion="polite">
            {sentenceError}
          </Text>
        )}
        <View style={styles.suggestions}>
          {EXAMPLES.map((example) => (
            <Pressable
              key={example}
              onPress={() => {
                setSentence(example);
                setSentenceError(null);
              }}
              disabled={running}
              accessibilityRole="button"
              accessibilityLabel={`Use “${example}”`}
              style={({ pressed }) => [styles.suggestion, pressed && styles.pressed]}
            >
              <Text variant="body" style={styles.suggestionText}>
                {example}
              </Text>
            </Pressable>
          ))}
        </View>
        <WideButton
          label={running ? "Running…" : "Run backtest"}
          variant={sentence.trim().length > 0 ? "accent" : "outline"}
          trailing={running ? undefined : ArrowRight}
          busy={running}
          disabled={sentence.trim().length === 0}
          onPress={runSentence}
        />
      </SurfaceCard>

      <OrDivider>or build your own</OrDivider>

      <SurfaceCard>
        <SerifHeading>Strategy builder</SerifHeading>
        <View accessibilityRole="radiogroup" accessibilityLabel="Run one strategy or compare" style={styles.segments}>
          {(["run", "compare"] as const).map((value) => {
            const on = mode === value;
            return (
              <Pressable
                key={value}
                onPress={() => setMode(value)}
                accessibilityRole="radio"
                accessibilityState={{ checked: on }}
                style={[styles.segment, on && styles.segmentOn]}
              >
                <Text key={on ? "on" : "off"} variant="body" style={[styles.segmentText, on && styles.segmentTextOn]}>
                  {value === "run" ? "One strategy" : "Compare"}
                </Text>
              </Pressable>
            );
          })}
        </View>
        <SettingRow label="Asset" beside={beside}>
          <Chips wrap label="Asset" value={symbol} onChange={setSymbol} options={SYMBOLS.map((value) => ({ value, label: value }))} />
        </SettingRow>
        <SettingRow label="Timeframe" beside={beside}>
          <Chips wrap label="Timeframe" value={timeframe} onChange={setTimeframe} options={TIMEFRAMES.map((value) => ({ value, label: value }))} />
        </SettingRow>
        <SettingRow label="Period" beside={beside}>
          <Chips wrap label="Period" value={days} onChange={setDays} options={PERIODS} />
        </SettingRow>
        <SettingRow label={mode === "run" ? "Strategy" : `Strategies · ${compareIds.length} of up to ${MAX_COMPARE}`} beside={beside && mode === "run"}>
          {catalogue.loading && <Loading>Loading strategies…</Loading>}
          {catalogue.error !== null && <Problem retry={catalogue.reload}>{catalogue.error}</Problem>}
          {catalogue.data !== null && (
            <Pressable
              onPress={() => sheet.current?.present()}
              accessibilityRole="button"
              accessibilityLabel={`${mode === "run" ? "Strategy" : "Strategies"}: ${pickerLabel}`}
              accessibilityHint="Opens the strategies"
              style={({ pressed }) => [styles.picker, pressed && styles.pressed]}
              disabled={running}
            >
              <Text variant="body" style={[shared.flex, styles.pickerText]} numberOfLines={3}>
                {pickerLabel}
              </Text>
              <ChevronDown size={22} strokeWidth={1.5} color={color["text-primary"]} />
            </Pressable>
          )}
        </SettingRow>
        {mode === "compare" && (
          <Text variant="body" tone="secondary" style={styles.note}>
            {compareIds.length < 2 ? "Choose at least two strategies to compare." : "Each strategy runs on its default parameters, side by side."}
          </Text>
        )}
      </SurfaceCard>

      {mode === "run" && strategy !== null && <Logic strategy={strategy} beside={beside} />}

      <SurfaceCard>
        <SerifHeading>{mode === "run" ? "Parameters" : "Costs"}</SerifHeading>
        {mode === "run" && strategy !== null && strategy.parameters.length > 0 && (
          <View style={styles.grid}>
            {strategy.parameters.map((parameter) => (
              <View key={parameter.key} style={styles.cell}>
                <LabeledInput
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
            <LabeledInput label="Fee (bps)" value={fee} onChangeText={setFee} keyboardType="decimal-pad" editable={!running} />
          </View>
          <View style={styles.cell}>
            <LabeledInput label="Slippage (bps)" value={slippage} onChangeText={setSlippage} keyboardType="decimal-pad" editable={!running} />
          </View>
        </View>
        {invalid !== null && (
          <Text variant="body-sm" tone="negative" accessibilityLiveRegion="polite">
            {invalid}
          </Text>
        )}
        <Text variant="body" tone="secondary" style={styles.note}>
          Long only. Funding, shorts and leverage are not simulated. 10 bps is 0.10% of each trade.
        </Text>
      </SurfaceCard>

      <WideButton
        label={running ? "Running…" : mode === "run" ? "Run backtest" : "Compare strategies"}
        variant="accent"
        trailing={running ? undefined : ArrowRight}
        busy={running}
        disabled={!canRunPicked}
        onPress={runPicked}
      />
      <Button label="Reset" variant="ghost" icon={<RotateCcw size={16} strokeWidth={1.5} color={color["text-secondary"]} />} disabled={running} onPress={reset} />
      <View style={styles.disclaimer}>
        <Info size={20} strokeWidth={1.5} color={color["text-secondary"]} />
        <Text variant="body-sm" tone="secondary" style={[shared.flex, styles.note]}>
          Historical simulations do not predict future returns.
        </Text>
      </View>

      {running && <Loading>Running the simulation against historical bars…</Loading>}
      {error !== null && <Problem>{error}</Problem>}
      {outcome?.kind === "run" && <BacktestResult result={outcome.result} />}
      {outcome?.kind === "compare" && <ComparisonResult result={outcome.result} />}

      {catalogue.data !== null && (
        <StrategySheet sheet={sheet} catalogue={catalogue.data} selected={mode === "run" ? [strategyId] : compareIds} multiple={mode === "compare"} onPick={pick} />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  tab: { gap: 16 },
  pressed: { backgroundColor: color["surface-hover"] },
  head: { gap: 4 },
  note: { fontSize: 15, lineHeight: 21 },
  group: { paddingHorizontal: 16, paddingTop: 12, paddingBottom: 4 },
  option: { flexDirection: "row", alignItems: "center", gap: 12, minHeight: 56, paddingHorizontal: 16, paddingVertical: 8 },
  input: {
    flexDirection: "row",
    alignItems: "center",
    gap: 14,
    minHeight: 60,
    paddingHorizontal: 16,
    borderRadius: radius.panel,
    borderWidth: 1,
    borderColor: color["border-strong"],
    backgroundColor: color["surface-base"],
  },
  inputError: { borderColor: color.negative },
  inputText: { flex: 1, minWidth: 0, minHeight: 56, color: color["text-primary"], fontFamily: fontFamily("sans", 400), fontSize: 17 },
  suggestions: { flexDirection: "row", flexWrap: "wrap", gap: 10 },
  suggestion: {
    minHeight: TOUCH_TARGET,
    justifyContent: "center",
    paddingHorizontal: 18,
    paddingVertical: 8,
    borderRadius: radius.panel,
    borderWidth: 1,
    borderColor: color["border-strong"],
    maxWidth: "100%",
  },
  suggestionText: { fontSize: 15, lineHeight: 20 },
  segments: { flexDirection: "row", padding: 3, borderRadius: radius.panel, borderWidth: 1, borderColor: color["border-strong"] },
  segment: { flex: 1, minHeight: TOUCH_TARGET, alignItems: "center", justifyContent: "center", borderRadius: radius.control, borderWidth: 1, borderColor: "transparent" },
  segmentOn: { borderColor: color["accent-hover"], backgroundColor: color["surface-active"] },
  segmentText: { fontSize: 16, lineHeight: 22, color: color["text-secondary"], textAlign: "center", alignSelf: "stretch" },
  segmentTextOn: { fontFamily: fontFamily("sans", 500), color: color["text-primary"] },
  settingBeside: { flexDirection: "row", alignItems: "flex-start", gap: 12 },
  settingAbove: { gap: 8 },
  settingLabel: { fontSize: 16, lineHeight: 22 },
  settingLabelBeside: { width: 96, paddingTop: 11 },
  picker: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    minHeight: 56,
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: radius.panel,
    borderWidth: 1,
    borderColor: color["border-strong"],
    backgroundColor: color["surface-base"],
  },
  pickerText: { fontSize: 16, lineHeight: 22 },
  rule: { minHeight: TOUCH_TARGET, justifyContent: "center", paddingHorizontal: 16, paddingVertical: 10, borderRadius: radius.control, borderWidth: 1, borderColor: color["border-strong"] },
  ruleText: { fontSize: 15, lineHeight: 21 },
  grid: { flexDirection: "row", flexWrap: "wrap", gap: 14 },
  cell: { flexBasis: "45%", flexGrow: 1 },
  disclaimer: { flexDirection: "row", alignItems: "center", gap: 10, paddingHorizontal: 4 },
});
