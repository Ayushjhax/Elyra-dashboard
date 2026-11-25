/**
 * Utility to check if error is network error
 * @param error
 * @returns
 */
export declare function isNetworkError(error: Error): boolean;
export declare function isUnsupportedConfigurationError(error: Error): boolean;
/**
 * Browsers (at least Chromium) close codecs that have been idle for a long time
 * and report "QuotaExceededError: Codec reclaimed due to inactivity."
 * Mirrors Mediabunny's internal `isCodecReclaimedError`, which is not exported.
 * `QuotaExceededError` alone is also used for genuine quota failures.
 */
export declare function isCodecReclaimedError(error: unknown): boolean;
