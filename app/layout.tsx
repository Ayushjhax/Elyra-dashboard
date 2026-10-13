import type { Metadata, Viewport } from "next";
import localFont from "next/font/local";
import { PrivyClientProvider } from "@/components/providers/PrivyClientProvider";
import { AppShell } from "@/components/shell/AppShell";
import { THEME_COLOR_INK } from "@/lib/brand";
import "./globals.css";

/* Primary — Fustat. Display, headings, nav labels, large numerics. */
const fustat = localFont({
  src: "./fonts/Fustat-Latin-Variable.woff2",
  weight: "400 700",
  display: "swap",
  variable: "--font-fustat",
});

/* Secondary — General Sans. Body, UI, tables, inputs, captions.
   Self-hosted from Fontshare so the app makes no third-party font request. */
const generalSans = localFont({
  src: "./fonts/GeneralSans-Variable.woff2",
  weight: "200 700",
  display: "swap",
  variable: "--font-general-sans",
});

/**
 * Figures.
 *
 * The brand asks for General Sans on data and for tabular figures on every
 * number that can change — but General Sans ships no `tnum` feature in any of
 * its builds, so its digits are proportional and columns drift as prices tick.
 * Fustat's figures are genuinely tabular, so this face serves Fustat for the
 * digits alone, via unicode-range, and General Sans still draws every letter
 * and every mark. Both faces are the brand's own.
 */
const figures = localFont({
  src: "./fonts/Fustat-Latin-Variable.woff2",
  weight: "400 700",
  display: "swap",
  variable: "--font-figures",
  declarations: [
    {
      prop: "unicode-range",
      /* Digits and the signs that flip on them — nothing else. Separators and
         currency marks stay in General Sans: they are constant within a
         format, so they cannot shift a column, and claiming them here would
         put a tabular gap into prose like "Liq. Price". */
      value: "U+0030-0039, U+002B, U+002D, U+2212",
    },
  ],
});

export const metadata: Metadata = {
  title: "Elyra — Agentic trading terminal",
  description:
    "An operator's terminal with an agent in it. Markets, positions, signals and automation in one screen.",
};

export const viewport: Viewport = {
  themeColor: THEME_COLOR_INK,
  colorScheme: "dark",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html
      lang="en"
      className={`dark ${fustat.variable} ${generalSans.variable} ${figures.variable}`}
      suppressHydrationWarning
    >
      <body>
        {/* The shell is the layout, not the page. Mounting it here is what
            keeps the chart, the widgets and the agent alive across a
            navigation — every route renders into it, beside the chart or in
            the workspace's place, never by tearing the chart down. */}
        <PrivyClientProvider>
          <AppShell>{children}</AppShell>
        </PrivyClientProvider>
      </body>
    </html>
  );
}
