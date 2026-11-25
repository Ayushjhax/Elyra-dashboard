"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.loadModelForJob = void 0;
const loadModelForJob = async ({ isModelCached, loadModel, model, signal, progressSpan, progressStart, updateProgress, }) => {
    signal.throwIfAborted();
    const cached = await isModelCached(model);
    signal.throwIfAborted();
    await loadModel(model, (progress) => {
        signal.throwIfAborted();
        const percentage = progress === null ? '' : ` ${Math.round(progress * 100)}%`;
        updateProgress({
            message: `${cached ? 'Loading' : 'Downloading'} ${model}${percentage}`,
            value: progressStart + (progress !== null && progress !== void 0 ? progress : 0) * progressSpan,
        });
    });
    signal.throwIfAborted();
};
exports.loadModelForJob = loadModelForJob;
