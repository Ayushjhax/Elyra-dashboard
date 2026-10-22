import { useRef, type ReactNode } from "react";
import { ActivityIndicator, Pressable, StyleSheet, View, type PressableProps } from "react-native";
import * as Haptics from "expo-haptics";
import { Check, ChevronDown } from "lucide-react-native";
import { BottomSheet, type BottomSheetHandle } from "~/components/ui/overlays";
import { Text } from "~/components/ui/Text";
import { color, radius, space, TOUCH_TARGET } from "~/theme/tokens";

/* ---------------------------------------------------------------------------
   Controls. A control names its outcome, in sentence case (§6).

   Every pressable is at least a 48dp touch target: a visually small control
   gets its hit area from padding or hitSlop, never by shrinking the target.
   `accent` is the one lime fill — the primary action on a screen — and it is
   flat, as on the website.
--------------------------------------------------------------------------- */

type ButtonVariant = "accent" | "quiet" | "ghost" | "danger";
type ButtonSize = "md" | "sm";

const FILL: Record<ButtonVariant, { background: string; border: string | null; text: "on-accent" | "primary" | "secondary" | "negative" }> = {
  accent: { background: color.accent, border: null, text: "on-accent" },
  quiet: { background: color["surface-raised"], border: color["border-strong"], text: "primary" },
  ghost: { background: "transparent", border: null, text: "secondary" },
  danger: { background: color["surface-raised"], border: color["border-strong"], text: "negative" },
};

export function Button({
  label,
  onPress,
  variant = "quiet",
  size = "md",
  loading = false,
  disabled = false,
  icon,
  accessibilityLabel,
  ...props
}: {
  label: string;
  variant?: ButtonVariant;
  size?: ButtonSize;
  loading?: boolean;
  icon?: ReactNode;
} & Omit<PressableProps, "children" | "style">) {
  const fill = FILL[variant];
  const inactive = disabled || loading;
  const height = size === "md" ? 44 : 36;
  return (
    <Pressable
      {...props}
      onPress={onPress}
      disabled={inactive}
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel ?? label}
      accessibilityState={{ disabled: inactive, busy: loading }}
      hitSlop={(TOUCH_TARGET - height) / 2}
      android_ripple={{ color: color["surface-hover"] }}
      style={({ pressed }) => [
        styles.button,
        {
          height,
          paddingHorizontal: size === "md" ? 16 : 12,
          backgroundColor: inactive && variant === "accent" ? color["surface-raised"] : fill.background,
          borderColor: fill.border ?? "transparent",
          borderWidth: fill.border === null ? 0 : 1,
          opacity: pressed ? 0.85 : 1,
        },
      ]}
    >
      {loading ? <ActivityIndicator size="small" color={color["text-muted"]} /> : icon}
      <Text variant="label" tone={inactive ? "muted" : fill.text}>
        {label}
      </Text>
    </Pressable>
  );
}

/**
 * An icon with a name. The name is required: an icon alone says nothing to
 * a screen reader. The visible icon can be small; the target is always 48dp.
 */
export function IconButton({
  accessibilityLabel,
  onPress,
  children,
  disabled = false,
  ...props
}: {
  accessibilityLabel: string;
  children: ReactNode;
} & Omit<PressableProps, "children" | "style" | "accessibilityLabel">) {
  return (
    <Pressable
      {...props}
      onPress={onPress}
      disabled={disabled}
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel}
      accessibilityState={{ disabled }}
      android_ripple={{ color: color["surface-hover"], borderless: true, radius: TOUCH_TARGET / 2 }}
      style={({ pressed }) => [styles.iconButton, { opacity: disabled ? 0.5 : pressed ? 0.7 : 1 }]}
    >
      {children}
    </Pressable>
  );
}

export interface Choice<T extends string> {
  value: T;
  label: string;
}

/** A few mutually exclusive choices, all visible. The selected one is lime-edged, never lime-filled. */
export function SegmentedControl<T extends string>({
  choices,
  value,
  onChange,
  accessibilityLabel,
}: {
  choices: readonly Choice<T>[];
  value: T;
  onChange: (value: T) => void;
  accessibilityLabel: string;
}) {
  return (
    <View accessibilityRole="tablist" accessibilityLabel={accessibilityLabel} style={styles.segmented}>
      {choices.map((choice) => {
        const selected = choice.value === value;
        return (
          <Pressable
            key={choice.value}
            onPress={() => {
              if (!selected) {
                void Haptics.selectionAsync();
                onChange(choice.value);
              }
            }}
            accessibilityRole="tab"
            accessibilityState={{ selected }}
            style={[styles.segment, selected && styles.segmentSelected]}
          >
            <Text variant="label" tone={selected ? "primary" : "secondary"}>
              {choice.label}
            </Text>
          </Pressable>
        );
      })}
    </View>
  );
}

/**
 * One choice from a longer list: the current value as a control, the list
 * in a bottom sheet — the phone's version of a dropdown.
 */
export function OptionMenu<T extends string>({
  label,
  choices,
  value,
  onChange,
}: {
  /** What is being chosen, e.g. "Market type". */
  label: string;
  choices: readonly Choice<T>[];
  value: T;
  onChange: (value: T) => void;
}) {
  const sheet = useRef<BottomSheetHandle>(null);
  const current = choices.find((choice) => choice.value === value)?.label ?? value;
  return (
    <>
      <Pressable
        onPress={() => sheet.current?.present()}
        accessibilityRole="button"
        accessibilityLabel={`${label}: ${current}`}
        accessibilityHint="Opens the choices"
        style={styles.menuTrigger}
      >
        <Text variant="label">{current}</Text>
        <ChevronDown size={14} strokeWidth={1.5} color={color["text-muted"]} />
      </Pressable>
      <BottomSheet ref={sheet} title={label}>
        {choices.map((choice) => {
          const selected = choice.value === value;
          return (
            <Pressable
              key={choice.value}
              onPress={() => {
                onChange(choice.value);
                sheet.current?.dismiss();
              }}
              accessibilityRole="menuitem"
              accessibilityState={{ selected }}
              style={styles.menuItem}
            >
              <Text variant="body" style={styles.menuItemLabel}>
                {choice.label}
              </Text>
              {selected && <Check size={16} strokeWidth={1.5} color={color.accent} />}
            </Pressable>
          );
        })}
      </BottomSheet>
    </>
  );
}

const styles = StyleSheet.create({
  button: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
    borderRadius: radius.control,
    overflow: "hidden",
  },
  iconButton: {
    width: TOUCH_TARGET,
    height: TOUCH_TARGET,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: radius.pill,
  },
  segmented: {
    flexDirection: "row",
    backgroundColor: color["surface-raised"],
    borderColor: color["border-subtle"],
    borderWidth: 1,
    borderRadius: radius.control,
    padding: 2,
  },
  segment: {
    flex: 1,
    minHeight: 40,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: radius.control - 2,
    borderWidth: 1,
    borderColor: "transparent",
  },
  segmentSelected: { backgroundColor: color["surface-hover"], borderColor: color["border-accent"] },
  menuTrigger: {
    minHeight: TOUCH_TARGET,
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingHorizontal: 12,
    borderRadius: radius.control,
    borderWidth: 1,
    borderColor: color["border-subtle"],
    backgroundColor: color["surface-raised"],
    alignSelf: "flex-start",
  },
  menuItem: {
    minHeight: TOUCH_TARGET + 4,
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: space["pad-panel"],
    borderBottomColor: color["border-subtle"],
    borderBottomWidth: StyleSheet.hairlineWidth * 2,
  },
  menuItemLabel: { flex: 1 },
});
