import type { Codec } from './codec';
export declare const validPixelFormats: readonly ['yuv420p', 'yuva420p', 'yuv422p', 'yuv444p', 'yuv420p10le', 'yuv422p10le', 'yuv444p10le', 'yuva444p10le'];
export type PixelFormat = (typeof validPixelFormats)[number];
export declare const DEFAULT_PIXEL_FORMAT: PixelFormat;
export declare const validPixelFormatsForCodec: (codec: Codec) => ("yuv420p" | "yuv420p10le" | "yuv422p" | "yuv422p10le" | "yuv444p" | "yuv444p10le" | "yuva444p10le")[] | readonly ["yuv420p", "yuva420p", "yuv422p", "yuv444p", "yuv420p10le", "yuv422p10le", "yuv444p10le", "yuva444p10le"];
export declare const validateSelectedPixelFormatAndCodecCombination: (pixelFormat: PixelFormat | undefined, codec: Codec) => undefined;
