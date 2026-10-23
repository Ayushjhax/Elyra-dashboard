import { forwardRef, type ComponentRef } from "react";
import { StyleSheet, TextInput, View, type TextInputProps } from "react-native";
import { Text } from "~/components/ui/Text";
import { fontFamily } from "~/theme/fonts";
import { color, radius } from "~/theme/tokens";

/* ---------------------------------------------------------------------------
   A text field. 16px, as every field on a touch screen is (CLAUDE.md) — a
   smaller one makes the system zoom in when it takes focus. Labelled for
   screen readers by its visible label; an error is announced with it.
--------------------------------------------------------------------------- */

export const TextField = forwardRef<
  ComponentRef<typeof TextInput>,
  TextInputProps & { label: string; error?: string | null }
>(function TextField({ label, error, style, ...props }, ref) {
  return (
    <View style={styles.wrap}>
      <Text variant="label" tone="secondary">
        {label}
      </Text>
      <TextInput
        ref={ref}
        {...props}
        accessibilityLabel={label}
        accessibilityHint={error ?? undefined}
        placeholderTextColor={color["text-muted"]}
        selectionColor={color.accent}
        style={[styles.input, error ? styles.inputError : null, style]}
      />
      {error ? (
        <Text variant="label" tone="negative" accessibilityLiveRegion="polite">
          {error}
        </Text>
      ) : null}
    </View>
  );
});

const styles = StyleSheet.create({
  wrap: { gap: 6 },
  input: {
    minHeight: 48,
    paddingHorizontal: 14,
    borderRadius: radius.control,
    borderWidth: 1,
    borderColor: color["border-strong"],
    backgroundColor: color["surface-raised"],
    color: color["text-primary"],
    fontFamily: fontFamily("sans", 400),
    fontSize: 16,
  },
  inputError: { borderColor: color.negative },
});
