import type { ReactNode } from "react";
import { StyleSheet, View } from "react-native";
import { useIsFocused } from "expo-router";
import { useBottomTabBarHeight } from "expo-router/tabs";
import { useReanimatedKeyboardAnimation } from "react-native-keyboard-controller";
import Animated, { useAnimatedStyle } from "react-native-reanimated";
import { Composer } from "~/components/agent/Composer";
import { Conversation } from "~/components/agent/Conversation";
import { ElyraSignals } from "~/components/agent/ElyraSignals";
import { ActionsView } from "~/components/actions/ActionsView";
import { CapitalIntelligence } from "~/components/personalized/CapitalIntelligence";
import { SegmentedControl } from "~/components/ui/controls";
import { sendToAgent } from "~/lib/agentChat";
import { useAppStore, type ElyraTab } from "~/lib/store";
import { useOpenActions } from "~/lib/stores/actions";
import { useSecond } from "~/lib/useClock";
import { color } from "~/theme/tokens";

/* ---------------------------------------------------------------------------
   Elyra — the assistant, in place of a chat bot.

   ASK is the conversation: streamed answers with their sources, files and
   dictation in the composer, "/" for the old commands as shortcuts.
   SIGNALS is Elyra's own read of the markets. ACTIONS is what awaits review
   — the same cards an answer shows inline.

   The conversation lives in the store and the request in lib/agentChat.ts,
   so switching tabs, opening a review card or sending the app to the
   background mid-answer loses nothing.
--------------------------------------------------------------------------- */

/**
 * The chat, lifted by the keyboard. The keyboard covers the tab bar (and the
 * navigation bar under it) first, so the conversation gives up only what the
 * keyboard covers beyond them — frame by frame with the keyboard's own
 * animation. KeyboardAvoidingView measured from the screen's bottom edge
 * and left the composer under the keyboard by the tab bar's height.
 */
function KeyboardLifted({ children }: { children: ReactNode }) {
  const tabBar = useBottomTabBarHeight();
  const keyboard = useReanimatedKeyboardAnimation();
  const lifted = useAnimatedStyle(() => ({ paddingBottom: Math.max(0, -keyboard.height.value - tabBar) }));
  return <Animated.View style={[styles.fill, lifted]}>{children}</Animated.View>;
}

export default function ElyraScreen() {
  const tab = useAppStore((state) => state.agentTab);
  const setTab = useAppStore((state) => state.setAgentTab);
  const setDraft = useAppStore((state) => state.setComposerDraft);
  const messages = useAppStore((state) => state.messages.length);
  const focused = useIsFocused();
  const now = useSecond();
  const open = useOpenActions().actions.filter((entry) => Date.parse(entry.expiresAt) > now).length;

  /* Every way of asking — the composer, a suggestion, a signal card — lands
     on the conversation. */
  const ask = (prompt: string) => {
    setTab("ask");
    void sendToAgent(prompt);
  };

  return (
    <View style={styles.screen}>
      <View style={styles.tabs}>
        <SegmentedControl<ElyraTab>
          accessibilityLabel="Elyra view"
          value={tab}
          onChange={setTab}
          choices={[
            { value: "ask", label: "Ask" },
            { value: "capital-intelligence", label: "Capital" },
            { value: "signals", label: "Signals" },
            { value: "actions", label: open > 0 ? `Actions · ${open}` : "Actions" },
          ]}
        />
      </View>

      {tab === "ask" ? (
        <KeyboardLifted>
          <Conversation onAsk={ask} />
          <Composer onAsk={ask} suggestions={messages > 0} />
        </KeyboardLifted>
      ) : tab === "capital-intelligence" ? (
        <KeyboardLifted><CapitalIntelligence /></KeyboardLifted>
      ) : tab === "signals" ? (
        <ElyraSignals active={focused} onAsk={ask} />
      ) : (
        <ActionsView
          open={open}
          onDraft={(text) => {
            /* A draft to edit — never sent from here. */
            setDraft(text);
            setTab("ask");
          }}
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: color["surface-base"] },
  fill: { flex: 1 },
  tabs: { paddingHorizontal: 20, paddingTop: 8, paddingBottom: 12 },
});
