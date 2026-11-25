import type { WaveformVolume } from './draw-peaks';
export declare const getVisibleWaveformVolume: ({ displayDurationInFrames, displayOffsetInFrames, volume, }: {
    readonly displayDurationInFrames: number;
    readonly displayOffsetInFrames: number;
    readonly volume: WaveformVolume;
}) => WaveformVolume;
