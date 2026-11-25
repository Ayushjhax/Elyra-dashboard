import type { FastStartMuxer } from './get-fast-start-muxer';
import type { LogLevel } from './log-level';
import type { CancelSignal } from './make-cancel-signal';
export declare const finalizeFastStart: ({ input, output, muxer, force, indent, logLevel, binariesDirectory, cancelSignal, }: {
    input: string;
    output: string;
    muxer: FastStartMuxer;
    force: boolean;
    indent: boolean;
    logLevel: LogLevel;
    binariesDirectory: string | null;
    cancelSignal: CancelSignal | null;
}) => Promise<void>;
