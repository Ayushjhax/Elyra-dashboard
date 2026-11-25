import type { VideoSampleTransformOptions, WrappedCanvas } from 'mediabunny';
import type { VideoSampleSink } from 'mediabunny';
export type CanvasAheadOfTimeNext = {
    type: 'ready';
    frame: WrappedCanvas | null;
} | {
    type: 'pending';
    wait: () => Promise<WrappedCanvas | null>;
};
type EffectSourceOptions = {
    width: number;
    height: number;
    allowDirectSource: boolean;
};
export declare const releaseStableFrame: (frame: WrappedCanvas | null) => void;
export declare const drawStableFrame: (context: CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D, frame: WrappedCanvas, width: number, height: number) => void;
export declare const getStableEffectSource: (frame: WrappedCanvas, options: EffectSourceOptions) => CanvasImageSource;
export declare const canvasesAheadOfTime: (videoSink: VideoSampleSink, startTimestamp?: number, resize?: VideoSampleTransformOptions | null) => {
    next: () => CanvasAheadOfTimeNext;
    closeIterator: () => Promise<void>;
};
export type CanvasAheadOfTimeIterator = ReturnType<typeof canvasesAheadOfTime>;
export {};
