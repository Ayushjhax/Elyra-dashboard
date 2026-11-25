import type { VideoSampleSink, VideoSampleTransformOptions } from 'mediabunny';
export declare const makePrewarmedVideoIteratorCache: (videoSink: VideoSampleSink, timeResolution: number, resize?: VideoSampleTransformOptions | null) => {
    prewarmIteratorForLooping: ({ timeToSeek }: {
        timeToSeek: number;
    }) => void;
    makeIteratorOrUsePrewarmed: (timeToSeek: number) => {
        next: () => import("./canvas-ahead-of-time").CanvasAheadOfTimeNext;
        closeIterator: () => Promise<void>;
    };
    destroy: () => void;
};
export type PrewarmedVideoIteratorCache = ReturnType<typeof makePrewarmedVideoIteratorCache>;
