import { useId } from "react";
import { Image, StyleSheet, type ViewStyle } from "react-native";
import Svg, { Defs, RadialGradient, Rect, Stop } from "react-native-svg";
import { palette } from "~/theme/tokens";

/* ---------------------------------------------------------------------------
   The gold emblem and its olive glow — the two brand moments outside the
   flat product (README, "Deliberate deviations"). The sign-in screen, the
   Markets and Account headers and the focused flows' bar (shell/flow.tsx —
   search, notifications, wallet, alerts and the settings pages) use them;
   nothing else does.

   The emblem is the original render with its background made transparent
   (assets/images/elyra-emblem.png), never a mockup crop. The glow is one
   radial fade drawn in SVG — no blur, no animation — and never takes a tap.
--------------------------------------------------------------------------- */

/** The gold Elyra emblem. Decorative: the wordmark beside it carries the name. */
export function Emblem({ size }: { size: number }) {
  return (
    <Image
      source={require("../../../assets/images/elyra-emblem.png")}
      style={{ width: size, height: size }}
      accessible={false}
    />
  );
}

/**
 * A faint olive radial fade, `size` square, centred on whatever it is placed
 * behind. Position it with `style`; it is absolutely placed by default.
 */
export function Glow({ size, strength = 1, style }: { size: number; strength?: number; style?: ViewStyle }) {
  /* Each glow needs its own gradient id: two on one screen would otherwise
     share the first one's definition. */
  const id = `glow-${useId().replace(/[^a-zA-Z0-9]/g, "")}`;
  return (
    <Svg width={size} height={size} style={[styles.glow, style]} pointerEvents="none">
      <Defs>
        <RadialGradient id={id} cx="50%" cy="50%" r="50%">
          <Stop offset="0" stopColor={palette.olive} stopOpacity={0.26 * strength} />
          <Stop offset="0.45" stopColor={palette.moss} stopOpacity={0.12 * strength} />
          <Stop offset="1" stopColor={palette.moss} stopOpacity={0} />
        </RadialGradient>
      </Defs>
      <Rect width={size} height={size} fill={`url(#${id})`} />
    </Svg>
  );
}

const styles = StyleSheet.create({
  glow: { position: "absolute" },
});
