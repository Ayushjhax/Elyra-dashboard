"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.OptimisticSequenceDeletion = exports.usePendingSequenceDeletions = void 0;
const react_1 = require("react");
const use_remotion_environment_js_1 = require("./use-remotion-environment.js");
const use_sync_external_store_js_1 = require("./use-sync-external-store.js");
const deletions = new Map();
const stackToNode = new Map();
const listeners = new Set();
const empty = new Set();
let snapshot = empty;
const keyForNode = (node) => JSON.stringify([node.absolutePath, node.nodePath]);
const publish = (force = false) => {
    const next = new Set([...deletions].filter(([, value]) => value.deleted).map(([key]) => key));
    if (!force &&
        next.size === snapshot.size &&
        [...next].every((key) => snapshot.has(key))) {
        return;
    }
    snapshot = next.size === 0 ? empty : next;
    for (const listener of listeners) {
        listener();
    }
};
const subscribe = (listener) => {
    listeners.add(listener);
    return () => {
        listeners.delete(listener);
    };
};
const usePendingSequenceDeletions = () => {
    const environment = (0, use_remotion_environment_js_1.useRemotionEnvironment)();
    const value = (0, use_sync_external_store_js_1.useSyncExternalStore)(subscribe, () => snapshot, () => empty);
    return environment.isStudio && !environment.isRendering ? value : empty;
};
exports.usePendingSequenceDeletions = usePendingSequenceDeletions;
exports.OptimisticSequenceDeletion = {
    register: (stack, node) => {
        if (stack === null || node === null) {
            return;
        }
        const key = keyForNode(node);
        if (stackToNode.get(stack) === key) {
            return;
        }
        stackToNode.set(stack, key);
        if (snapshot.size > 0) {
            publish(true);
        }
    },
    isDeleted: (node, pending) => node !== null && pending.has(keyForNode(node)),
    isElementDeleted: (element, pending) => {
        if (!(0, react_1.isValidElement)(element)) {
            return false;
        }
        const stack = element.props._remotionInternalStack;
        const key = stack === undefined ? undefined : stackToNode.get(stack);
        return key !== undefined && pending.has(key);
    },
    set: (nodes, revision, deleted) => {
        for (const node of nodes) {
            const key = keyForNode(node);
            const previous = deletions.get(key);
            if (previous && previous.revision > revision) {
                continue;
            }
            deletions.set(key, { id: revision, revision, deleted });
        }
        publish();
    },
    rollback: (nodes, revision) => {
        var _a;
        for (const node of nodes) {
            const key = keyForNode(node);
            if (((_a = deletions.get(key)) === null || _a === void 0 ? void 0 : _a.revision) === revision) {
                deletions.delete(key);
            }
        }
        publish();
    },
    rollbackRevision: (revision) => {
        for (const [key, deletion] of deletions) {
            if (deletion.revision === revision) {
                deletions.delete(key);
            }
        }
        publish();
    },
    remap: (remappings) => {
        const moves = remappings.flatMap((remapping) => {
            const oldKey = keyForNode(remapping.previousNodePath);
            const deletion = deletions.get(oldKey);
            if ((deletion === null || deletion === void 0 ? void 0 : deletion.id) !== remapping.revision) {
                return [];
            }
            const newKey = remapping.nodePath === null ? null : keyForNode(remapping.nodePath);
            return oldKey === newKey ? [] : [{ oldKey, newKey, deletion }];
        });
        if (moves.length === 0) {
            return;
        }
        // Snapshot every source before writing destinations so sibling swaps
        // cannot move a deletion twice. Its current undo/redo intent follows it.
        for (const { oldKey } of moves) {
            deletions.delete(oldKey);
        }
        for (const { newKey, deletion } of moves) {
            if (newKey === null) {
                continue;
            }
            const existing = deletions.get(newKey);
            if (existing && existing.revision > deletion.revision) {
                continue;
            }
            deletions.set(newKey, deletion);
        }
        publish();
    },
    // Undo/redo can only update deletions still represented by the loaded tree.
    // Once source remapping retires them, restoration is handled by HMR.
    restore: (nodes, revision, deleted) => {
        for (const node of nodes) {
            const key = keyForNode(node);
            const previous = deletions.get(key);
            if (previous && previous.revision <= revision) {
                deletions.set(key, { ...previous, revision, deleted });
            }
        }
        publish();
    },
    prepareRetirement: (nodes, dispatchedRevision) => {
        const keys = nodes.map(keyForNode);
        return () => {
            let changed = false;
            for (const key of keys) {
                // An earlier mutation in this refresh can move the queued deletion
                // into this path after retirement was prepared.
                const deletion = deletions.get(key);
                if (deletion !== undefined && deletion.id <= dispatchedRevision) {
                    changed = deletions.delete(key) || changed;
                }
            }
            if (changed) {
                publish();
            }
        };
    },
};
