import { Text as NativeText, type TextProps, type TextStyle } from "react-native";
import { fontFamily } from "~/theme/fonts";
import { color, type, type ColorToken, type TypeVariant } from "~/theme/tokens";

/* ---------------------------------------------------------------------------
   Text in one of the brand's type roles, and only those (§2.1).

   Every role that shows a changing number uses tabular figures, so a price
   ticking never moves the column (§2.2). Dense data roles cap how far the
   system font size may scale them: they still grow for someone who needs
   it, but a table row stays a row.
--------------------------------------------------------------------------- */

export type TextTone =
  | "primary"
  | "secondary"
  | "muted"
  | "accent"
  | "positive"
  | "negative"
  | "caution"
  | "on-accent";

const TONE: Record<TextTone, ColorToken> = {
  primary: "text-primary",
  secondary: "text-secondary",
  muted: "text-muted",
  accent: "accent",
  positive: "positive",
  negative: "negative",
  caution: "caution",
  "on-accent": "text-on-accent",
};

/** How far each role may scale with the system font size. */
const MAX_SCALE: Partial<Record<TypeVariant, number>> = {
  display: 1.3,
  price: 1.3,
  data: 1.35,
  "data-sm": 1.35,
  "mono-addr": 1.35,
  eyebrow: 1.4,
};

/** Roles whose face widens punctuation under tabular figures (see tabularDigits). */
const DIGIT_RUNS = new Set((Object.keys(type) as TypeVariant[]).filter((variant) => type[variant].tabular && type[variant].face === "display"));

function styleFor(variant: TypeVariant): TextStyle {
  const role = type[variant];
  return {
    fontFamily: fontFamily(role.face, role.weight),
    fontSize: role.size,
    lineHeight: role.lineHeight,
    letterSpacing: role.letterSpacing,
    ...(role.tabular && !DIGIT_RUNS.has(variant) ? { fontVariant: ["tabular-nums"] } : {}),
    ...(role.uppercase ? { textTransform: "uppercase" } : {}),
  };
}

/**
 * Fustat's tabular feature widens punctuation as well as digits, so a price
 * set in it reads "1 , 234 . 56". For the Fustat roles, tabular widths go on
 * the digit runs only: the digits still never jitter as a value ticks (§2.2),
 * and the comma and point keep their own width.
 */
function tabularDigits(text: string): React.ReactNode[] {
  return text.split(/(\d+)/).map((part, index) =>
    /^\d+$/.test(part) ? (
      <NativeText key={index} style={TABULAR}>
        {part}
      </NativeText>
    ) : (
      part
    ),
  );
}

const TABULAR: TextStyle = { fontVariant: ["tabular-nums"] };

const STYLES = Object.fromEntries(
  (Object.keys(type) as TypeVariant[]).map((variant) => [variant, styleFor(variant)]),
) as Record<TypeVariant, TextStyle>;

export function Text({
  variant = "body",
  tone = "primary",
  style,
  maxFontSizeMultiplier,
  children,
  ...props
}: TextProps & { variant?: TypeVariant; tone?: TextTone }) {
  return (
    <NativeText
      {...props}
      maxFontSizeMultiplier={maxFontSizeMultiplier ?? MAX_SCALE[variant]}
      style={[STYLES[variant], { color: color[TONE[tone]] }, style]}
    >
      {DIGIT_RUNS.has(variant) && typeof children === "string" ? tabularDigits(children) : children}
    </NativeText>
  );
}
