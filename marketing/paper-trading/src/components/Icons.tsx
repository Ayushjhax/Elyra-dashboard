import React from "react";

/* Lucide's own paths (lucide-react 1.37, the website's version), so the
   film's switch carries the same marks as the product's. */

type IconProps = { size?: number; color: string; stroke?: number; style?: React.CSSProperties };

const Svg: React.FC<IconProps & { children: React.ReactNode }> = ({ size = 24, color, stroke = 1.5, style, children }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth={stroke} strokeLinecap="round" strokeLinejoin="round" style={style}>
    {children}
  </svg>
);

export const Zap: React.FC<IconProps> = (p) => (
  <Svg {...p}>
    <path d="M15.914 4a1.5 1.5 0 00-2.474-1.561l-9 9A1.5 1.5 0 005.5 14h4.002a.5.5 0 01.471.666L8.086 20a1.5 1.5 0 002.475 1.56l9-9A1.5 1.5 0 0018.5 10h-3.997a.5.5 0 01-.472-.667z" />
  </Svg>
);

export const Flask: React.FC<IconProps> = (p) => (
  <Svg {...p}>
    <path d="M14 2v6a2 2 0 0 0 .245.96l5.51 10.08A2 2 0 0 1 18 22H6a2 2 0 0 1-1.755-2.96l5.51-10.08A2 2 0 0 0 10 8V2" />
    <path d="M6.453 15h11.094" />
    <path d="M8.5 2h7" />
  </Svg>
);

export const Check: React.FC<IconProps & { draw?: number }> = ({ draw = 1, ...p }) => (
  <Svg {...p}>
    <path d="M20 6 9 17l-5-5" pathLength={1} strokeDasharray={1} strokeDashoffset={1 - draw} />
  </Svg>
);
