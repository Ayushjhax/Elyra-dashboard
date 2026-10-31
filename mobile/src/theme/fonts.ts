import {
  Fustat_400Regular,
  Fustat_500Medium,
  Fustat_600SemiBold,
  Fustat_700Bold,
} from "@expo-google-fonts/fustat";
import { Platform } from "react-native";
import type { TypeRole } from "@/lib/tokens";

/* ---------------------------------------------------------------------------
   The two faces, as static weights.

   Fustat for display, headings and large numerics; General Sans for body,
   UI and data (docs/ELYRA_BRAND.md §2). Static files rather than the
   website's variable fonts: Android does not render a variable font's
   weights reliably, and React Native picks a weight by family name, not by
   fontWeight. General Sans is used unmodified under the ITF Free Font
   License — see docs/THIRD_PARTY.md.
--------------------------------------------------------------------------- */

export const FONT_FILES = {
  Fustat_400Regular,
  Fustat_500Medium,
  Fustat_600SemiBold,
  Fustat_700Bold,
  GeneralSans_400Regular: require("../../assets/fonts/GeneralSans-Regular.otf"),
  GeneralSans_500Medium: require("../../assets/fonts/GeneralSans-Medium.otf"),
  GeneralSans_600SemiBold: require("../../assets/fonts/GeneralSans-Semibold.otf"),
  DMSerifDisplay_400Regular: require("../../assets/fonts/DMSerifDisplay-Regular.ttf"),
};

/**
 * A deliberate deviation (README, "Deliberate deviations"): DM Serif Display,
 * a face the brand doc does not name, sets the sign-in screen's headline and
 * footer line, the Markets tab's wordmark and title, and the wordmark and
 * titles of Search, the inbox and notification settings (components/shell/
 * flow.tsx). Those are its only uses — every other heading stays Fustat. SIL Open Font License 1.1
 * (docs/THIRD_PARTY.md).
 */
export const DISPLAY_SERIF = "DMSerifDisplay_400Regular";

const DISPLAY: Record<TypeRole["weight"], string> = {
  400: "Fustat_400Regular",
  500: "Fustat_500Medium",
  600: "Fustat_600SemiBold",
  700: "Fustat_700Bold",
};

/* General Sans stops at 600 in the brand; 700 falls back to its heaviest. */
const SANS: Record<TypeRole["weight"], string> = {
  400: "GeneralSans_400Regular",
  500: "GeneralSans_500Medium",
  600: "GeneralSans_600SemiBold",
  700: "GeneralSans_600SemiBold",
};

const MONO = Platform.select({ ios: "Menlo", default: "monospace" });

/** The family that draws a role's face at its weight. */
export function fontFamily(face: TypeRole["face"], weight: TypeRole["weight"]): string {
  if (face === "display") return DISPLAY[weight];
  if (face === "mono") return MONO;
  return SANS[weight];
}
