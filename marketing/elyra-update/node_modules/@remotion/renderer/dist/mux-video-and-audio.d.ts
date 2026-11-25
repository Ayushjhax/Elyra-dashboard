import type { LogLevel } from './log-level';
import type { CancelSignal } from './make-cancel-signal';
import type { AudioCodec } from './options/audio-codec';
export declare const muxVideoAndAudio: ({ videoOutput, audioOutput, output, indent, logLevel, onProgress, binariesDirectory, fps, cancelSignal, metadata, numberOfGifLoops, audioCodec, sampleRate, }: {
    videoOutput: string | null;
    audioOutput: string | null;
    output: string;
    indent: boolean;
    logLevel: LogLevel;
    binariesDirectory: string | null;
    fps: number;
    onProgress: (p: number) => void;
    cancelSignal: CancelSignal | undefined;
    metadata?: Record<string, string> | null;
    numberOfGifLoops: number | null;
    audioCodec: AudioCodec | null;
    sampleRate: number;
}) => Promise<void>;
