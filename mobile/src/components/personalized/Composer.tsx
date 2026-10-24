import { StyleSheet, View } from "react-native";
import { Button } from "~/components/ui/controls";
import { Text } from "~/components/ui/Text";
import { TextField } from "~/components/ui/TextField";
import {
  sendPersonalized,
  setDraft,
  stopPersonalized,
  usePersonalizedChat,
} from "~/lib/personalized/client";
import { color } from "~/theme/tokens";
export function Composer() {
  const chat = usePersonalizedChat();
  return (
    <View style={styles.composer}>
      <TextField
        label="Ask about your capital"
        value={chat.draft}
        onChangeText={setDraft}
        multiline
        maxLength={4000}
        placeholder="Ask Elyra…"
        style={{ maxHeight: 160 }}
      />
      {chat.error && (
        <Text tone="negative" variant="label" accessibilityLiveRegion="polite">
          {chat.error}
        </Text>
      )}
      {chat.pending ? (
        <Button label="Stop" onPress={stopPersonalized} />
      ) : (
        <Button
          label="Send"
          variant="accent"
          disabled={
            !chat.draft.trim() || chat.opening || chat.openError !== null
          }
          onPress={() => void sendPersonalized()}
        />
      )}
    </View>
  );
}
const styles = StyleSheet.create({
  composer: {
    gap: 8,
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderTopWidth: 1,
    borderTopColor: color["border-subtle"],
    backgroundColor: color["surface-base"],
  },
});
