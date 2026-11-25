export declare const logLevels: readonly ['trace', 'verbose', 'info', 'warn', 'error'];
export type LogLevel = (typeof logLevels)[number];
export declare const isEqualOrBelowLogLevel: (currentLevel: LogLevel, level: LogLevel) => boolean;
type Options = {
    logLevel: LogLevel;
    tag: string | null;
};
declare const verbose: (options: Options, ...args: Parameters<typeof console.log>) => void;
declare const trace: (options: Options, ...args: Parameters<typeof console.log>) => void;
declare const info: (options: Options, ...args: Parameters<typeof console.log>) => void;
declare const warn: (options: Options, ...args: Parameters<typeof console.log>) => void;
declare const error: (options: Options, ...args: Parameters<typeof console.log>) => void;
export declare const Log: {
    trace: typeof trace;
    verbose: typeof verbose;
    info: typeof info;
    warn: typeof warn;
    error: typeof error;
};
export {};
