import type { DownloadMap } from './assets/download-map';
import type { InlineAudioTrack } from './assets/inline-audio-mixing';
import type { LogLevel } from './log-level';
import type { CancelSignal } from './make-cancel-signal';
import type { PreprocessedAudioTrack } from './preprocess-audio-track';
export declare const inlineAudioTrackToPreprocessedAudioTrack: ({ track, relativeToInSamples, padToDurationInSamples, }: {
    track: InlineAudioTrack;
    relativeToInSamples: number;
    padToDurationInSamples: number | null;
}) => PreprocessedAudioTrack;
export declare const mergeInlineAudioTracks: ({ tracks, downloadMap, remotionRoot, indent, logLevel, binariesDirectory, cancelSignal, fps, chunkLengthInSeconds, sampleRate, }: {
    tracks: InlineAudioTrack[];
    downloadMap: DownloadMap;
    remotionRoot: string;
    indent: boolean;
    logLevel: LogLevel;
    binariesDirectory: string | null;
    cancelSignal: CancelSignal | undefined;
    fps: number;
    chunkLengthInSeconds: number;
    sampleRate: number;
}) => Promise<InlineAudioTrack | null>;
