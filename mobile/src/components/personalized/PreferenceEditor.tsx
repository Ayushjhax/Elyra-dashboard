import { useState } from "react";
import { ScrollView, View } from "react-native";
import type { MemoryType, PersonalizedMemory } from "@/lib/personalized/types";
import { Button } from "~/components/ui/controls";
import { Text } from "~/components/ui/Text";
import { TextField } from "~/components/ui/TextField";
import { Sheet } from "~/components/personalized/Sheet";
import { removeMemory, writeMemory } from "~/lib/personalized/client";

const FIELDS: Record<
  MemoryType,
  { label: string; hint: string; placeholder: string; numeric?: boolean }
> = {
  concentration_limit: {
    label: "Most in any one asset (%)",
    hint: "Elyra flags when a single asset grows past this share of your portfolio.",
    placeholder: "25",
    numeric: true,
  },
  stablecoin_buffer: {
    label: "Minimum stablecoin reserve (%)",
    hint: "Dry powder to keep before deploying capital.",
    placeholder: "10",
    numeric: true,
  },
  leverage_limit: {
    label: "Highest leverage (×)",
    hint: "The highest multiple Elyra should suggest.",
    placeholder: "3",
    numeric: true,
  },
  preferred_venue: {
    label: "Preferred venue",
    hint: "Where you would rather trade.",
    placeholder: "Hyperliquid",
  },
  watch_symbol: {
    label: "Watch a symbol",
    hint: "Bring it up when it matters to your portfolio.",
    placeholder: "SOL",
  },
  note: {
    label: "Something Elyra should always know",
    hint: "In your words, up to 280 characters.",
    placeholder: "Keep risk modest.",
  },
};
export function PreferenceEditor({
  memory,
  onClose,
}: {
  memory?: PersonalizedMemory;
  onClose: () => void;
}) {
  const [type, setType] = useState<MemoryType>(
    memory?.type ?? "concentration_limit",
  );
  const [value, setValue] = useState(String(memory?.value ?? ""));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const field = FIELDS[type];
  const write = async (remove: boolean) => {
    if (busy) return;
    const raw = value.trim();
    if (
      !remove &&
      (!raw ||
        (field.numeric &&
          (!Number.isFinite(Number(raw)) ||
            Number(raw) < (type === "leverage_limit" ? 1 : 0) ||
            Number(raw) > 100)))
    ) {
      setError(
        field.numeric
          ? `Enter a number between ${type === "leverage_limit" ? 1 : 0} and 100.`
          : "Enter a value.",
      );
      return;
    }
    setBusy(true);
    setError(null);
    try {
      if (remove && memory) await removeMemory(memory.id);
      else
        await writeMemory(type, field.numeric ? Number(raw) : raw, memory?.id);
      onClose();
    } catch (failure) {
      setError(
        failure instanceof Error
          ? failure.message
          : "That preference could not be saved.",
      );
    } finally {
      setBusy(false);
    }
  };
  return (
    <Sheet
      title={memory ? "Edit preference" : "Add a preference"}
      onClose={onClose}
    >
      <ScrollView
        keyboardShouldPersistTaps="handled"
        contentContainerStyle={{ gap: 16 }}
      >
        {!memory && (
          <View style={{ gap: 8 }}>
            <Text variant="label" tone="secondary">
              Preference type
            </Text>
            {(Object.keys(FIELDS) as MemoryType[]).map((next) => (
              <Button
                key={next}
                label={`${type === next ? "Selected · " : ""}${FIELDS[next].label}`}
                variant={type === next ? "quiet" : "ghost"}
                disabled={busy}
                onPress={() => {
                  setType(next);
                  setValue("");
                  setError(null);
                }}
              />
            ))}
          </View>
        )}
        <TextField
          label={field.label}
          value={value}
          onChangeText={setValue}
          placeholder={field.placeholder}
          keyboardType={field.numeric ? "decimal-pad" : "default"}
          maxLength={
            type === "note" ? 280 : type === "preferred_venue" ? 40 : 12
          }
          editable={!busy}
          error={error}
        />
        <Text variant="body-sm" tone="secondary">
          {field.hint}
        </Text>
        <Text variant="label" tone="muted">
          Saved only when you choose. Elyra reads these on each question when
          Memory is included.
        </Text>
        <View style={{ gap: 8 }}>
          <Button
            label="Save preference"
            variant="accent"
            loading={busy}
            disabled={busy}
            onPress={() => void write(false)}
          />
          {memory && (
            <Button
              label="Remove preference"
              variant="danger"
              disabled={busy}
              onPress={() => void write(true)}
            />
          )}
        </View>
      </ScrollView>
    </Sheet>
  );
}
