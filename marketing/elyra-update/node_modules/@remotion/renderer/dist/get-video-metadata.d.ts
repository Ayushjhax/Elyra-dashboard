import type { VideoMetadata } from './compositor/payloads';
import type { LogLevel } from './log-level';
export { VideoMetadata } from './compositor/payloads';
/**
 * @deprecated Use Mediabunny instead: https://www.remotion.dev/docs/mediabunny/metadata
 */
export declare const getVideoMetadata: (videoSource: string, options?: {
    logLevel?: LogLevel;
    binariesDirectory?: string | null;
}) => Promise<VideoMetadata>;
