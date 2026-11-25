"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.useIsRenderJobCancelling = void 0;
const react_1 = require("react");
const use_sync_external_store_1 = require("../../helpers/use-sync-external-store");
const context_1 = require("./context");
const useIsRenderJobCancelling = (jobId) => {
    const { isCancelling, subscribeToCancellation } = (0, react_1.useContext)(context_1.RenderQueueActionsContext);
    const subscribe = (0, react_1.useCallback)((listener) => subscribeToCancellation(jobId, listener), [jobId, subscribeToCancellation]);
    const getSnapshot = (0, react_1.useCallback)(() => isCancelling(jobId), [isCancelling, jobId]);
    return (0, use_sync_external_store_1.useSyncExternalStore)(subscribe, getSnapshot, getSnapshot);
};
exports.useIsRenderJobCancelling = useIsRenderJobCancelling;
