import { type StudioElementPayload } from './element-payload';
import type { StudioProtocolFetcher } from './studio-discovery';
export type InstallInStudioErrorCode = 'unsupported-origin' | 'no-compatible-studio' | 'loopback-network-permission-denied' | 'studio-upgrade-required' | 'no-installable-target' | 'unsupported-protocol' | 'invalid-response' | 'target-expired' | 'request-rejected' | 'request-timed-out' | 'network-error';
export type InstallInStudioResult = {
    readonly success: true;
    readonly status: 'awaiting-confirmation';
    readonly target: {
        readonly projectName: string | null;
        /**
         * @deprecated The installation destination is chosen in Studio. Use projectName or studioOrigin to identify the receiving Studio instead.
         */
        readonly compositionId: string | null;
        readonly studioOrigin: string;
        readonly studioVersion: string;
    };
} | {
    readonly success: false;
    readonly code: InstallInStudioErrorCode;
    readonly message: string;
};
type LoopbackPermissionName = 'loopback-network' | 'local-network-access';
type PermissionQueryFn = (descriptor: {
    readonly name: LoopbackPermissionName;
}) => Promise<{
    readonly state: PermissionState;
}>;
export type InstallInStudioDependencies = {
    readonly fetchFn: StudioProtocolFetcher;
    readonly now: () => number;
    readonly ports: readonly number[];
    readonly pageOrigin: string | null;
    readonly permissionQueryFn: PermissionQueryFn | null;
};
export type StudioProtocolInstallRequest = {
    readonly operation: 'install-element';
    readonly protocol: 'remotion-studio-protocol';
    readonly protocolVersion: 1;
    readonly targetId: string;
    readonly payload: StudioElementPayload;
};
export declare const parseStudioProtocolIframeInstallRequest: (value: unknown) => StudioElementPayload | null;
export declare const parseStudioProtocolInstallRequest: (value: unknown) => {
    readonly status: 'valid';
    readonly request: StudioProtocolInstallRequest;
} | {
    readonly status: 'invalid-request' | 'invalid-payload';
};
export declare const isAllowedStudioProtocolPageOrigin: (origin: string | null) => boolean;
export declare const installInStudioWithDependencies: (payload: StudioElementPayload, dependencies: InstallInStudioDependencies, fallbackPayload?: StudioElementPayload | null) => Promise<InstallInStudioResult>;
export declare const installInStudio: ({ payload, fallbackPayload, }: {
    readonly payload: StudioElementPayload;
    readonly fallbackPayload?: StudioElementPayload;
}) => Promise<InstallInStudioResult>;
export {};
