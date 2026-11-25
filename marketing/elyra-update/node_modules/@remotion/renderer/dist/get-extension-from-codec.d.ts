import type { Codec } from './codec';
import type { FileExtension } from './file-extensions';
import type { AudioCodec } from './options/audio-codec';
export declare const getFileExtensionFromCodec: <T extends Codec>(codec: T, audioCodec: AudioCodec | null) => FileExtension;
export declare const makeFileExtensionMap: () => Record<string, ("aac" | "av1" | "gif" | "h264" | "h264-mkv" | "h264-ts" | "h265" | "mp3" | "prores" | "vp8" | "vp9" | "wav")[]>;
export declare const defaultCodecsForFileExtension: Record<FileExtension, Codec>;
