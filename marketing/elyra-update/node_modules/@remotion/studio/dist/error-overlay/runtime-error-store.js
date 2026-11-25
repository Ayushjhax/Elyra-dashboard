"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.clearRecoveredRuntimeErrors = exports.addErrorToOverlay = exports.subscribeToRuntimeErrors = exports.removeErrorFromOverlay = exports.getRuntimeErrors = void 0;
let errors = [];
const listeners = new Set();
const getRuntimeErrors = () => errors;
exports.getRuntimeErrors = getRuntimeErrors;
const removeErrorFromOverlay = (error) => {
    const remaining = errors.filter((record) => record.error !== error);
    if (remaining.length === errors.length) {
        return;
    }
    errors = remaining;
    for (const listener of listeners) {
        listener();
    }
};
exports.removeErrorFromOverlay = removeErrorFromOverlay;
const subscribeToRuntimeErrors = (listener) => {
    listeners.add(listener);
    // Read again after subscribing so errors between render and commit are kept.
    listener();
    return () => {
        listeners.delete(listener);
    };
};
exports.subscribeToRuntimeErrors = subscribeToRuntimeErrors;
const addErrorToOverlay = (error, moduleIds) => {
    var _a;
    var _b;
    const existing = errors.findIndex((candidate) => candidate.error.stack === error.stack &&
        candidate.error.message === error.message);
    const record = {
        error,
        moduleIds: (_b = moduleIds !== null && moduleIds !== void 0 ? moduleIds : (_a = errors[existing]) === null || _a === void 0 ? void 0 : _a.moduleIds) !== null && _b !== void 0 ? _b : null,
    };
    // Replace repeated records too: a repeated error during HMR has not recovered.
    errors =
        existing === -1
            ? [...errors, record]
            : errors.map((previous, index) => index === existing ? record : previous);
    for (const listener of listeners) {
        listener();
    }
};
exports.addErrorToOverlay = addErrorToOverlay;
const clearRecoveredRuntimeErrors = ({ errorsBeforeUpdate, updatedModules, failedModules, moduleMap, reactRefreshFinished, }) => {
    const refreshedProject = reactRefreshFinished &&
        failedModules.size === 0 &&
        updatedModules.some((moduleId) => {
            const name = moduleMap[moduleId] || String(moduleId);
            return ((name.startsWith('./') ||
                name.startsWith('../') ||
                name.startsWith('/') ||
                name.startsWith('src/')) &&
                !name.includes('node_modules/') &&
                !name.includes('!lazy-compilation-proxy'));
        });
    const remaining = errors.filter((record) => {
        if (!errorsBeforeUpdate.includes(record)) {
            return true;
        }
        if (record.moduleIds === null) {
            return !refreshedProject;
        }
        return (!record.moduleIds.some((id) => updatedModules.includes(id)) ||
            record.moduleIds.some((id) => failedModules.has(id)));
    });
    if (remaining.length === errors.length) {
        return;
    }
    errors = remaining;
    for (const listener of listeners) {
        listener();
    }
};
exports.clearRecoveredRuntimeErrors = clearRecoveredRuntimeErrors;
