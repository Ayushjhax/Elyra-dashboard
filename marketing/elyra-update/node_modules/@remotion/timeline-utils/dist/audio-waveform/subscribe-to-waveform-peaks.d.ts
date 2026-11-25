import type { InputAudioTrack } from 'mediabunny';
export declare const subscribeToWaveformPeaks: ({ src, waveformSampleRate, onPeaks, onError, }: {
    readonly src: string | InputAudioTrack;
    readonly waveformSampleRate?: number;
    readonly onPeaks: (peaks: Float32Array, final: boolean, averageVolume: number | null) => void;
    readonly onError: (error: Error) => void;
}) => (() => void);
