import type { TimelineLoopDisplay } from '../loop-display';
export declare const sliceVisibleWaveformPeaks: ({ displayDurationInFrames, displayOffsetInFrames, durationInFrames, fps, loopDisplay, peaks, playbackRate, startFrom, waveformSampleRate, }: {
    readonly displayDurationInFrames: number;
    readonly displayOffsetInFrames: number;
    readonly durationInFrames: number;
    readonly fps: number;
    readonly loopDisplay: TimelineLoopDisplay | undefined;
    readonly peaks: Float32Array;
    readonly playbackRate: number;
    readonly startFrom: number;
    readonly waveformSampleRate?: number;
}) => Float32Array<ArrayBufferLike>;
