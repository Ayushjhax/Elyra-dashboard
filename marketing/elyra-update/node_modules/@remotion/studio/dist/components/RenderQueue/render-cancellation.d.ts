import type { AnyRenderJob } from './context';
export type RenderCancellationResult = {
    status: 'requested' | 'already-pending' | 'not-cancellable' | 'not-found';
} | {
    status: 'error';
    reason: string;
};
export declare const createRenderCancellationStore: ({ getJobs, cancelClientJob, canCancelServerJobs, }: {
    getJobs: () => readonly AnyRenderJob[];
    cancelClientJob: (jobId: string) => void;
    canCancelServerJobs: () => boolean;
}) => {
    getJobs: () => readonly AnyRenderJob[];
    canCancelJob: (jobId: string) => boolean;
    isCancelling: (jobId: string) => boolean;
    subscribeToCancellation: (jobId: string, listener: () => void) => () => void;
    reconcile: () => void;
    clear: () => void;
    cancelJob: (jobId: string) => Promise<RenderCancellationResult>;
};
