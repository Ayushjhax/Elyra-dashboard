import type { BundlerName } from './override-types';
export declare const shouldUseReactDomClient: boolean;
export declare const transformersImportMetaWarning: {
    module: RegExp;
    message: RegExp;
};
export declare const getResolveConfig: () => {
    extensions: string[];
    alias: {
        'react/jsx-runtime': string;
        'react/jsx-dev-runtime': string;
        react: string;
        'remotion/no-react': string;
        'remotion/version': string;
        remotion: string;
        'react-dom/client': string;
    };
};
export declare const getOutputConfig: (environment: 'development' | 'production') => {
    hashFunction: 'xxhash64';
    filename: string;
    devtoolModuleFilenameTemplate: string;
    assetModuleFilename: string;
};
export declare const getBaseConfig: (environment: 'development' | 'production', poll: number | null, bundler: BundlerName) => {
    optimization: {
        minimize: boolean;
    };
    lazyCompilation: boolean | {
        entries: boolean;
    };
    watchOptions: {
        poll: number | undefined;
        aggregateTimeout: number;
        ignored: RegExp;
    };
    devtool: "cheap-module-source-map" | "source-map";
} | {
    optimization: {
        minimize: boolean;
    };
    experiments: {
        lazyCompilation: boolean | {
            entries: boolean;
        };
    };
    watchOptions: {
        poll: number | undefined;
        aggregateTimeout: number;
        ignored: RegExp;
    };
    devtool: "cheap-module-source-map" | "source-map";
};
export declare const getSharedModuleRules: () => ({
    test: RegExp;
    use: (string | {
        loader: string;
        options: {
            modules: {
                auto: boolean;
                namedExport: boolean;
            };
        };
    })[];
    type: 'javascript/auto';
} | {
    use?: undefined;
    test: RegExp;
    type: 'asset/resource';
})[];
export declare const computeHashAndFinalConfig: <T extends {
    output?: any;
}>(conf: T, options: {
    bundler: BundlerName;
    enableCaching: boolean;
    environment: 'development' | 'production';
    outDir: string | null;
    remotionRoot: string;
}) => [string, T];
