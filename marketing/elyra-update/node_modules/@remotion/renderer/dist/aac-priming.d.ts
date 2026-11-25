import type { AudioCodec } from './options/audio-codec';
export declare const LIBFDK_AAC_LC_ENCODER_DELAY_IN_SAMPLES = 2048;
export declare const getAacPrimingInputArgs: ({ audioCodec, sampleRate, outputExtension, }: {
    audioCodec: AudioCodec | null;
    sampleRate: number;
    outputExtension: string | null;
}) => string[];
