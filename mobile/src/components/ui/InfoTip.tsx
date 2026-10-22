import { type ReactNode, useRef, useState, type ComponentRef } from "react";
import { Modal, Pressable, StyleSheet, useWindowDimensions, View } from "react-native";
import { Info } from "lucide-react-native";
import { Text } from "~/components/ui/Text";
import { color, popShadow, radius, TOUCH_TARGET } from "~/theme/tokens";

/* ---------------------------------------------------------------------------
   An explanation that opens on a tap — the phone's replacement for every
   tooltip. A phone has no hover, so text that only a hover could reveal
   would be unreachable (CLAUDE.md). The icon is small; its touch target is
   not. A screen reader hears the explanation as the control's hint too.
--------------------------------------------------------------------------- */

const BUBBLE_WIDTH = 260;

export function InfoTip({
  text,
  label = "What this means",
  icon,
}: {
  text: string;
  label?: string;
  /** In place of the info mark — the unverified token's shield, say. */
  icon?: ReactNode;
}) {
  const anchor = useRef<ComponentRef<typeof View>>(null);
  const [position, setPosition] = useState<{ x: number; y: number } | null>(null);
  const { width, height } = useWindowDimensions();

  const open = () => {
    anchor.current?.measureInWindow((x, y, w, h) => setPosition({ x: x + w / 2, y: y + h }));
  };

  /* Centred on the icon, kept on screen, and above it when the icon sits low. */
  const left = position === null ? 0 : Math.min(Math.max(12, position.x - BUBBLE_WIDTH / 2), width - BUBBLE_WIDTH - 12);
  const below = position !== null && position.y < height * 0.7;

  return (
    <>
      <Pressable
        ref={anchor}
        onPress={open}
        hitSlop={(TOUCH_TARGET - 16) / 2}
        accessibilityRole="button"
        accessibilityLabel={label}
        accessibilityHint={text}
        style={styles.icon}
      >
        {icon ?? <Info size={14} strokeWidth={1.5} color={color["text-muted"]} />}
      </Pressable>
      <Modal visible={position !== null} transparent animationType="fade" onRequestClose={() => setPosition(null)}>
        <Pressable style={styles.fill} onPress={() => setPosition(null)} accessibilityLabel="Close" accessibilityRole="button">
          {position !== null && (
            <View
              style={[
                styles.bubble,
                below ? { top: position.y + 6 } : { bottom: height - position.y + 28 },
                { left, width: BUBBLE_WIDTH },
              ]}
            >
              <Text variant="body-sm" tone="secondary">
                {text}
              </Text>
            </View>
          )}
        </Pressable>
      </Modal>
    </>
  );
}

const styles = StyleSheet.create({
  icon: { padding: 1 },
  fill: { flex: 1 },
  bubble: {
    position: "absolute",
    backgroundColor: color["surface-raised"],
    borderColor: color["border-strong"],
    borderWidth: 1,
    borderRadius: radius.card,
    padding: 12,
    ...popShadow,
  },
});
