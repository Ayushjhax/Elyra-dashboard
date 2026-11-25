import { type SetSelectedModalContextType } from '../../state/modals';
import { type AnyRenderJob } from './context';
type RenderRetryFailure = {
    status: 'not-found' | 'not-retryable' | 'unavailable' | 'error';
    reason: string;
};
export type RenderRetryResult = RenderRetryFailure | {
    status: 'opened';
    renderMode: 'server' | 'browser';
    outputName: string;
};
export declare const createRenderRetryActions: ({ getJobs, hasComposition, canOpenServerSettings, setSelectedModal, }: {
    getJobs: () => readonly AnyRenderJob[];
    hasComposition: (compositionId: string) => boolean;
    canOpenServerSettings: () => boolean;
    setSelectedModal: SetSelectedModalContextType['setSelectedModal'];
}) => {
    getRetryState: (jobId: string) => {
        canRetry: boolean;
        reason: string | null;
    };
    openRenderJobSettings: (jobId: string) => RenderRetryResult;
};
export declare const useRenderJobRetry: () => {
    getRetryState: (jobId: string) => {
        canRetry: boolean;
        reason: string | null;
    };
    openRenderJobSettings: (jobId: string) => RenderRetryResult;
};
export {};
