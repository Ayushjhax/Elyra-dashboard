import React from 'react';
import type { AnyRenderJob } from './context';
export declare const openRenderOutputInFileExplorer: (job: AnyRenderJob) => Promise<void>;
export declare const RenderQueueOpenInFinderItem: React.FC<{
    readonly job: AnyRenderJob;
}>;
