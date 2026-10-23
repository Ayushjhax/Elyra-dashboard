import { useEffect, type ReactNode } from "react";
import { StyleSheet, View } from "react-native";
import Animated, { useAnimatedStyle, useReducedMotion, useSharedValue, withTiming } from "react-native-reanimated";
import type { Direction } from "~/lib/stores/market";
import { color, motion, radius } from "~/theme/tokens";

/* ---------------------------------------------------------------------------
   The tick flash: a price's background washes Sage when it ticks up and Clay
   when it ticks down, then fades. Keyed on the feed's sequence so the same
   direction twice flashes twice.

   With reduced motion on there is no wash at all — the number changing is
   the whole signal, as it is for a screen reader.
--------------------------------------------------------------------------- */

export function PriceFlash({ seq, direction, children }: { seq: number; direction: Direction; children: ReactNode }) {
  const reduced = useReducedMotion();
  const opacity = useSharedValue(0);

  useEffect(() => {
    if (reduced || direction === "flat") return;
    opacity.value = 1;
    opacity.value = withTiming(0, { duration: motion["dur-slow"] * 3 });
  }, [seq, direction, reduced, opacity]);

  const wash = useAnimatedStyle(() => ({ opacity: opacity.value }));

  return (
    <View style={styles.wrap}>
      {!reduced && direction !== "flat" && (
        <Animated.View
          pointerEvents="none"
          style={[
            StyleSheet.absoluteFill,
            styles.wash,
            { backgroundColor: direction === "up" ? color["positive-bg"] : color["negative-bg"] },
            wash,
          ]}
        />
      )}
      {children}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { paddingHorizontal: 4, borderRadius: radius.chip },
  wash: { borderRadius: radius.chip },
});
