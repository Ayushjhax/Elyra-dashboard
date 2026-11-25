"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.enqueueSourceMutation = exports.waitForSourceMutationQueue = exports.getActiveSourceMutationRevision = exports.getLastDispatchedSourceMutationRevision = exports.getSourceMutationRevision = void 0;
let revision = 0;
let lastDispatchedRevision = 0;
let activeRevision = null;
let chain = Promise.resolve();
const getSourceMutationRevision = () => revision;
exports.getSourceMutationRevision = getSourceMutationRevision;
const getLastDispatchedSourceMutationRevision = () => lastDispatchedRevision;
exports.getLastDispatchedSourceMutationRevision = getLastDispatchedSourceMutationRevision;
const getActiveSourceMutationRevision = () => activeRevision;
exports.getActiveSourceMutationRevision = getActiveSourceMutationRevision;
const waitForSourceMutationQueue = () => chain;
exports.waitForSourceMutationQueue = waitForSourceMutationQueue;
// Reserve the revision synchronously, in user action order. A response may finish
// after a newer intent was queued, even though persistence runs serially.
const enqueueSourceMutation = (run, onQueued = null) => {
    const operation = { id: `source-operation-${++revision}`, revision };
    const next = chain.then(async () => {
        lastDispatchedRevision = operation.revision;
        activeRevision = operation.revision;
        try {
            return await run(operation);
        }
        finally {
            activeRevision = null;
        }
    });
    chain = next.then(() => undefined, () => undefined);
    onQueued === null || onQueued === void 0 ? void 0 : onQueued(operation);
    return next;
};
exports.enqueueSourceMutation = enqueueSourceMutation;
