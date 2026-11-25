import type { LogLevel } from '../log-level';
import type { ChromeMode } from '../options/chrome-mode';
export declare const TESTED_VERSION = "158.0.8127.2";
export type Platform = 'linux64' | 'linux-arm64' | 'mac-x64' | 'mac-arm64' | 'win64';
export declare const isAmazonLinux2023: () => boolean;
export declare const canUseRemotionMediaBinaries: () => boolean;
export declare function getChromeDownloadUrl({ platform, version, chromeMode, }: {
    platform: Platform;
    version: string | null;
    chromeMode: ChromeMode;
}): string;
export declare const logDownloadUrl: ({ url, logLevel, indent, }: {
    url: string;
    logLevel: LogLevel;
    indent: boolean;
}) => void;
