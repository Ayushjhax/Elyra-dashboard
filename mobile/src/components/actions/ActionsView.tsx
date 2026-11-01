import { Text as NativeText, ScrollView, StyleSheet, View } from "react-native";
import { ArrowRight, FileText, Quote, Wallet } from "lucide-react-native";
import { ReviewCards } from "~/components/actions/ReviewCards";
import { SerifHeading } from "~/components/research/parts";
import { WideButton } from "~/components/shell/flow";
import { Rule, SurfaceCard } from "~/components/shell/surface";
import { Text } from "~/components/ui/Text";
import { DISPLAY_SERIF, fontFamily } from "~/theme/fonts";
import { color, radius } from "~/theme/tokens";

/* ---------------------------------------------------------------------------
   Actions — what awaits review, in the Elyra tab.

   The cards are ReviewCards, unchanged: real prepared actions from the
   server, each opening the swap screen to re-quote and sign. With none,
   the page says how one comes about. "Ask Elyra" puts the example in the
   composer as a draft to edit — it sends nothing, prepares nothing and asks
   no wallet to sign.
--------------------------------------------------------------------------- */

const EXAMPLE = "Swap 1 SOL to USDC";

const STEPS: [string, string][] = [
  ["Ask", "Describe the swap you want to prepare."],
  ["Review", "Check the prepared swap details."],
  ["Sign", "Nothing is sent until your wallet signs."],
];

export function ActionsView({ open, onDraft }: { open: number; onDraft: (text: string) => void }) {
  return (
    <ScrollView contentContainerStyle={styles.content}>
      <View style={styles.intro}>
        <NativeText accessibilityRole="header" maxFontSizeMultiplier={1.2} style={styles.title}>
          Your actions
        </NativeText>
        <Text variant="body" tone="secondary" style={styles.lead}>
          Review prepared swaps before signing.
        </Text>
      </View>

      <ReviewCards />

      {open === 0 && (
        <View style={styles.empty}>
          <View style={styles.art} accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
            <FileText size={72} strokeWidth={1} color={color["text-secondary"]} />
            <View style={styles.wallet}>
              <Wallet size={40} strokeWidth={1.25} color={color["text-secondary"]} />
            </View>
          </View>
          <SerifHeading size={28}>Nothing awaiting review</SerifHeading>
          <Text variant="body" tone="secondary" style={[styles.lead, styles.center]}>
            When Elyra prepares a swap, its review card appears here and under the answer.
          </Text>
          <View style={styles.example} accessible accessibilityLabel={`Example request: ${EXAMPLE}`}>
            <Text variant="body-sm" tone="secondary">
              Example request
            </Text>
            <View style={styles.exampleLine}>
              <Quote size={22} strokeWidth={1.75} color={color["accent-hover"]} />
              <NativeText maxFontSizeMultiplier={1.3} style={styles.exampleText}>
                {EXAMPLE}
              </NativeText>
            </View>
          </View>
          <View style={styles.cta}>
            <WideButton
              label="Ask Elyra"
              variant="accent"
              trailing={ArrowRight}
              accessibilityHint="Puts the example in the composer to edit. Nothing is sent."
              onPress={() => onDraft(EXAMPLE)}
            />
          </View>
        </View>
      )}

      <Rule />
      <SurfaceCard>
        <SerifHeading size={26}>You stay in control</SerifHeading>
        {STEPS.map(([title, body], index) => (
          <View key={title} style={[styles.step, index > 0 && styles.ruled]} accessible accessibilityLabel={`Step ${index + 1}: ${title}. ${body}`}>
            <View style={styles.ring}>
              <Text variant="data" tone="accent" allowFontScaling={false} style={styles.number}>
                {String(index + 1).padStart(2, "0")}
              </Text>
            </View>
            <View style={styles.flex}>
              <Text variant="body" style={styles.stepTitle}>
                {title}
              </Text>
              <Text variant="body" tone="secondary" style={styles.note}>
                {body}
              </Text>
            </View>
          </View>
        ))}
      </SurfaceCard>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  content: { paddingHorizontal: 20, paddingTop: 4, paddingBottom: 32, gap: 20 },
  flex: { flex: 1, minWidth: 0, gap: 2 },
  intro: { gap: 4 },
  title: { fontFamily: DISPLAY_SERIF, fontSize: 38, lineHeight: 46, color: color["text-primary"], letterSpacing: -0.4 },
  lead: { fontSize: 16, lineHeight: 23 },
  note: { fontSize: 15, lineHeight: 21 },
  center: { textAlign: "center" },
  empty: { alignItems: "center", gap: 12 },
  art: { width: 140, height: 120, alignItems: "center", justifyContent: "center" },
  wallet: { position: "absolute", right: 18, bottom: 10, backgroundColor: color["surface-base"], borderRadius: radius.control },
  example: { alignSelf: "stretch", gap: 6, padding: 16, borderRadius: radius.sheet, borderWidth: 1, borderColor: color["border-strong"], backgroundColor: color["surface-panel"] },
  exampleLine: { flexDirection: "row", alignItems: "center", gap: 12 },
  exampleText: { fontFamily: DISPLAY_SERIF, fontSize: 20, lineHeight: 26, color: color["text-primary"], flexShrink: 1 },
  cta: { alignSelf: "stretch" },
  step: { flexDirection: "row", alignItems: "center", gap: 16, paddingVertical: 12 },
  ruled: { borderTopWidth: StyleSheet.hairlineWidth * 2, borderTopColor: color["border-subtle"] },
  ring: { width: 48, height: 48, borderRadius: 24, borderWidth: 1.5, borderColor: color["border-accent"], alignItems: "center", justifyContent: "center" },
  number: { fontSize: 17, lineHeight: 22 },
  stepTitle: { fontFamily: fontFamily("sans", 500), fontSize: 17, lineHeight: 23 },
});
