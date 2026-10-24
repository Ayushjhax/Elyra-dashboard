import { useState } from "react";
import { StyleSheet, View } from "react-native";
import type { CompareResponse, RunResponse } from "@/lib/backtest/types";
import { AskButton, Card, PdfButtons, styles as shared } from "~/components/research/parts";
import { EquityCurve } from "~/components/research/EquityCurve";
import { SegmentedControl } from "~/components/ui/controls";
import { Text } from "~/components/ui/Text";
import { backtestPdf } from "~/lib/pdf";
import { color } from "~/theme/tokens";

/* ---------------------------------------------------------------------------
   A backtest's result, and a comparison's.

   The assumptions travel with every result, not behind a toggle: a return
   figure without its fee, slippage, execution timing and period is a
   number that circulates without its caveats. Quality issues and the
   robustness findings are said in words; there is no score.

   A comparison names no winner. Every row shares one dataset, shown once
   above it, and carries drawdown, trade count and quality beside the return
   so the reader weighs them.
--------------------------------------------------------------------------- */

const pct = (value: number | null | undefined, digits = 1): string =>
  typeof value === "number" && Number.isFinite(value) ? `${value.toFixed(digits)}%` : "—";

const num = (value: number | null | undefined, digits = 2): string =>
  typeof value === "number" && Number.isFinite(value) ? value.toFixed(digits) : "n/a";

const when = (ms: number | null): string => (ms === null ? "—" : new Date(ms).toISOString().slice(0, 16).replace("T", " "));

const QUALITY: Record<string, string> = {
  valid: "Valid",
  valid_with_warnings: "Valid, with warnings",
  insufficient_trades: "Too few trades to judge",
  insufficient_data: "Not enough data",
};

function Figure({ label, value, tone }: { label: string; value: string; tone?: "positive" | "negative" }) {
  return (
    <View style={styles.figure}>
      <Text variant="label" tone="muted">
        {label}
      </Text>
      <Text variant="data" tone={tone ?? "primary"}>
        {value}
      </Text>
    </View>
  );
}

function signed(value: number | null | undefined): "positive" | "negative" | undefined {
  return typeof value === "number" ? (value > 0 ? "positive" : value < 0 ? "negative" : undefined) : undefined;
}

type View3 = "overview" | "trades" | "strategy";

export function BacktestResult({ result }: { result: RunResponse }) {
  const [view, setView] = useState<View3>("overview");
  const { config, metrics } = result;
  const title = `${config.instrumentId} ${result.strategy.name} ${config.timeframe}`;

  return (
    <View style={styles.result}>
      {result.warnings.map((warning) => (
        <Text key={warning} variant="label" tone="caution">
          {warning}
        </Text>
      ))}
      <Card>
        <View style={shared.row}>
          <View style={shared.flex}>
            <Text variant="body">
              {config.instrumentId} · {result.strategy.name}
            </Text>
            <Text variant="label" tone="muted">
              {config.timeframe.toUpperCase()} · {result.barsLoaded.toLocaleString("en-US")} bars · {(result.coverage * 100).toFixed(1)}% coverage
            </Text>
          </View>
          <Text variant="label" tone={result.quality.level.startsWith("valid") ? "secondary" : "caution"}>
            {QUALITY[result.quality.level] ?? result.quality.level}
          </Text>
        </View>
        <View style={styles.figures}>
          <Figure label="Return" value={pct(metrics.totalReturnPct)} tone={signed(metrics.totalReturnPct)} />
          <Figure label="Buy & hold" value={pct(metrics.benchmarkReturnPct)} tone={signed(metrics.benchmarkReturnPct)} />
          <Figure label="Max drawdown" value={pct(metrics.maxDrawdownPct)} />
          <Figure label="Sharpe" value={num(metrics.sharpe)} />
          <Figure label="Trades" value={String(metrics.trades)} />
          <Figure label="Win rate" value={pct(metrics.winRatePct, 0)} />
        </View>
        <EquityCurve equity={result.equity} initial={config.initialCapitalUsd} />
        {result.id !== null ? (
          <PdfButtons title={title} load={() => backtestPdf(result.id as string, title)} />
        ) : (
          <Text variant="label" tone="muted">
            This result was not saved, so it has no PDF.
          </Text>
        )}
      </Card>

      <SegmentedControl<View3>
        accessibilityLabel="Result view"
        value={view}
        onChange={setView}
        choices={[
          { value: "overview", label: "Overview" },
          { value: "trades", label: `Trades · ${result.trades.length}` },
          { value: "strategy", label: "Strategy" },
        ]}
      />

      {view === "overview" && (
        <Card>
          <Text variant="eyebrow" tone="muted">
            Assumptions
          </Text>
          {[
            `Data: Binance klines, ${config.timeframe}`,
            `Period: ${config.startAt.slice(0, 10)} → ${config.endAt.slice(0, 10)}`,
            `Initial capital: $${config.initialCapitalUsd.toLocaleString("en-US")}`,
            `Fee ${config.execution.feeBps} bps · Slippage ${config.execution.slippageBps} bps`,
            "Direction: long only · Funding excluded",
            "Execution: signal on bar close, fill at next bar open",
          ].map((line) => (
            <Text key={line} variant="label" tone="secondary">
              {line}
            </Text>
          ))}
          <View style={styles.figures}>
            <Figure label="CAGR" value={pct(metrics.cagrPct)} tone={signed(metrics.cagrPct)} />
            <Figure label="Sortino" value={num(metrics.sortino)} />
            <Figure label="Profit factor" value={num(metrics.profitFactor)} />
            <Figure label="Exposure" value={pct(metrics.exposurePct, 0)} />
            <Figure label="Fees paid" value={`$${metrics.totalFees.toFixed(2)}`} />
          </View>
          {result.quality.issues.length > 0 && (
            <>
              <Text variant="eyebrow" tone="muted" style={styles.space}>
                Caveats
              </Text>
              {result.quality.issues.map((issue) => (
                <Text key={issue} variant="label" tone="secondary">
                  {issue}
                </Text>
              ))}
            </>
          )}
          {metrics.notes.map((note) => (
            <Text key={note} variant="label" tone="muted">
              {note}
            </Text>
          ))}
          {result.robustness !== null && (
            <>
              <Text variant="eyebrow" tone="muted" style={styles.space}>
                Robustness
              </Text>
              {result.robustness.findings.map((finding) => (
                <Text key={finding} variant="label" tone="secondary">
                  {finding}
                </Text>
              ))}
              {result.robustness.checks.map((check) => (
                <View key={check.label} style={styles.check}>
                  <View style={shared.flex}>
                    <Text variant="label">{check.label}</Text>
                    <Text variant="label" tone="muted">
                      {check.change}
                    </Text>
                  </View>
                  <View style={styles.right}>
                    <Text variant="data-sm" tone={signed(check.totalReturnPct)}>
                      {pct(check.totalReturnPct)}
                    </Text>
                    <Text variant="data-sm" tone="muted">
                      {check.deltaPoints >= 0 ? "+" : ""}
                      {check.deltaPoints.toFixed(1)} pts · {check.trades} trades
                    </Text>
                  </View>
                </View>
              ))}
            </>
          )}
          <AskButton
            prompt={`I backtested ${result.strategy.name} on ${config.instrumentId} ${config.timeframe} from ${config.startAt.slice(0, 10)} to ${config.endAt.slice(0, 10)}: ${pct(metrics.totalReturnPct)} against buy-and-hold ${pct(metrics.benchmarkReturnPct)}, max drawdown ${pct(metrics.maxDrawdownPct)}, ${metrics.trades} trades. How should I read this, and what would make it more or less trustworthy?`}
          />
        </Card>
      )}

      {view === "trades" && (
        <Card>
          {result.trades.length === 0 ? (
            <Text variant="body-sm" tone="secondary">
              No trades in this period — the entry rule never fired.
            </Text>
          ) : (
            result.trades.slice(0, 50).map((trade, index) => (
              <View key={index} style={[styles.trade, index > 0 && styles.rule]}>
                <View style={shared.flex}>
                  <Text variant="data-sm">
                    {when(trade.entryTime)} → {when(trade.exitTime)}
                  </Text>
                  <Text variant="label" tone="muted" numberOfLines={2}>
                    {trade.entryReason} · {trade.exitReason} · {trade.barsHeld} bars
                  </Text>
                </View>
                <View style={styles.right}>
                  <Text variant="data-sm" tone={signed(trade.returnPct)}>
                    {pct(trade.returnPct)}
                  </Text>
                  <Text variant="data-sm" tone="secondary">
                    ${trade.netPnl.toFixed(2)}
                  </Text>
                </View>
              </View>
            ))
          )}
          {result.trades.length > 50 && (
            <Text variant="label" tone="muted">
              Showing the first 50 of {result.trades.length}. The PDF and the saved result hold them all.
            </Text>
          )}
        </Card>
      )}

      {view === "strategy" && (
        <Card>
          <Text variant="eyebrow" tone="muted">
            Entry
          </Text>
          <Text variant="body-sm">{result.strategy.rules.entry}</Text>
          <Text variant="eyebrow" tone="muted" style={styles.space}>
            Exit
          </Text>
          <Text variant="body-sm">{result.strategy.rules.exit}</Text>
          <Text variant="eyebrow" tone="muted" style={styles.space}>
            Parameters
          </Text>
          <Text variant="data-sm" tone="secondary">
            {Object.entries(config.params)
              .map(([key, value]) => `${key}: ${value}`)
              .join(" · ") || "None"}
          </Text>
        </Card>
      )}
    </View>
  );
}

export function ComparisonResult({ result }: { result: CompareResponse }) {
  const shared0 = result.assumptions;
  return (
    <View style={styles.result}>
      {result.unresolved.length > 0 && (
        <Text variant="label" tone="caution">
          Not recognised as strategies: {result.unresolved.join(", ")}.
        </Text>
      )}
      {result.warnings.map((warning) => (
        <Text key={warning} variant="label" tone="caution">
          {warning}
        </Text>
      ))}
      {shared0 !== undefined && (
        <Card>
          <Text variant="eyebrow" tone="muted">
            One dataset, every row
          </Text>
          <Text variant="label" tone="secondary">
            {shared0.symbol} · {shared0.timeframe} · {shared0.startAt.slice(0, 10)} → {shared0.endAt.slice(0, 10)} · {shared0.bars.toLocaleString("en-US")} bars
          </Text>
          <Text variant="label" tone="secondary">
            Fee {shared0.feeBps} bps · Slippage {shared0.slippageBps} bps · ${shared0.initialCapitalUsd.toLocaleString("en-US")} · long only
          </Text>
        </Card>
      )}
      {result.rows.map((row) => (
        <Card key={row.strategyId}>
          <View style={shared.row}>
            <Text variant="body" style={shared.flex}>
              {row.strategyName}
            </Text>
            {row.quality !== undefined && (
              <Text variant="label" tone={row.quality.startsWith("valid") ? "muted" : "caution"}>
                {QUALITY[row.quality] ?? row.quality}
              </Text>
            )}
          </View>
          {row.ok ? (
            <View style={styles.figures}>
              <Figure label="Return" value={pct(row.totalReturnPct)} tone={signed(row.totalReturnPct)} />
              <Figure label="Max drawdown" value={pct(row.maxDrawdownPct)} />
              <Figure label="Sharpe" value={num(row.sharpe)} />
              <Figure label="Trades" value={String(row.trades ?? "—")} />
              <Figure label="Win rate" value={pct(row.winRatePct, 0)} />
              <Figure label="Buy & hold" value={pct(row.benchmarkReturnPct)} />
            </View>
          ) : (
            <Text variant="label" tone="negative">
              {row.error ?? "This strategy could not be run."}
            </Text>
          )}
        </Card>
      ))}
      <Text variant="label" tone="muted">
        No winner is named: one period on one asset is not a forecast. Weigh drawdown and trade count beside the return.
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  result: { gap: 12 },
  figures: { flexDirection: "row", flexWrap: "wrap", rowGap: 10, columnGap: 12, marginVertical: 4 },
  figure: { width: "30%", flexGrow: 1, gap: 2 },
  space: { marginTop: 8 },
  check: { flexDirection: "row", alignItems: "center", gap: 8, paddingVertical: 4 },
  trade: { flexDirection: "row", alignItems: "center", gap: 8, paddingVertical: 8 },
  rule: { borderTopWidth: StyleSheet.hairlineWidth * 2, borderTopColor: color["border-subtle"] },
  right: { alignItems: "flex-end", gap: 2 },
});
