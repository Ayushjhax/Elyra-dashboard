import { Linking, Pressable, StyleSheet, View } from "react-native";
import { router, type Href } from "expo-router";
import { ChevronRight, ExternalLink, FileText, Mail, Scale, ScrollText, type LucideIcon } from "lucide-react-native";
import { DetailScreen } from "~/components/portfolio/parts";
import { Text } from "~/components/ui/Text";
import { useToast } from "~/components/ui/overlays";
import { DISCLOSURES, PRIVACY_URL, SUPPORT_EMAIL, supportMailto, TERMS_URL } from "~/lib/legal";
import { color, radius, TOUCH_TARGET } from "~/theme/tokens";

/* ---------------------------------------------------------------------------
   Help & legal — support, the website's privacy policy and terms (the
   account is the same on both), what to know before relying on Elyra, and
   the open-source licences the app ships with.

   The support mail opens the person's own mail app with the app version and
   the phone filled in, and nothing about the account (lib/legal.ts): what
   they add is theirs to choose.
--------------------------------------------------------------------------- */

function Row({ icon: Icon, label, detail, onPress, external = false, last = false }: { icon: LucideIcon; label: string; detail: string; onPress: () => void; external?: boolean; last?: boolean }) {
  return (
    <Pressable
      accessibilityRole={external ? "link" : "button"}
      accessibilityHint={detail}
      onPress={onPress}
      android_ripple={{ color: color["surface-hover"] }}
      style={[styles.row, !last && styles.ruled]}
    >
      <Icon size={18} strokeWidth={1.5} color={color["text-secondary"]} />
      <View style={styles.flex}>
        <Text>{label}</Text>
        <Text variant="label" tone="muted">
          {detail}
        </Text>
      </View>
      {external ? (
        <ExternalLink size={16} strokeWidth={1.5} color={color["text-muted"]} />
      ) : (
        <ChevronRight size={16} strokeWidth={1.5} color={color["text-muted"]} />
      )}
    </Pressable>
  );
}

export default function LegalScreen() {
  const toast = useToast();

  const mail = async () => {
    try {
      await Linking.openURL(supportMailto());
    } catch {
      toast(`No mail app opened. Write to ${SUPPORT_EMAIL}.`, "negative");
    }
  };

  return (
    <DetailScreen title="Help & legal">
      <Text variant="eyebrow" tone="muted" accessibilityRole="header">
        Help
      </Text>
      <View style={styles.panel}>
        <Row
          icon={Mail}
          label="Email support"
          detail={`${SUPPORT_EMAIL} — the app version and phone model are filled in for you`}
          onPress={() => void mail()}
          external
          last
        />
      </View>

      <Text variant="eyebrow" tone="muted" accessibilityRole="header">
        Legal
      </Text>
      <View style={styles.panel}>
        <Row icon={FileText} label="Privacy policy" detail="getelyra.xyz/privacy" onPress={() => void Linking.openURL(PRIVACY_URL)} external />
        <Row icon={Scale} label="Terms of use" detail="getelyra.xyz/terms" onPress={() => void Linking.openURL(TERMS_URL)} external />
        <Row
          icon={ScrollText}
          label="Open-source licences"
          detail="The software Elyra is built with, and its licences"
          onPress={() => router.push("/licenses" as Href)}
          last
        />
      </View>

      <Text variant="eyebrow" tone="muted" accessibilityRole="header">
        Before you rely on Elyra
      </Text>
      <View style={[styles.panel, styles.disclosures]}>
        {DISCLOSURES.map((entry) => (
          <View key={entry.title} style={styles.disclosure}>
            <Text variant="body" accessibilityRole="header">
              {entry.title}
            </Text>
            <Text variant="body-sm" tone="secondary">
              {entry.body}
            </Text>
          </View>
        ))}
      </View>
    </DetailScreen>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1, minWidth: 0 },
  panel: {
    borderRadius: radius.panel,
    borderWidth: 1,
    borderColor: color["border-subtle"],
    backgroundColor: color["surface-panel"],
    overflow: "hidden",
  },
  row: { flexDirection: "row", alignItems: "center", gap: 12, minHeight: TOUCH_TARGET + 8, paddingHorizontal: 16, paddingVertical: 10 },
  ruled: { borderBottomWidth: StyleSheet.hairlineWidth * 2, borderBottomColor: color["border-subtle"] },
  disclosures: { padding: 16, gap: 16 },
  disclosure: { gap: 4 },
});
