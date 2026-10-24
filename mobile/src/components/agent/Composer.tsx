import { useRef, useState, type ComponentRef } from "react";
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, TextInput, View } from "react-native";
import { Image } from "expo-image";
import { ArrowUpRight, FileText, Image as ImageIcon, Mic, Plus, SendHorizontal, Square, X } from "lucide-react-native";
import { isShortcutDraft, matchingShortcuts, parseShortcut } from "@/lib/agent/shortcuts";
import { suggestionChips } from "@/lib/agent/suggestions";
import { ATTACHMENT_LIMITS, describeSize, type ComposerAttachment } from "@/lib/attachments";
import { Button, IconButton } from "~/components/ui/controls";
import { BottomSheet, Dialog, useToast, type BottomSheetHandle } from "~/components/ui/overlays";
import { Text } from "~/components/ui/Text";
import { ActionRow } from "~/components/wallet/parts";
import { pickFiles, pickImages, type PickResult } from "~/lib/attachments";
import { runShortcut } from "~/lib/shortcuts";
import { useAppStore } from "~/lib/store";
import { useWatchlist } from "~/lib/stores/watchlist";
import { useDictation } from "~/lib/voice";
import { fontFamily } from "~/theme/fonts";
import { color, radius } from "~/theme/tokens";

/* ---------------------------------------------------------------------------
   The composer — the website's, for a thumb.

   The draft and the staged files live in the store, so a half-typed
   question survives a tab switch. Return inserts a new line, as on any
   phone keyboard; the send button sends.

   - Attach opens the system's photo or document picker; each file is
     checked against the shared rules as it is added and staged as a chip
     with a way to take it back.
   - The microphone records, the API writes out what was said, and the words
     go into the draft — never sent by themselves.
   - "/" lists the old chat commands as shortcuts; each opens the screen that
     does the thing, or asks the agent in plain language.
--------------------------------------------------------------------------- */

const COMPOSER_MAX_HEIGHT = 120;

function AttachmentChip({ file, onRemove }: { file: ComposerAttachment; onRemove: () => void }) {
  return (
    <View style={styles.chip}>
      {file.previewUrl ? (
        <Image source={{ uri: file.previewUrl }} contentFit="cover" style={styles.chipThumb} accessibilityIgnoresInvertColors />
      ) : (
        <View style={[styles.chipThumb, styles.chipIcon]}>
          <FileText size={15} strokeWidth={1.5} color={color["text-muted"]} />
        </View>
      )}
      <View style={styles.chipText}>
        <Text variant="label" numberOfLines={1}>
          {file.name}
        </Text>
        <Text variant="data-sm" tone="muted">
          {describeSize(file)}
        </Text>
      </View>
      <IconButton accessibilityLabel={`Remove ${file.name}`} onPress={onRemove}>
        <X size={14} strokeWidth={1.5} color={color["text-muted"]} />
      </IconButton>
    </View>
  );
}

export function Composer({ symbol, onAsk }: { symbol: string; onAsk: (prompt: string) => void }) {
  const draft = useAppStore((state) => state.composerDraft);
  const setDraft = useAppStore((state) => state.setComposerDraft);
  const attachments = useAppStore((state) => state.composerAttachments);
  const addAttachments = useAppStore((state) => state.addComposerAttachments);
  const removeAttachment = useAppStore((state) => state.removeComposerAttachment);
  const pending = useAppStore((state) => state.agentPending);
  const input = useRef<ComponentRef<typeof TextInput>>(null);
  const attachSheet = useRef<BottomSheetHandle>(null);
  const [reading, setReading] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const dictation = useDictation();
  const watchlist = useWatchlist();
  const toast = useToast();

  const recording = dictation.status === "recording";
  const transcribing = dictation.status === "transcribing";
  const shortcuts = isShortcutDraft(draft) ? matchingShortcuts(draft) : [];
  const canSend = (draft.trim().length > 0 || attachments.length > 0) && !pending && !reading && !transcribing && !recording;
  const chips = symbol && draft.length === 0 && attachments.length === 0 ? suggestionChips(symbol) : [];

  const send = (line: string = draft) => {
    if (line.trim().length === 0 && useAppStore.getState().composerAttachments.length === 0) return;
    if (pending) return;
    setNotice(null);
    void runShortcut(parseShortcut(line), line.trim(), {
      watch: (op, value) => (op === "add" ? watchlist.add(value) : watchlist.remove(value)),
      say: (text, tone) => toast(text, tone),
      showHelp: () => {
        setDraft("/");
        input.current?.focus();
      },
    });
  };

  const attach = async (pick: (staged: readonly ComposerAttachment[]) => Promise<PickResult>) => {
    attachSheet.current?.dismiss();
    setReading(true);
    setNotice(null);
    try {
      const { added, errors } = await pick(useAppStore.getState().composerAttachments);
      if (added.length > 0) addAttachments(added);
      setNotice(errors.length > 0 ? errors.join(" ") : null);
    } catch {
      setNotice("The picker could not be opened.");
    } finally {
      setReading(false);
    }
  };

  const voiceLine = recording
    ? `Recording ${Math.floor(dictation.elapsed / 60)}:${String(dictation.elapsed % 60).padStart(2, "0")} — tap the square to stop. Your words go into the box to check before sending.`
    : transcribing
      ? "Writing out your recording…"
      : null;
  const error = dictation.error ?? notice;

  return (
    <View style={styles.wrap}>
      {shortcuts.length > 0 && (
        <ScrollView style={styles.shortcuts} keyboardShouldPersistTaps="always" accessibilityLabel="Shortcuts">
          {shortcuts.map((entry) => (
            <Pressable
              key={entry.command}
              onPress={() => {
                if (entry.example === "") {
                  send(`/${entry.command}`);
                } else {
                  setDraft(`/${entry.command} `);
                  input.current?.focus();
                }
              }}
              accessibilityRole="button"
              accessibilityHint={entry.description}
              android_ripple={{ color: color["surface-hover"] }}
              style={styles.shortcut}
            >
              <Text variant="data">
                /{entry.command}
                {entry.example !== "" && (
                  <Text variant="data" tone="muted">
                    {" "}
                    {entry.example}
                  </Text>
                )}
              </Text>
              <Text variant="label" tone="secondary" numberOfLines={1}>
                {entry.description}
              </Text>
            </Pressable>
          ))}
        </ScrollView>
      )}

      {chips.length > 0 && (
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.chips} keyboardShouldPersistTaps="always" accessibilityLabel="Suggested questions">
          {chips.map((chip) => (
            <Pressable
              key={chip}
              disabled={pending}
              onPress={() => onAsk(chip)}
              accessibilityRole="button"
              hitSlop={6}
              style={({ pressed }) => [styles.suggestion, { opacity: pending ? 0.5 : pressed ? 0.8 : 1 }]}
            >
              <Text variant="label" tone="secondary">
                {chip}
              </Text>
              <ArrowUpRight size={13} strokeWidth={1.5} color={color["text-muted"]} />
            </Pressable>
          ))}
        </ScrollView>
      )}

      <View style={styles.box}>
        {attachments.length > 0 && (
          <View style={styles.staged} accessibilityLabel="Attached files">
            {attachments.map((file) => (
              <AttachmentChip key={file.id} file={file} onRemove={() => removeAttachment(file.id)} />
            ))}
          </View>
        )}
        <View style={styles.line}>
          <IconButton
            accessibilityLabel="Attach an image, PDF or text file"
            disabled={reading || attachments.length >= ATTACHMENT_LIMITS.maxFiles}
            onPress={() => attachSheet.current?.present()}
          >
            {reading ? <ActivityIndicator size="small" color={color["text-muted"]} /> : <Plus size={20} strokeWidth={1.5} color={color["text-secondary"]} />}
          </IconButton>
          <TextInput
            ref={input}
            value={draft}
            onChangeText={setDraft}
            multiline
            submitBehavior="newline"
            maxLength={4000}
            editable={!recording}
            placeholder={pending ? "Elyra is working…" : recording ? "Listening…" : "Ask Elyra · / for shortcuts"}
            placeholderTextColor={color["text-muted"]}
            selectionColor={color.accent}
            accessibilityLabel="Ask Elyra"
            style={styles.input}
          />
          {!dictation.unavailable && (
            <IconButton
              accessibilityLabel={recording ? "Stop recording" : transcribing ? "Writing out your recording" : "Dictate your question"}
              disabled={transcribing}
              onPress={() => void (recording ? dictation.stop() : dictation.start())}
            >
              {transcribing ? (
                <ActivityIndicator size="small" color={color["text-muted"]} />
              ) : recording ? (
                <View style={styles.recording}>
                  <Square size={12} strokeWidth={2} color={color["text-on-accent"]} fill={color["text-on-accent"]} />
                </View>
              ) : (
                <Mic size={19} strokeWidth={1.5} color={color["text-secondary"]} />
              )}
            </IconButton>
          )}
          <IconButton accessibilityLabel="Send" disabled={!canSend} onPress={() => send()}>
            <View style={[styles.send, canSend ? styles.sendOn : null]}>
              <SendHorizontal size={17} strokeWidth={1.5} color={canSend ? color["text-on-accent"] : color["text-muted"]} />
            </View>
          </IconButton>
        </View>
      </View>

      {error !== null && (
        <Text variant="label" tone="negative" accessibilityLiveRegion="polite" style={styles.status}>
          {error}
        </Text>
      )}
      {voiceLine !== null && (
        <Text variant="label" tone="secondary" accessibilityLiveRegion="polite" style={styles.status}>
          {voiceLine}
        </Text>
      )}

      <BottomSheet ref={attachSheet} title="Attach">
        <ActionRow icon={ImageIcon} label="Photo" note="From your photos — scaled to the size Elyra reads" onPress={() => void attach(pickImages)} />
        <ActionRow icon={FileText} label="PDF or text file" note="PDF, CSV, TXT, Markdown or JSON" onPress={() => void attach(pickFiles)} />
        <Text variant="label" tone="muted" style={styles.sheetNote}>
          Up to {ATTACHMENT_LIMITS.maxFiles} files, 3MB together. Files go with this question only and are not stored.
        </Text>
      </BottomSheet>

      <Dialog open={dictation.needsReason} title="Use the microphone?" onClose={dictation.dismissReason}>
        <Text variant="body-sm" tone="secondary">
          Elyra records your question, writes it out and puts the words in the box for you to check. Nothing is sent until you press send, and the recording is not kept.
        </Text>
        <View style={styles.dialogButtons}>
          <Button label="Not now" variant="ghost" onPress={dictation.dismissReason} />
          <Button label="Continue" variant="accent" onPress={() => void dictation.allow()} />
        </View>
      </Dialog>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    gap: 8,
    paddingHorizontal: 12,
    paddingTop: 8,
    paddingBottom: 8,
    borderTopWidth: StyleSheet.hairlineWidth * 2,
    borderTopColor: color["border-subtle"],
    backgroundColor: color["surface-base"],
  },
  shortcuts: {
    maxHeight: 248,
    borderRadius: radius.card,
    borderWidth: 1,
    borderColor: color["border-subtle"],
    backgroundColor: color["surface-panel"],
  },
  shortcut: { minHeight: 48, justifyContent: "center", paddingHorizontal: 12, paddingVertical: 6 },
  chips: { gap: 8 },
  suggestion: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    minHeight: 36,
    paddingHorizontal: 10,
    borderRadius: radius.control,
    borderWidth: 1,
    borderColor: color["border-subtle"],
    backgroundColor: color["surface-raised"],
  },
  box: {
    borderRadius: radius.card,
    borderWidth: 1,
    borderColor: color["border-strong"],
    backgroundColor: color["surface-raised"],
    paddingVertical: 2,
  },
  staged: { flexDirection: "row", flexWrap: "wrap", gap: 6, paddingHorizontal: 8, paddingTop: 6 },
  chip: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    maxWidth: "100%",
    paddingLeft: 4,
    borderRadius: radius.control,
    borderWidth: 1,
    borderColor: color["border-subtle"],
    backgroundColor: color["surface-panel"],
  },
  chipThumb: { width: 32, height: 32, borderRadius: radius.chip },
  chipIcon: { alignItems: "center", justifyContent: "center", backgroundColor: color["surface-hover"] },
  chipText: { flexShrink: 1, maxWidth: 160 },
  line: { flexDirection: "row", alignItems: "flex-end" },
  input: {
    flex: 1,
    minHeight: 48,
    maxHeight: COMPOSER_MAX_HEIGHT,
    paddingTop: 13,
    paddingBottom: 13,
    color: color["text-primary"],
    /* 16, as every field on a touch screen is. */
    fontFamily: fontFamily("sans", 400),
    fontSize: 16,
    lineHeight: 22,
  },
  recording: { width: 28, height: 28, borderRadius: radius.pill, alignItems: "center", justifyContent: "center", backgroundColor: color.accent },
  send: { width: 34, height: 34, borderRadius: radius.control, alignItems: "center", justifyContent: "center" },
  sendOn: { backgroundColor: color.accent },
  status: { paddingHorizontal: 4 },
  sheetNote: { paddingHorizontal: 16, paddingTop: 8 },
  dialogButtons: { flexDirection: "row", justifyContent: "flex-end", gap: 8 },
});
