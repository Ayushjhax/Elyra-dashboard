export declare const sliceWaveformPeaks: ({ durationInFrames, fps, peaks, playbackRate, startFrom, waveformSampleRate, }: {
    readonly peaks: Float32Array;
    readonly startFrom: number;
    readonly durationInFrames: number;
    readonly fps: number;
    readonly playbackRate: number;
    readonly waveformSampleRate?: number;
}) => Float32Array<ArrayBufferLike>;
