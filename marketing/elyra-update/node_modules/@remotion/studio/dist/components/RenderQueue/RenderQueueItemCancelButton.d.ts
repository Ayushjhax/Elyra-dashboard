import React from 'react';
import type { CaptionJob } from './caption-job-types';
import type { AnyRenderJob } from './context';
import type { VideoMattingJob } from './video-matting-job-types';
export declare const RenderQueueCancelButton: React.FC<{
    readonly job: AnyRenderJob | CaptionJob | VideoMattingJob;
}>;
