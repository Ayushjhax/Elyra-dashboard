import React from "react";
import { Composition } from "remotion";
import { Film } from "./Film";
import { FPS, FRAMES, H, W } from "./theme";

export const Root: React.FC = () => (
  <Composition
    id="ElyraLaunch"
    component={Film}
    durationInFrames={FRAMES}
    fps={FPS}
    width={W}
    height={H}
    defaultProps={{ withAudio: true }}
  />
);
