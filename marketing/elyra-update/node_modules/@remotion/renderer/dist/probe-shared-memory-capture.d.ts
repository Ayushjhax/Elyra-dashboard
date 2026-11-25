import type { LogLevel } from './log-level';
import type { ChromiumOptions } from './open-browser';
import type { ChromeMode } from './options/chrome-mode';
export declare const probeSharedMemoryCapture: ({ browserExecutable, chromeMode, chromiumOptions, binariesDirectory, logLevel, }: {
    browserExecutable: string | null;
    chromeMode: ChromeMode;
    chromiumOptions: ChromiumOptions;
    binariesDirectory: string | null;
    logLevel: LogLevel;
}) => Promise<boolean>;
