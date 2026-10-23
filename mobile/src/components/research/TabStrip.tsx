import { useEffect, useRef, useState, type ComponentRef } from "react";
import { Pressable, ScrollView, StyleSheet, View, type LayoutChangeEvent, type NativeScrollEvent, type NativeSyntheticEvent } from "react-native";
import Svg, { Defs, LinearGradient, Rect, Stop } from "react-native-svg";
import { Text } from "~/components/ui/Text";
import { color } from "~/theme/tokens";

/* ---------------------------------------------------------------------------
   Research's top tabs: eight names, more than a phone holds in a row.

   The strip scrolls sideways, and an edge fades into the screen's ground
   wherever more tabs sit beyond it — the fade is the cue that the strip
   continues, so it is drawn only on a side that actually has more. The
   selected tab is scrolled into view, so one chosen from a link is never
   hidden off the edge.
--------------------------------------------------------------------------- */

const FADE = 32;

export interface StripTab<T extends string> {
  id: T;
  label: string;
}

function Fade({ side }: { side: "left" | "right" }) {
  const id = `fade-${side}`;
  return (
    <View pointerEvents="none" style={[styles.fade, side === "left" ? styles.left : styles.right]}>
      <Svg width={FADE} height="100%">
        <Defs>
          <LinearGradient id={id} x1={side === "left" ? "1" : "0"} y1="0" x2={side === "left" ? "0" : "1"} y2="0">
            <Stop offset="0" stopColor={color["surface-base"]} stopOpacity={0} />
            <Stop offset="1" stopColor={color["surface-base"]} stopOpacity={1} />
          </LinearGradient>
        </Defs>
        <Rect x="0" y="0" width={FADE} height="100%" fill={`url(#${id})`} />
      </Svg>
    </View>
  );
}

export function TabStrip<T extends string>({
  tabs,
  value,
  onChange,
  label,
}: {
  tabs: readonly StripTab<T>[];
  value: T;
  onChange: (tab: T) => void;
  label: string;
}) {
  const scroll = useRef<ComponentRef<typeof ScrollView>>(null);
  const positions = useRef(new Map<T, { x: number; width: number }>());
  const [width, setWidth] = useState(0);
  const [content, setContent] = useState(0);
  const [offset, setOffset] = useState(0);

  const reveal = (tab: T) => {
    const at = positions.current.get(tab);
    if (at === undefined || width === 0) return;
    if (at.x < offset + FADE) scroll.current?.scrollTo({ x: Math.max(0, at.x - FADE), animated: true });
    else if (at.x + at.width > offset + width - FADE) scroll.current?.scrollTo({ x: at.x + at.width - width + FADE, animated: true });
  };

  /* A tab chosen from outside — a link, a restored route — is brought into view. */
  const revealRef = useRef(reveal);
  useEffect(() => {
    revealRef.current = reveal;
  });
  useEffect(() => {
    revealRef.current(value);
  }, [value, width]);

  const onScroll = (event: NativeSyntheticEvent<NativeScrollEvent>) => setOffset(event.nativeEvent.contentOffset.x);

  return (
    <View style={styles.wrap} onLayout={(event: LayoutChangeEvent) => setWidth(event.nativeEvent.layout.width)}>
      <ScrollView
        ref={scroll}
        horizontal
        showsHorizontalScrollIndicator={false}
        onScroll={onScroll}
        scrollEventThrottle={32}
        onContentSizeChange={(next) => setContent(next)}
        contentContainerStyle={styles.strip}
        accessibilityRole="tablist"
        accessibilityLabel={label}
      >
        {tabs.map((tab) => {
          const selected = tab.id === value;
          return (
            <Pressable
              key={tab.id}
              onLayout={(event) => positions.current.set(tab.id, { x: event.nativeEvent.layout.x, width: event.nativeEvent.layout.width })}
              onPress={() => onChange(tab.id)}
              accessibilityRole="tab"
              accessibilityState={{ selected }}
              style={[styles.tab, selected && styles.tabOn]}
            >
              <Text key={selected ? "on" : "off"} variant="label" tone={selected ? "primary" : "secondary"} numberOfLines={1}>
                {tab.label}
              </Text>
            </Pressable>
          );
        })}
      </ScrollView>
      {offset > 2 && <Fade side="left" />}
      {offset + width < content - 2 && <Fade side="right" />}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { borderBottomWidth: StyleSheet.hairlineWidth * 2, borderBottomColor: color["border-subtle"] },
  strip: { paddingHorizontal: 12 },
  tab: { minHeight: 48, justifyContent: "center", paddingHorizontal: 12, borderBottomWidth: 2, borderBottomColor: "transparent" },
  tabOn: { borderBottomColor: color.accent },
  fade: { position: "absolute", top: 0, bottom: 0, width: FADE },
  left: { left: 0 },
  right: { right: 0 },
});
