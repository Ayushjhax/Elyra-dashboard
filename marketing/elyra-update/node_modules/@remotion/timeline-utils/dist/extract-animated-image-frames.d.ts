import type { ExtractFramesProps } from './extract-frames';
import type { TimelineMediaSource } from './timeline-media-source';
export declare const extractAnimatedImageFrames: ({ source, timestampsInSeconds, onFrame, signal, }: {
    source: TimelineMediaSource;
    timestampsInSeconds: ExtractFramesProps['timestampsInSeconds'];
    onFrame: (frame: VideoFrame) => void;
    signal: AbortSignal | null;
}) => Promise<void>;
