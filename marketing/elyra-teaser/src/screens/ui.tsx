import React from "react";
import { Img, staticFile } from "remotion";
import {
  Bell,
  BatteryCharging,
  Bluetooth,
  ChartCandlestick,
  ChartPie,
  CircleUser,
  FileSearch,
  Search,
  Sparkles,
  Vibrate,
  Wifi,
  type LucideIcon,
} from "lucide-react";
import { C, F, radius } from "../theme";

/* ---------------------------------------------------------------------------
   The app's interface, rebuilt in dp for crisp, controllable motion. Every
   measurement is read off the Seeker captures (px ÷ 2.912 = dp) and every
   colour and type role comes from lib/tokens.ts — this is a reconstruction
   of the real shell, not a redesign. Icons are lucide, as in the app.
--------------------------------------------------------------------------- */

type Role = "display" | "price" | "h1" | "h2" | "panel" | "body" | "bodySm" | "label" | "eyebrow" | "data" | "dataSm";

const ROLES: Record<Role, React.CSSProperties> = {
  display: { fontFamily: F.display, fontSize: 32, lineHeight: "36px", fontWeight: 600, letterSpacing: "-0.02em" },
  price: { fontFamily: F.display, fontSize: 26, lineHeight: "30px", fontWeight: 600, letterSpacing: "-0.015em" },
  h1: { fontFamily: F.display, fontSize: 20, lineHeight: "26px", fontWeight: 600, letterSpacing: "-0.01em" },
  h2: { fontFamily: F.display, fontSize: 16, lineHeight: "22px", fontWeight: 600, letterSpacing: "-0.01em" },
  panel: { fontFamily: F.display, fontSize: 14, lineHeight: "18px", fontWeight: 600 },
  body: { fontFamily: F.sans, fontSize: 14, lineHeight: "20px", fontWeight: 400 },
  bodySm: { fontFamily: F.sans, fontSize: 13, lineHeight: "18px", fontWeight: 400 },
  label: { fontFamily: F.sans, fontSize: 12, lineHeight: "16px", fontWeight: 500, letterSpacing: "0.01em" },
  eyebrow: { fontFamily: F.sans, fontSize: 11, lineHeight: "14px", fontWeight: 500, letterSpacing: "0.1em", textTransform: "uppercase" },
  data: { fontFamily: F.sans, fontSize: 13, lineHeight: "18px", fontWeight: 500, fontVariantNumeric: "tabular-nums" },
  dataSm: { fontFamily: F.sans, fontSize: 12, lineHeight: "16px", fontWeight: 500, fontVariantNumeric: "tabular-nums" },
};

const TONES = {
  primary: C.ivory,
  secondary: C.textSecondary,
  muted: C.textMuted,
  accent: C.citron,
  agent: C.lime,
  positive: C.positive,
  negative: C.negative,
  caution: C.caution,
  onAccent: C.onAccent,
} as const;
export type Tone = keyof typeof TONES;

export const T: React.FC<{
  v?: Role;
  tone?: Tone;
  size?: number;
  children: React.ReactNode;
  style?: React.CSSProperties;
}> = ({ v = "body", tone = "primary", size, children, style }) => (
  <div style={{ ...ROLES[v], color: TONES[tone], ...(size ? { fontSize: size, lineHeight: `${Math.round(size * 1.3)}px` } : null), whiteSpace: "nowrap", ...style }}>
    {children}
  </div>
);

/** Serif display line — the app's DM Serif Display deviation (README). */
export const Serif: React.FC<{ size: number; children: React.ReactNode; style?: React.CSSProperties; tone?: Tone }> = ({
  size,
  children,
  style,
  tone = "primary",
}) => (
  <div style={{ fontFamily: F.serif, fontSize: size, lineHeight: `${Math.round(size * 1.12)}px`, color: TONES[tone], whiteSpace: "nowrap", letterSpacing: "-0.005em", ...style }}>
    {children}
  </div>
);

export const Ico: React.FC<{ icon: LucideIcon; size?: number; color?: string; stroke?: number; style?: React.CSSProperties }> = ({
  icon: I,
  size = 18,
  color = C.ivory,
  stroke = 1.5,
  style,
}) => <I size={size} color={color} strokeWidth={stroke} style={{ display: "block", ...style }} />;

export const Abs: React.FC<{ x: number; y: number; w?: number; h?: number; children?: React.ReactNode; style?: React.CSSProperties }> = ({
  x,
  y,
  w,
  h,
  children,
  style,
}) => <div style={{ position: "absolute", left: x, top: y, width: w, height: h, ...style }}>{children}</div>;

/* ------------------------------ shell ------------------------------------ */

export const StatusBar: React.FC<{ time?: string }> = ({ time = "2:41" }) => (
  <>
    <Abs x={22} y={6} style={{ fontFamily: F.sans, fontWeight: 500, fontSize: 14.5, color: C.ivory, letterSpacing: "0.01em" }}>
      {time}
    </Abs>
    <Abs x={300} y={8} style={{ display: "flex", gap: 7, alignItems: "center" }}>
      <Ico icon={Bluetooth} size={13} stroke={2} />
      <Ico icon={Vibrate} size={13} stroke={2} />
      <Ico icon={Wifi} size={14} stroke={2.4} />
      <Ico icon={BatteryCharging} size={15} stroke={2} />
    </Abs>
  </>
);

/** The emblem as the app draws it: the original render, never redrawn or recoloured. */
export const Emblem: React.FC<{ size: number; style?: React.CSSProperties }> = ({ size, style }) => (
  <Img src={staticFile("brand/elyra-emblem.png")} style={{ width: size, height: size, display: "block", ...style }} />
);

const Avatar: React.FC = () => (
  <div
    style={{
      width: 30,
      height: 30,
      borderRadius: 99,
      background: C.ink,
      border: `1.6px solid ${C.moss}`,
      display: "grid",
      gridTemplateColumns: "1fr 1fr",
      gap: 1.6,
      padding: 6.5,
      boxSizing: "border-box",
    }}
  >
    <div style={{ background: C.ivory, borderRadius: "3px 1px 1px 1px" }} />
    <div style={{ background: C.moss, borderRadius: "1px 3px 1px 1px" }} />
    <div style={{ background: C.ivory, borderRadius: "1px 1px 1px 3px" }} />
    <div style={{ background: C.ivory, borderRadius: "1px 1px 3px 1px" }} />
  </div>
);

/** Header: emblem, serif title, search, bell, avatar — over the app's olive fade. */
export const AppHeader: React.FC<{ title?: string; emblemOpacity?: number; titleOpacity?: number }> = ({
  title = "Elyra",
  emblemOpacity = 1,
  titleOpacity = 1,
}) => (
  <>
    <Abs
      x={0}
      y={0}
      w={412}
      h={96}
      style={{
        background: "radial-gradient(ellipse 70% 120% at 30% 0%, rgba(168,180,78,0.16) 0%, rgba(69,112,61,0.07) 45%, rgba(69,112,61,0) 100%)",
      }}
    />
    <Abs x={12} y={44} style={{ opacity: emblemOpacity }}>
      <Emblem size={38} />
    </Abs>
    <Abs x={61} y={44} style={{ opacity: titleOpacity }}>
      <Serif size={29}>{title}</Serif>
    </Abs>
    <Abs x={275} y={54}>
      <Ico icon={Search} size={19} />
    </Abs>
    <Abs x={324} y={54}>
      <Ico icon={Bell} size={19} />
    </Abs>
    <Abs x={368} y={47}>
      <Avatar />
    </Abs>
  </>
);

export const SegTabs: React.FC<{ active: number; labels?: string[]; y?: number }> = ({
  active,
  labels = ["Ask", "Capital", "Signals", "Actions"],
  y = 100,
}) => (
  <Abs
    x={21}
    y={y}
    w={370}
    h={50}
    style={{ background: C.raised, border: `1px solid ${C.border}`, borderRadius: radius.control, boxSizing: "border-box", display: "flex", padding: 3 }}
  >
    {labels.map((l, i) => (
      <div
        key={l}
        style={{
          flex: 1,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          borderRadius: 7,
          background: i === active ? C.hover : "transparent",
          border: i === active ? `1px solid ${C.khaki}` : "1px solid transparent",
          fontFamily: F.sans,
          fontWeight: 500,
          fontSize: 13.5,
          color: i === active ? C.ivory : C.textSecondary,
        }}
      >
        {l}
      </div>
    ))}
  </Abs>
);

const TABS: { label: string; icon: LucideIcon }[] = [
  { label: "Markets", icon: ChartCandlestick },
  { label: "Portfolio", icon: ChartPie },
  { label: "Elyra", icon: Sparkles },
  { label: "Research", icon: FileSearch },
  { label: "Account", icon: CircleUser },
];

export const TabBar: React.FC<{ active: number }> = ({ active }) => (
  <>
    <Abs x={0} y={841} w={412} h={76} style={{ background: C.panel, borderTop: `1px solid ${C.base}` }} />
    {TABS.map((t, i) => {
      const cx = 41 + i * 82.5;
      const col = i === active ? C.citron : C.textSecondary;
      return (
        <Abs key={t.label} x={cx - 40} y={851} w={80} style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 3 }}>
          <Ico icon={t.icon} size={21} color={col} />
          <div style={{ fontFamily: F.sans, fontWeight: 500, fontSize: 12.5, color: col }}>{t.label}</div>
        </Abs>
      );
    })}
    <Abs x={150} y={903} w={112} h={3} style={{ borderRadius: 3, background: C.ivory, opacity: 0.92 }} />
  </>
);

/* ------------------------------ blocks ----------------------------------- */

export const Card: React.FC<{ children: React.ReactNode; style?: React.CSSProperties; raised?: boolean }> = ({ children, style, raised }) => (
  <div
    style={{
      background: raised ? C.raised : C.panel,
      border: `1px solid ${C.border}`,
      borderRadius: radius.card,
      padding: 12,
      boxSizing: "border-box",
      ...style,
    }}
  >
    {children}
  </div>
);

export const Chip: React.FC<{ children: React.ReactNode; style?: React.CSSProperties; active?: boolean }> = ({ children, style, active }) => (
  <div
    style={{
      display: "inline-flex",
      alignItems: "center",
      gap: 5,
      padding: "2px 7px",
      borderRadius: radius.chip,
      border: `1px solid ${active ? C.khaki : C.border}`,
      background: active ? C.hover : "transparent",
      fontFamily: F.sans,
      fontWeight: 500,
      fontSize: 12,
      lineHeight: "16px",
      color: C.textSecondary,
      whiteSpace: "nowrap",
      ...style,
    }}
  >
    {children}
  </div>
);

/** The signature: what the machine wrote carries the lime rail. `rail` 0→1 draws it top-down. */
export const AgentBlock: React.FC<{ children: React.ReactNode; rail?: number; style?: React.CSSProperties; minHeight?: number }> = ({
  children,
  rail = 1,
  style,
  minHeight,
}) => (
  <div
    style={{
      position: "relative",
      background: C.raised,
      borderRadius: `0 ${radius.card}px ${radius.card}px 0`,
      padding: "11px 13px 12px 15px",
      boxSizing: "border-box",
      minHeight,
      ...style,
    }}
  >
    <div style={{ position: "absolute", left: 0, top: 0, width: 3, height: `${Math.max(0, Math.min(1, rail)) * 100}%`, background: C.rail }} />
    {children}
  </div>
);

export const UserBubble: React.FC<{ text: string; style?: React.CSSProperties }> = ({ text, style }) => (
  <div
    style={{
      background: C.hover,
      borderRadius: radius.card,
      padding: "9px 13px",
      fontFamily: F.sans,
      fontSize: 14,
      lineHeight: "20px",
      color: C.ivory,
      whiteSpace: "nowrap",
      ...style,
    }}
  >
    {text}
  </div>
);

/** A real capture, filling the screen at its native aspect ratio. */
export const CaptureScreen: React.FC<{ file: string; opacity?: number }> = ({ file, opacity = 1 }) => (
  <Img
    src={staticFile(`captures/${file}`)}
    style={{ position: "absolute", left: 0, top: 0, width: 412, height: 917, opacity, display: "block" }}
  />
);

/** Touch indicator for an illustrated gesture: a soft ivory disc that presses and lifts. */
export const Touch: React.FC<{ x: number; y: number; t: number }> = ({ x, y, t }) => {
  if (t <= 0 || t >= 1) return null;
  const press = t < 0.45 ? t / 0.45 : 1;
  const lift = t > 0.55 ? (t - 0.55) / 0.45 : 0;
  const r = 20 + press * 4 + lift * 16;
  return (
    <div
      style={{
        position: "absolute",
        left: x - r,
        top: y - r,
        width: r * 2,
        height: r * 2,
        borderRadius: 99,
        background: `rgba(247,248,234,${(0.22 * (1 - lift)).toFixed(3)})`,
        border: `1.5px solid rgba(247,248,234,${(0.55 * (1 - lift)).toFixed(3)})`,
      }}
    />
  );
};
