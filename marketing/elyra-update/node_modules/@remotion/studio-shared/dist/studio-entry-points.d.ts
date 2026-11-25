export type StudioEntryPointPaths = {
    fastRefreshRuntime: string | null;
    reactScan: string | null;
    environmentSetup: string;
    sequenceStackTraces: string | null;
    studioBootstrap: string | null;
    userDefinedComponent: string;
    reactShim: string;
    studioRenderEntry: string;
};
export declare const getStudioEntryPoints: ({ fastRefreshRuntime, reactScan, environmentSetup, sequenceStackTraces, studioBootstrap, userDefinedComponent, reactShim, studioRenderEntry, }: StudioEntryPointPaths) => [string, ...string[]];
