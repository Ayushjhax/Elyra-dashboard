import { Linking } from "react-native";
import { router, type Href } from "expo-router";
import {
  ArrowLeftRight,
  Brain,
  ChartColumn,
  Database,
  FileText,
  KeyRound,
  Mail,
  Scale,
  ScrollText,
  Tag,
  type LucideIcon,
} from "lucide-react-native";
import { SettingsGroup, SettingsPage, SettingsRow } from "~/components/shell/settings";
import { useToast } from "~/components/ui/overlays";
import { DISCLOSURES, PRIVACY_URL, SUPPORT_EMAIL, supportMailto, TERMS_URL } from "~/lib/legal";

/* ---------------------------------------------------------------------------
   Help & legal — support, the website's privacy policy and terms (the
   account is the same on both), what to know before relying on Elyra, and
   the open-source licences the app ships with.

   The support mail opens the person's own mail app with the app version and
   the phone filled in, and nothing about the account (lib/legal.ts): what
   they add is theirs to choose. With no mail app, the address is said so it
   can be written to by hand.

   The disclosures are lib/legal.ts's, every one, word for word — this
   screen only gives each an icon.
--------------------------------------------------------------------------- */

/* By title, so a disclosure added to lib/legal.ts still shows, with a plain mark. */
const DISCLOSURE_ICON: Record<string, LucideIcon> = {
  "Not financial advice": ChartColumn,
  "AI answers can be wrong": Brain,
  "Elyra never holds your keys": KeyRound,
  "Venue connections are read-only": Database,
  "Swaps and prices": ArrowLeftRight,
  "Third-party names": Tag,
};

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
    <SettingsPage title="Help & legal">
      <SettingsGroup label="Help">
        <SettingsRow
          first
          icon={Mail}
          title="Email support"
          detail={SUPPORT_EMAIL}
          note="App version and phone model are prefilled."
          trailing="external"
          accessibilityHint="Opens your mail app"
          onPress={() => void mail()}
        />
      </SettingsGroup>

      <SettingsGroup label="Legal">
        <SettingsRow first icon={FileText} title="Privacy policy" detail="getelyra.xyz/privacy" trailing="external" onPress={() => void Linking.openURL(PRIVACY_URL)} />
        <SettingsRow icon={Scale} title="Terms of use" detail="getelyra.xyz/terms" trailing="external" onPress={() => void Linking.openURL(TERMS_URL)} />
        <SettingsRow
          icon={ScrollText}
          title="Open-source licences"
          detail="The software Elyra is built with, and its licences."
          onPress={() => router.push("/licenses" as Href)}
        />
      </SettingsGroup>

      <SettingsGroup label="Before you rely on Elyra">
        {DISCLOSURES.map((entry, index) => (
          <SettingsRow key={entry.title} first={index === 0} icon={DISCLOSURE_ICON[entry.title] ?? FileText} title={entry.title} detail={entry.body} />
        ))}
      </SettingsGroup>
    </SettingsPage>
  );
}
