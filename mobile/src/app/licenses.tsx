import { useMemo, useRef, useState } from "react";
import { FlatList, Linking, Pressable, StyleSheet, View } from "react-native";
import { ChevronRight } from "lucide-react-native";
import { SheetHeader } from "~/components/wallet/parts";
import { BottomSheet, type BottomSheetHandle } from "~/components/ui/overlays";
import { Button } from "~/components/ui/controls";
import { Text } from "~/components/ui/Text";
import { TextField } from "~/components/ui/TextField";
import licenses from "~/generated/licenses.json";
import { color, radius, TOUCH_TARGET } from "~/theme/tokens";

/* ---------------------------------------------------------------------------
   Open-source licences — every package the app ships, generated from its
   dependencies (scripts/licenses.mjs), with each one's licence text.

   Nearly nine hundred rows, so the list is virtualised and searchable. The
   two typefaces are bundled as files rather than packages, so they are
   named here by hand (docs/THIRD_PARTY.md).
--------------------------------------------------------------------------- */

interface Entry {
  name: string;
  version: string;
  license: string;
  author?: string;
  homepage?: string;
  text: number | null;
}

const FONTS: { name: string; license: string; note: string }[] = [
  { name: "General Sans", license: "ITF Free Font License 2.0", note: "Indian Type Foundry, via Fontshare. Used unmodified." },
  { name: "Fustat", license: "SIL Open Font License 1.1", note: "Google Fonts, through @expo-google-fonts/fustat." },
  { name: "DM Serif Display", license: "SIL Open Font License 1.1", note: "Google Fonts. The sign-in headline. Used unmodified." },
];

const PACKAGES = licenses.packages as Entry[];

export default function LicensesScreen() {
  const [query, setQuery] = useState("");
  const [open, setOpen] = useState<Entry | null>(null);
  const sheet = useRef<BottomSheetHandle>(null);

  const shown = useMemo(() => {
    const needle = query.trim().toLowerCase();
    return needle === "" ? PACKAGES : PACKAGES.filter((entry) => entry.name.toLowerCase().includes(needle) || entry.license.toLowerCase().includes(needle));
  }, [query]);

  const text = open?.text === null || open === null ? null : licenses.texts[open.text];

  return (
    <View style={styles.screen}>
      <SheetHeader title="Open-source licences" back closeLabel="Back" />
      <FlatList
        data={shown}
        keyExtractor={(entry) => `${entry.name}@${entry.version}`}
        contentContainerStyle={styles.content}
        keyboardShouldPersistTaps="handled"
        initialNumToRender={20}
        ListHeaderComponent={
          <View style={styles.head}>
            <Text variant="body-sm" tone="secondary">
              Elyra is built with open-source software. Thank you to everyone who makes it. Tap a package for its licence.
            </Text>
            <View style={styles.fonts}>
              {FONTS.map((font) => (
                <View key={font.name} style={styles.font}>
                  <Text>{font.name}</Text>
                  <Text variant="label" tone="secondary">
                    {font.license}
                  </Text>
                  <Text variant="label" tone="muted">
                    {font.note}
                  </Text>
                </View>
              ))}
            </View>
            <TextField label={`Search ${PACKAGES.length} packages`} value={query} onChangeText={setQuery} autoCapitalize="none" autoCorrect={false} placeholder="Name or licence" />
            {shown.length === 0 && (
              <Text variant="body-sm" tone="muted">
                No package matches “{query.trim()}”.
              </Text>
            )}
          </View>
        }
        renderItem={({ item }) => (
          <Pressable
            onPress={() => {
              setOpen(item);
              sheet.current?.present();
            }}
            accessibilityRole="button"
            accessibilityLabel={`${item.name} ${item.version}, ${item.license}`}
            android_ripple={{ color: color["surface-hover"] }}
            style={styles.row}
          >
            <View style={styles.flex}>
              <Text variant="data" numberOfLines={1} maxFontSizeMultiplier={1.4}>
                {item.name}
              </Text>
              <Text variant="label" tone="muted" numberOfLines={1} maxFontSizeMultiplier={1.4}>
                {item.version} · {item.license}
              </Text>
            </View>
            <ChevronRight size={16} strokeWidth={1.5} color={color["text-muted"]} />
          </Pressable>
        )}
      />
      <BottomSheet ref={sheet} title={open === null ? "Licence" : `${open.name} ${open.version}`} onDismiss={() => setOpen(null)}>
        {open !== null && (
          <View style={styles.sheet}>
            <Text variant="label" tone="secondary">
              {open.license}
              {open.author ? ` · ${open.author}` : ""}
            </Text>
            {open.homepage !== undefined && (
              <Button label="Project page" size="sm" variant="ghost" onPress={() => void Linking.openURL(open.homepage as string)} />
            )}
            <Text variant="body-sm" tone="secondary" selectable>
              {text ?? `This package ships no licence file. Its manifest declares ${open.license}.`}
            </Text>
          </View>
        )}
      </BottomSheet>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: color["surface-base"] },
  content: { padding: 16, paddingBottom: 32 },
  head: { gap: 12, paddingBottom: 12 },
  fonts: {
    borderRadius: radius.panel,
    borderWidth: 1,
    borderColor: color["border-subtle"],
    backgroundColor: color["surface-panel"],
    padding: 16,
    gap: 12,
  },
  font: { gap: 2 },
  flex: { flex: 1, minWidth: 0 },
  row: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    minHeight: TOUCH_TARGET + 4,
    borderBottomWidth: StyleSheet.hairlineWidth * 2,
    borderBottomColor: color["border-subtle"],
  },
  sheet: { paddingHorizontal: 16, paddingBottom: 16, gap: 8 },
});
