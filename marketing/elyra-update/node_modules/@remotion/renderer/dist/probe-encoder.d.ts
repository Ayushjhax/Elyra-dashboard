import type { OnLog } from './browser/BrowserPage';
import type { Codec } from './codec';
import type { LogLevel } from './log-level';
import type { HardwareAccelerationOption } from './options/hardware-acceleration';
/**
 * Probes FFmpeg to check if a specific encoder is available.
 * Returns true if the encoder is supported, false otherwise.
 */
export declare const probeEncoderAvailability: ({ encoderName, binariesDirectory, indent, logLevel, }: {
    encoderName: string;
    binariesDirectory: string | null;
    indent: boolean;
    logLevel: LogLevel;
}) => boolean;
/**
 * Resolves the effective hardware acceleration setting by probing FFmpeg
 * for encoder availability. If the preferred hw encoder is not available:
 * - `if-possible` mode: falls back to software encoding
 * - `required` mode: throws a clear error
 */
export declare const resolveHardwareAcceleration: ({ codec, hardwareAcceleration, binariesDirectory, indent, logLevel, crf, encodingMaxRate, encodingBufferSize, onLog, }: {
    codec: Codec;
    hardwareAcceleration: HardwareAccelerationOption;
    binariesDirectory: string | null;
    indent: boolean;
    logLevel: LogLevel;
    crf: unknown;
    encodingMaxRate: string | null;
    encodingBufferSize: string | null;
    onLog: OnLog | null;
}) => HardwareAccelerationOption;
