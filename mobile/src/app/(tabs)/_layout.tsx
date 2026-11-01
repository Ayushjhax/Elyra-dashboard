import { Text } from "react-native";
import { Tabs } from "expo-router";
import { ChartCandlestick, ChartPie, CircleUser, FileSearch, Sparkles } from "lucide-react-native";
import { AppHeader } from "~/components/shell/AppHeader";
import { fontFamily } from "~/theme/fonts";
import { color, type } from "~/theme/tokens";

/* ---------------------------------------------------------------------------
   The five tabs. Elyra — the assistant — sits in the centre. Every tab
   shares the app header; the selected tab is marked in lime, the one colour
   that means "you are here / you can press this".
--------------------------------------------------------------------------- */

const ICON = { size: 22, strokeWidth: 1.5 } as const;

export default function TabsLayout() {
  return (
    <Tabs
      /* Back from an asset returns to the tab it was opened from. */
      backBehavior="history"
      screenOptions={{
        header: ({ options }) => <AppHeader title={options.title ?? "Elyra"} />,
        sceneStyle: { backgroundColor: color["surface-base"] },
        tabBarActiveTintColor: color.accent,
        tabBarInactiveTintColor: color["text-muted"],
        tabBarStyle: { backgroundColor: color["surface-panel"], borderTopColor: color["border-subtle"] },
        /* Five labels share one fixed row, so their growth with the system
           font size is capped (CLAUDE.md: capped on dense rows) — past it,
           "Portfolio" and "Research" no longer fit at 360dp. */
        tabBarLabel: ({ color: tint, children }) => (
          <Text
            numberOfLines={1}
            maxFontSizeMultiplier={1.15}
            style={{ color: tint, fontFamily: fontFamily("sans", 500), fontSize: type.label.size, letterSpacing: type.label.letterSpacing }}
          >
            {children}
          </Text>
        ),
      }}
    >
      <Tabs.Screen
        name="index"
        options={{
          title: "Markets",
          /* Markets carries the brand header and its own serif title. */
          header: () => <AppHeader title="Markets" brand />,
          tabBarIcon: ({ color: tint }) => <ChartCandlestick {...ICON} color={tint} />,
        }}
      />
      <Tabs.Screen
        name="portfolio"
        options={{
          title: "Portfolio",
          header: () => <AppHeader title="Portfolio" brand wordmark="Portfolio" />,
          tabBarIcon: ({ color: tint }) => <ChartPie {...ICON} color={tint} />,
        }}
      />
      <Tabs.Screen
        name="elyra"
        options={{
          title: "Elyra",
          header: () => <AppHeader title="Elyra" brand />,
          tabBarIcon: ({ color: tint }) => <Sparkles {...ICON} color={tint} />,
        }}
      />
      <Tabs.Screen
        name="research"
        options={{
          title: "Research",
          header: () => <AppHeader title="Research" brand wordmark="Research" />,
          tabBarIcon: ({ color: tint }) => <FileSearch {...ICON} color={tint} />,
        }}
      />
      <Tabs.Screen
        name="account"
        options={{
          title: "Account",
          /* The brand header too: the screen carries its own serif title. */
          header: () => <AppHeader title="Account" brand />,
          tabBarIcon: ({ color: tint }) => <CircleUser {...ICON} color={tint} />,
        }}
      />
    </Tabs>
  );
}
