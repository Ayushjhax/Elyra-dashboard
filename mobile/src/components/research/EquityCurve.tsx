import { useMemo, useState } from "react";
import { StyleSheet, View } from "react-native";
import Svg, { Line, Path } from "react-native-svg";
import type { EquityPoint } from "@/lib/backtest/engine";
import { formatCompactUsd } from "@/lib/format";
import { Text } from "~/components/ui/Text";
import { color } from "~/theme/tokens";

/* ---------------------------------------------------------------------------
   A backtest's equity curve, drawn with react-native-svg from the result —
   no chart library. Downsampled to about two points per pixel column: a
   year of hourly bars is 8,700 points, and drawing all of them into 330dp
   draws the same line more slowly. Sage when the run ended above where it
   started, Clay when below, with the starting capital as a dashed rule.
--------------------------------------------------------------------------- */

const HEIGHT = 120;

export function EquityCurve({ equity, initial }: { equity: EquityPoint[]; initial: number }) {
  const [width, setWidth] = useState(0);
  const shape = useMemo(() => {
    if (equity.length < 2 || width === 0) return null;
    const step = Math.max(1, Math.floor(equity.length / (width * 2)));
    const points = equity.filter((_, index) => index % step === 0 || index === equity.length - 1).map((point) => point.equity);
    const min = Math.min(...points, initial);
    const max = Math.max(...points, initial);
    const range = max - min || 1;
    const y = (value: number) => 4 + (1 - (value - min) / range) * (HEIGHT - 8);
    const path = points.map((value, index) => `${index === 0 ? "M" : "L"}${((index / (points.length - 1)) * width).toFixed(1)},${y(value).toFixed(1)}`).join(" ");
    return { path, base: y(initial), up: points[points.length - 1] >= points[0], min, max, last: points[points.length - 1] };
  }, [equity, initial, width]);

  if (equity.length < 2) return null;
  return (
    <View
      accessible
      accessibilityRole="image"
      accessibilityLabel={shape ? `Equity curve, from ${formatCompactUsd(initial)} to ${formatCompactUsd(shape.last)}` : "Equity curve"}
      onLayout={(event) => setWidth(Math.floor(event.nativeEvent.layout.width))}
      style={styles.wrap}
    >
      {shape !== null && (
        <>
          <Svg width={width} height={HEIGHT}>
            <Line x1={0} x2={width} y1={shape.base} y2={shape.base} stroke={color["border-strong"]} strokeWidth={1} strokeDasharray="4 4" />
            <Path d={shape.path} fill="none" stroke={shape.up ? color.positive : color.negative} strokeWidth={1.5} />
          </Svg>
          <View style={styles.scale}>
            <Text variant="data-sm" tone="muted">
              Low {formatCompactUsd(shape.min)}
            </Text>
            <Text variant="data-sm" tone="muted">
              High {formatCompactUsd(shape.max)}
            </Text>
          </View>
        </>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { minHeight: HEIGHT, gap: 4 },
  scale: { flexDirection: "row", justifyContent: "space-between" },
});
