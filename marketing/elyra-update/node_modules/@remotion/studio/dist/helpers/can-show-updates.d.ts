import type { PreviewServerConnectionState } from './preview-server-events';
export declare const canShowUpdates: ({ connectionStatus, isBrowserStudio, readOnlyStudio, }: {
    readonly connectionStatus: PreviewServerConnectionState['type'];
    readonly isBrowserStudio: boolean;
    readonly readOnlyStudio: boolean;
}) => boolean;
