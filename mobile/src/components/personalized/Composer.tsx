import { StyleSheet, TextInput, View } from "react-native";
import { SendHorizontal, Sparkle, Square } from "lucide-react-native";
import { WideButton } from "~/components/shell/flow";
import { Text } from "~/components/ui/Text";
import {
  sendPersonalized,
  setDraft,
  stopPersonalized,
  usePersonalizedChat,
} from "~/lib/personalized/client";
import { fontFamily } from "~/theme/fonts";
import { color, radius } from "~/theme/tokens";
export function Composer() {
  const chat = usePersonalizedChat();
  return (
    <View style={styles.composer}>
      <Text variant="body" tone="secondary" style={styles.label}>
        Ask about your capital
      </Text>
      <View style={styles.field}>
        <Sparkle size={22} strokeWidth={1.5} color={color["text-secondary"]} style={styles.icon} />
        <TextInput
          value={chat.draft}
          onChangeText={setDraft}
          multiline
          maxLength={4000}
          placeholder="Ask Elyra…"
          placeholderTextColor={color["text-muted"]}
          selectionColor={color.accent}
          accessibilityLabel="Ask about your capital"
          style={styles.input}
        />
      </View>
      {chat.error && (
        <Text tone="negative" variant="label" accessibilityLiveRegion="polite">
          {chat.error}
        </Text>
      )}
      {chat.pending ? (
        <WideButton label="Stop" variant="outline" leading={Square} onPress={stopPersonalized} />
      ) : (
        <WideButton
          label="Send"
          variant={chat.draft.trim() ? "accent" : "outline"}
          trailing={SendHorizontal}
          disabled={!chat.draft.trim() || chat.opening || chat.openError !== null}
          onPress={() => void sendPersonalized()}
        />
      )}
    </View>
  );
}
const styles = StyleSheet.create({
  label: { fontSize: 15, lineHeight: 20 },
  field: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 12,
    minHeight: 56,
    paddingHorizontal: 16,
    borderRadius: radius.panel,
    borderWidth: 1,
    borderColor: color["border-strong"],
    backgroundColor: color["surface-panel"],
  },
  icon: { marginTop: 16 },
  input: { flex: 1, minWidth: 0, minHeight: 54, maxHeight: 140, paddingVertical: 15, color: color["text-primary"], fontFamily: fontFamily("sans", 400), fontSize: 16, lineHeight: 22 },
  composer: {
    gap: 10,
    paddingHorizontal: 20,
    paddingTop: 12,
    paddingBottom: 10,
    borderTopWidth: 1,
    borderTopColor: color["border-subtle"],
    backgroundColor: color["surface-base"],
  },
});
