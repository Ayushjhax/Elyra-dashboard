"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.createRenderCancellationStore = void 0;
const NotificationCenter_1 = require("../Notifications/NotificationCenter");
const actions_1 = require("./actions");
const createRenderCancellationStore = ({ getJobs, cancelClientJob, canCancelServerJobs, }) => {
    const pending = new Map();
    const listeners = new Map();
    const getJob = (jobId) => getJobs().find((job) => job.id === jobId);
    const isActive = (job) => (job === null || job === void 0 ? void 0 : job.status) === 'idle' || (job === null || job === void 0 ? void 0 : job.status) === 'running';
    const notify = (jobId) => {
        var _a;
        for (const listener of (_a = listeners.get(jobId)) !== null && _a !== void 0 ? _a : [])
            listener();
    };
    const clear = (jobId, owner) => {
        if (pending.get(jobId) !== owner)
            return;
        pending.delete(jobId);
        notify(jobId);
    };
    const isLocal = (job) => job.type === 'client-still' || job.type === 'client-video';
    const canCancelJob = (jobId) => {
        const job = getJob(jobId);
        return (Boolean(job) &&
            isActive(job) &&
            !pending.has(jobId) &&
            (isLocal(job) || canCancelServerJobs()));
    };
    return {
        getJobs,
        canCancelJob,
        isCancelling: (jobId) => pending.has(jobId) && isActive(getJob(jobId)),
        subscribeToCancellation: (jobId, listener) => {
            var _a;
            const set = (_a = listeners.get(jobId)) !== null && _a !== void 0 ? _a : new Set();
            set.add(listener);
            listeners.set(jobId, set);
            return () => {
                set.delete(listener);
                if (set.size === 0)
                    listeners.delete(jobId);
            };
        },
        reconcile: () => {
            for (const [jobId, owner] of pending)
                if (!isActive(getJob(jobId)))
                    clear(jobId, owner);
        },
        clear: () => {
            for (const [jobId, owner] of pending)
                clear(jobId, owner);
        },
        cancelJob: async (jobId) => {
            const job = getJob(jobId);
            if (!job)
                return { status: 'not-found' };
            if (!isActive(job))
                return { status: 'not-cancellable' };
            if (pending.has(jobId))
                return { status: 'already-pending' };
            if (!canCancelJob(jobId))
                return { status: 'not-cancellable' };
            const owner = {};
            pending.set(jobId, owner);
            notify(jobId);
            try {
                if (isLocal(job))
                    cancelClientJob(jobId);
                else
                    await (0, actions_1.cancelRenderJob)(job);
                // Acknowledgement only means the request was accepted. The queue's
                // authoritative terminal state owns the outcome, including completion.
                if (!isActive(getJob(jobId)))
                    clear(jobId, owner);
                return { status: 'requested' };
            }
            catch (error) {
                const current = pending.get(jobId) === owner;
                clear(jobId, owner);
                if (!current || !isActive(getJob(jobId)))
                    return { status: 'not-cancellable' };
                const reason = error instanceof Error ? error.message : String(error);
                (0, NotificationCenter_1.showNotification)(`Could not cancel job: ${reason}`, 2000);
                return { status: 'error', reason };
            }
        },
    };
};
exports.createRenderCancellationStore = createRenderCancellationStore;
