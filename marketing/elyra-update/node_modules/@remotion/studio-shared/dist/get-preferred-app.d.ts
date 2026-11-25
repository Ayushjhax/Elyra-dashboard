import type { EditorPickerId } from './api-requests';
export declare const preferredFallbackEditorIds: readonly EditorPickerId[];
export declare const getPreferredApp: <App extends {
    id: string;
    nameWithType: string;
}>({ installedApps, configuredId, runningIds, recentlyUsedIds, fallbackIds, }: {
    installedApps: readonly App[];
    configuredId: string | null;
    runningIds: readonly string[];
    recentlyUsedIds: readonly string[];
    fallbackIds: readonly string[];
}) => App | null;
