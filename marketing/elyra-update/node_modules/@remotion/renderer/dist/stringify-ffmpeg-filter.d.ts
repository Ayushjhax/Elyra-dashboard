import type { AssetVolume, MediaAsset } from './assets/types';
import type { LogLevel } from './log-level';
export type FilterWithoutPaddingApplied = ProcessedTrack & {
    filter: string | null;
    actualTrimLeft: number;
};
export type ProcessedTrack = {
    pad_start: string | null;
    pad_end: string | null;
};
export declare const stringifyFfmpegFilter: ({ channels, volume, fps, assetDuration, chunkLengthInSeconds, forSeamlessAacConcatenation, trimLeftOffset, trimRightOffset, asset, indent, logLevel, presentationTimeOffsetInSeconds, sampleRate, }: {
    channels: number;
    volume: AssetVolume;
    fps: number;
    assetDuration: number | null;
    chunkLengthInSeconds: number;
    forSeamlessAacConcatenation: boolean;
    trimLeftOffset: number;
    trimRightOffset: number;
    asset: MediaAsset;
    indent: boolean;
    logLevel: LogLevel;
    presentationTimeOffsetInSeconds: number;
    sampleRate: number;
}) => FilterWithoutPaddingApplied | null;
