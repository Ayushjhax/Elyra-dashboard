import type { WarpPathFn } from './warp-helpers';
export declare const warpPath: (path: string, transformer: WarpPathFn, options?: {
    interpolationThreshold?: number;
}) => string;
export type { WarpPathFn } from './warp-helpers';
