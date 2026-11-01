import React from "react";
import { Composition } from "remotion";
import { Main } from "./Main";
import timeline from "./config/timeline.json";

export const RemotionRoot: React.FC = () => (
  <Composition
    id="ElyraTeaser"
    component={Main}
    durationInFrames={timeline.totalFrames}
    fps={timeline.fps}
    width={timeline.width}
    height={timeline.height}
  />
);
