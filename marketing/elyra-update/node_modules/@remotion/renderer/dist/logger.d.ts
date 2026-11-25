import type { LogLevel } from './log-level';
export declare const INDENT_TOKEN: string;
export type LogOptions = {
    indent: boolean;
    logLevel: LogLevel;
};
type VerboseLogOptions = LogOptions & {
    tag?: string;
};
export declare const verboseTag: (str: string) => string;
export declare const secondverboseTag: (str: string) => string;
export declare const Log: {
    formatLogs: (logLevel: LogLevel, options: VerboseLogOptions, args: Parameters<typeof console.log>) => string[];
    trace: (options: VerboseLogOptions, ...args: Parameters<typeof console.log>) => void | boolean;
    verbose: (options: VerboseLogOptions, ...args: Parameters<typeof console.log>) => void | boolean;
    info: (options: LogOptions, ...args: Parameters<typeof console.log>) => void | boolean;
    warn: (options: LogOptions, ...args: Parameters<typeof console.log>) => void | boolean;
    error: (options: VerboseLogOptions, ...args: Parameters<typeof console.log>) => void | boolean;
};
export {};
