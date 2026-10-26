import { useMemo, useState } from "react";
import { StyleSheet, View } from "react-native";
import { Image } from "expo-image";
import Svg, { Circle, G, Path } from "react-native-svg";
import { identicon, type IdenticonCorner, type IdenticonTone } from "@/lib/identicon";
import { initials, toneFor } from "@/lib/monogram";
import { qrModules, qrPath } from "@/lib/qr";
import { Text } from "~/components/ui/Text";
import { color, palette, radius } from "~/theme/tokens";

/* ---------------------------------------------------------------------------
   Marks: an asset's logo, a company's, a monogram where there is no logo, a
   wallet's identicon, the Elyra mark, and a QR code. All decorative except
   the QR code, so each is hidden from screen readers — whatever wears a mark
   carries the name.
--------------------------------------------------------------------------- */

/** Two initials on a palette tone hashed from the name (lib/monogram.ts). */
export function Monogram({ name, size }: { name: string; size: number }) {
  const [background, foreground] = toneFor(name);
  const text = initials(name);
  return (
    <View
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
      style={[styles.round, { width: size, height: size, backgroundColor: palette[background] }]}
    >
      <Text
        variant="label"
        allowFontScaling={false}
        style={{
          color: palette[foreground],
          fontSize: Math.max(8, Math.round(size * (text.length > 1 ? 0.36 : 0.44))),
          lineHeight: Math.max(10, Math.round(size * 0.5)),
          letterSpacing: 0,
        }}
      >
        {text}
      </Text>
    </View>
  );
}

/**
 * A circular asset mark: the logo, then a fallback source, then the
 * lettered chip. A logo that fails to load is a normal outcome (most of what
 * Pyth carries has no logo), so it falls through quietly.
 */
export function CoinMark({
  symbol,
  logo = null,
  fallbackLogo = null,
  size = 20,
}: {
  symbol: string;
  logo?: string | null;
  fallbackLogo?: string | null;
  size?: number;
}) {
  /* Failed URLs by value, not a count: the logo often arrives after the
     fallback has already failed, and a count would then skip it. */
  const [failed, setFailed] = useState<ReadonlySet<string>>(() => new Set());
  const source = [logo, fallbackLogo].find((url): url is string => url !== null && !failed.has(url)) ?? null;
  return (
    <View
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
      style={[styles.round, styles.coin, { width: size, height: size }]}
    >
      {source !== null ? (
        <Image
          key={source}
          source={{ uri: source }}
          style={{ width: size, height: size }}
          contentFit="contain"
          onError={() => setFailed((current) => new Set(current).add(source))}
        />
      ) : (
        <Monogram name={symbol} size={size} />
      )}
    </View>
  );
}

/** A listed company's logo by ticker — Parqet, then Financial Modeling Prep — before the chip. */
export function CompanyMark({ ticker, logo = null, size = 28 }: { ticker: string; logo?: string | null; size?: number }) {
  const symbol = encodeURIComponent(ticker.toUpperCase());
  const parqet = `https://assets.parqet.com/logos/symbol/${symbol}`;
  const fmp = `https://financialmodelingprep.com/image-stock/${symbol}.png`;
  return (
    <CoinMark
      key={logo ?? parqet}
      symbol={ticker}
      logo={logo ?? parqet}
      fallbackLogo={logo ? parqet : fmp}
      size={size}
    />
  );
}

/* ---- Identicon: the website's drawing, ported (lib/identicon.ts decides the pattern) ---- */

const TONE: Record<IdenticonTone, string> = {
  cream: palette.ivory,
  mist: palette["mist-sage"],
  sage: palette.sage,
  moss: palette.moss,
};

const TILE = 11.5;
const GAP = 1.25;
const NEAR = 20 - GAP / 2 - TILE;
const FAR = 20 + GAP / 2;

function tilePath(corner: IdenticonCorner, inner: number): string {
  const s = TILE;
  const start =
    corner === "round"
      ? `M0 ${s * 0.45} A${s * 0.45} ${s * 0.45} 0 0 1 ${s * 0.45} 0`
      : corner === "cut"
        ? `M0 ${s * 0.38} L${s * 0.38} 0`
        : "M0 0";
  return `${start} H${s} V${s - inner} A${inner} ${inner} 0 0 1 ${s - inner} ${s} H0 Z`;
}

const PLACEMENT = [
  `translate(${NEAR} ${NEAR})`,
  `translate(${FAR + TILE} ${NEAR}) scale(-1 1)`,
  `translate(${FAR + TILE} ${FAR + TILE}) scale(-1 -1)`,
  `translate(${NEAR} ${FAR + TILE}) scale(1 -1)`,
] as const;

/**
 * A wallet's mark, from the network and the full address. `identity` null is
 * the neutral mark, shown while the session or address is still loading.
 */
export function Identicon({
  identity,
  size = 36,
  active = false,
}: {
  identity: { network: string; address: string } | null;
  size?: number;
  active?: boolean;
}) {
  const network = identity?.network ?? null;
  const address = identity?.address ?? null;
  const pattern = useMemo(
    () => (network === null || address === null ? null : identicon(network, address)),
    [network, address],
  );
  return (
    <Svg width={size} height={size} viewBox="0 0 40 40" accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
      <Circle
        cx={20}
        cy={20}
        r={19.25}
        strokeWidth={1.5}
        fill={palette["deep-forest"]}
        stroke={active ? palette["mist-sage"] : palette.sage}
        strokeOpacity={active ? 1 : 0.7}
      />
      {PLACEMENT.map((transform, index) => {
        const tile = pattern?.tiles[index];
        return (
          <G key={index} transform={transform}>
            <Path
              d={tilePath(tile?.corner ?? "square", pattern?.star === "large" ? 6 : 4.5)}
              fill={tile === undefined ? color["border-strong"] : TONE[tile.tone]}
            />
          </G>
        );
      })}
    </Svg>
  );
}

/** The Elyra mark. */
export function ElyraMark({ size = 32 }: { size?: number }) {
  return (
    <Image
      source={require("../../../assets/images/elyra-mark.png")}
      style={{ width: size, height: size, borderRadius: radius.card }}
      contentFit="cover"
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
    />
  );
}

/**
 * A QR code (lib/qr.ts), dark on light whatever the theme: an inverted code
 * is one many phone cameras will not read. Not decorative — it is labelled.
 */
export function QrCode({ value, label, size = 176 }: { value: string; label: string; size?: number }) {
  const modules = useMemo(() => qrModules(value), [value]);
  const path = useMemo(() => qrPath(modules), [modules]);
  return (
    <View accessible accessibilityRole="image" accessibilityLabel={label} style={[styles.qr, { width: size, height: size }]}>
      <Svg width={size} height={size} viewBox={`0 0 ${modules.length} ${modules.length}`}>
        <Path d={path} fill={color["surface-base"]} />
      </Svg>
    </View>
  );
}

const styles = StyleSheet.create({
  round: { borderRadius: radius.pill, overflow: "hidden", alignItems: "center", justifyContent: "center" },
  coin: { borderWidth: 1, borderColor: color["border-subtle"], backgroundColor: color["surface-raised"] },
  qr: { backgroundColor: color["text-primary"], borderRadius: radius.card, overflow: "hidden" },
});
