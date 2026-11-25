import type { WaveformResult } from '../audio-waveform/load-waveform-peaks';
import { type TimelineMediaSource } from '../timeline-media-source';
export declare const readMediaMetadataFromPersistentCache: (src: string) => Promise<unknown>;
export declare const writeMediaMetadataToPersistentCache: ({ src, mediaMetadata, }: {
    readonly src: string;
    readonly mediaMetadata: unknown;
}) => void;
export declare const readWaveformFromPersistentCache: ({ src, waveformSampleRate, }: {
    readonly src: string;
    readonly waveformSampleRate: number;
}) => Promise<WaveformResult | null>;
export declare const writeWaveformToPersistentCache: ({ src, waveformSampleRate, result, }: {
    readonly src: string;
    readonly waveformSampleRate: number;
    readonly result: WaveformResult;
}) => void;
export declare const hydrateThumbnailsFromPersistentCache: ({ src, height, getTimestamps, getTimestampTolerance, }: {
    readonly src: string | TimelineMediaSource;
    readonly height: number;
    readonly getTimestamps: () => number[];
    readonly getTimestampTolerance?: ((timestamp: number) => number) | null;
}) => Promise<void>;
export declare const writeThumbnailToPersistentCache: ({ src, frame, }: {
    readonly src: string | TimelineMediaSource;
    readonly frame: VideoFrame;
}) => void;
