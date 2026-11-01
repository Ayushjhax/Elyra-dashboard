import React, { useId } from "react";

/* ---------------------------------------------------------------------------
   Directional motion blur. dx/dy are the layer's film-space travel per
   frame; a 180° shutter smears half of that. Below a threshold the filter is
   dropped entirely so settled type and the emblem stay pixel-sharp.
--------------------------------------------------------------------------- */

const SHUTTER = 0.5;
const THRESHOLD = 0.6;
const MAX = 60;

export const DirBlur: React.FC<{
  dx: number;
  dy: number;
  children: React.ReactNode;
  style?: React.CSSProperties;
}> = ({ dx, dy, children, style }) => {
  const raw = useId();
  const id = `mb${raw.replace(/[^a-zA-Z0-9]/g, "")}`;
  const sx = Math.min(MAX, Math.abs(dx) * SHUTTER * 0.42);
  const sy = Math.min(MAX, Math.abs(dy) * SHUTTER * 0.42);
  const active = sx > THRESHOLD || sy > THRESHOLD;
  return (
    <div style={{ position: "absolute", inset: 0, ...(active ? { filter: `url(#${id})` } : null), ...style }}>
      {active && (
        <svg width={0} height={0} style={{ position: "absolute" }} aria-hidden>
          <filter id={id} x="-20%" y="-20%" width="140%" height="140%" colorInterpolationFilters="sRGB">
            <feGaussianBlur stdDeviation={`${sx.toFixed(2)} ${sy.toFixed(2)}`} />
          </filter>
        </svg>
      )}
      {children}
    </div>
  );
};

/** Isotropic depth blur for out-of-focus planes. */
export const depthBlur = (px: number): React.CSSProperties => (px > 0.3 ? { filter: `blur(${px.toFixed(2)}px)` } : {});
