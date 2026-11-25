import type { Codec } from './codec';
export declare const isAudioCodec: (codec: Codec | undefined | null) => codec is "aac" | "mp3" | "wav";
