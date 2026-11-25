import type { BundlerOverrideFn, RspackConfiguration, RspackOverrideFn } from './override-types';
export type { RspackConfiguration, RspackOverrideFn } from './override-types';
export declare const rspackConfig: ({ entry, userDefinedComponent, outDir, environment, bundlerOverride, rspackOverride, onProgress, enableCaching, remotionRoot, poll, extraPlugins, }: {
    entry: string;
    userDefinedComponent: string;
    outDir: string | null;
    environment: 'development' | 'production';
    bundlerOverride: BundlerOverrideFn;
    rspackOverride: RspackOverrideFn;
    onProgress?: (f: number) => void;
    enableCaching?: boolean;
    remotionRoot: string;
    poll: number | null;
    extraPlugins: any[];
}) => Promise<[string, RspackConfiguration]>;
export declare const createRspackCompiler: (config: RspackConfiguration) => import("@rspack/core").Compiler;
