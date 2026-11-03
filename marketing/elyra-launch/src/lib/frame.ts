import { createContext, useContext } from "react";
import { useCurrentFrame } from "remotion";

/* Scenes and overlays are written in absolute film frames. Inside a
   <Sequence>, Remotion's frame is local; every Sequence the film opens
   (Shot does this) publishes its start here, so useAbsFrame() is always the
   film frame. */
export const FrameOffset = createContext(0);

export function useAbsFrame(): number {
  return useCurrentFrame() + useContext(FrameOffset);
}
