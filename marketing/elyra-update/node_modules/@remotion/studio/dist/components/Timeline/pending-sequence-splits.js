"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.observePendingSequenceSplitSourceVersion = exports.reconcilePendingSequenceSplits = exports.acknowledgePendingSequenceSplit = exports.finishPendingSequenceSplit = exports.beginPendingSequenceSplit = exports.useIsSplittingSequence = exports.useAreSequencesSplitting = exports.isSequenceSplitPending = exports.getPendingSequenceSplits = exports.clearPendingSequenceSplits = exports.supersedePendingSequenceSplits = void 0;
const react_1 = require("react");
const rebase_source_request_1 = require("../../helpers/rebase-source-request");
const sequence_node_path_mutations_1 = require("../../helpers/sequence-node-path-mutations");
const use_sync_external_store_1 = require("../../helpers/use-sync-external-store");
const pending = new Set();
const listeners = new Map();
let unsubscribe = null;
let timeline = null;
const sourceFileKey = (fileName) => {
    var _a;
    return (0, rebase_source_request_1.normalizeSourceFileName)(fileName, typeof window === 'undefined' ? '' : ((_a = window.remotion_cwd) !== null && _a !== void 0 ? _a : ''));
};
const keyForNode = (node) => JSON.stringify([node.absolutePath, node.nodePath]);
const publish = (keys) => {
    var _a;
    const callbacks = new Set();
    for (const key of keys)
        for (const callback of (_a = listeners.get(key)) !== null && _a !== void 0 ? _a : [])
            callbacks.add(callback);
    for (const callback of callbacks)
        callback();
};
const remove = (operation) => {
    if (!pending.delete(operation))
        return;
    operation.onFinish();
    publish(operation.keys);
    if (pending.size === 0) {
        unsubscribe === null || unsubscribe === void 0 ? void 0 : unsubscribe();
        unsubscribe = null;
    }
};
const supersedePendingSequenceSplits = (nodes) => {
    for (const operation of [...pending]) {
        if (!nodes.some((node) => operation.targets.some((target) => node.absolutePath === target.absolutePath &&
            (operation.keys.has(keyForNode(node)) ||
                (node.nodePath.at(-1) === 'openingElement' &&
                    node.nodePath
                        .slice(0, -1)
                        .every((part, index) => target.nodePath[index] === part))))))
            continue;
        // A later timing edit owns the preview now. Keep only the in-flight request
        // guard, without waiting for timing that the newer edit has replaced.
        operation.superseded = true;
        if (operation.result)
            remove(operation);
    }
};
exports.supersedePendingSequenceSplits = supersedePendingSequenceSplits;
const clearPendingSequenceSplits = () => {
    for (const operation of [...pending])
        remove(operation);
};
exports.clearPendingSequenceSplits = clearPendingSequenceSplits;
const getPendingSequenceSplits = () => [...pending].flatMap((operation) => operation.targets.map(({ absolutePath, nodePath, splitFrame }) => ({
    absolutePath,
    nodePath,
    splitFrame,
})));
exports.getPendingSequenceSplits = getPendingSequenceSplits;
const isSequenceSplitPending = (nodePathInfo) => {
    const key = keyForNode(nodePathInfo.sequenceSubscriptionKey);
    return [...pending].some((operation) => operation.keys.has(key));
};
exports.isSequenceSplitPending = isSequenceSplitPending;
const useAreSequencesSplitting = (nodes) => {
    const keys = (0, react_1.useMemo)(() => nodes.map((node) => keyForNode(node.sequenceSubscriptionKey)), [nodes]);
    const subscribe = (0, react_1.useCallback)((callback) => {
        for (const key of keys) {
            let set = listeners.get(key);
            if (!set) {
                set = new Set();
                listeners.set(key, set);
            }
            set.add(callback);
        }
        return () => {
            for (const key of keys) {
                const set = listeners.get(key);
                set === null || set === void 0 ? void 0 : set.delete(callback);
                if ((set === null || set === void 0 ? void 0 : set.size) === 0)
                    listeners.delete(key);
            }
        };
    }, [keys]);
    const getSnapshot = (0, react_1.useCallback)(() => [...pending].some((operation) => keys.some((key) => operation.keys.has(key))), [keys]);
    return (0, use_sync_external_store_1.useSyncExternalStore)(subscribe, getSnapshot, getSnapshot);
};
exports.useAreSequencesSplitting = useAreSequencesSplitting;
const useIsSplittingSequence = (node) => {
    const nodes = (0, react_1.useMemo)(() => (node ? [node] : []), [node]);
    return (0, exports.useAreSequencesSplitting)(nodes);
};
exports.useIsSplittingSequence = useIsSplittingSequence;
const remapNodes = (nodes, mutation) => {
    const byFile = new Map(mutation.files.map((file) => {
        const byPath = new Map();
        for (const mapping of file.remappings)
            if (mapping.oldNodePath !== null &&
                !byPath.has(JSON.stringify(mapping.oldNodePath)))
                byPath.set(JSON.stringify(mapping.oldNodePath), mapping.newNodePath);
        return [file.absolutePath, byPath];
    }));
    return nodes.flatMap((node) => {
        const map = byFile.get(node.absolutePath);
        for (let { length } = node.nodePath; length > 0; length--) {
            const key = JSON.stringify(length === node.nodePath.length
                ? node.nodePath
                : [...node.nodePath.slice(0, length), 'openingElement']);
            const mapped = map === null || map === void 0 ? void 0 : map.get(key);
            if (mapped === null)
                return [];
            if (mapped !== undefined)
                return [
                    {
                        ...node,
                        nodePath: length === node.nodePath.length
                            ? mapped
                            : [...mapped.slice(0, -1), ...node.nodePath.slice(length)],
                    },
                ];
        }
        return [node];
    });
};
// A right half can reuse an old sibling's runtime ID and source slot. Require
// the original left to be shortened as well; a refresh event alone is not proof.
const reconcile = () => {
    if (pending.size === 0 || timeline === null)
        return;
    const byPath = new Map(timeline.tracks.flatMap((track) => track.nodePathInfo
        ? [
            [
                keyForNode(track.nodePathInfo.sequenceSubscriptionKey),
                track,
            ],
        ]
        : []));
    for (const operation of [...pending]) {
        if (!operation.result)
            continue;
        if ((operation.compositionId !== null &&
            operation.compositionId !== timeline.compositionId) ||
            operation.targets.length === 0) {
            remove(operation);
            continue;
        }
        if (operation.targets.every((target) => {
            var _a;
            const duration = (_a = byPath.get(keyForNode(target))) === null || _a === void 0 ? void 0 : _a.sequence.duration;
            return (duration !== undefined &&
                Math.abs(duration - target.expectedDuration) <= 1e-9);
        }) &&
            operation.result.nodes.every((node) => byPath.has(keyForNode(node))))
            remove(operation);
    }
};
const beginPendingSequenceSplit = (targets, onFinish) => {
    var _a;
    if (targets.some(({ nodePathInfo }) => (0, exports.isSequenceSplitPending)(nodePathInfo)))
        return null;
    const operation = {
        targets: targets.map(({ nodePathInfo, splitFrame, expectedDuration }) => ({
            absolutePath: nodePathInfo.sequenceSubscriptionKey.absolutePath,
            nodePath: nodePathInfo.sequenceSubscriptionKey.nodePath,
            splitFrame,
            expectedDuration,
        })),
        keys: new Set(targets.map(({ nodePathInfo }) => keyForNode(nodePathInfo.sequenceSubscriptionKey))),
        compositionId: (_a = timeline === null || timeline === void 0 ? void 0 : timeline.compositionId) !== null && _a !== void 0 ? _a : null,
        superseded: false,
        mutations: [],
        receivedSourceVersions: new Map(),
        result: null,
        onFinish,
    };
    pending.add(operation);
    if (unsubscribe === null)
        unsubscribe = (0, sequence_node_path_mutations_1.subscribeToSequenceNodePathMutations)((mutation) => {
            for (const entry of pending) {
                if (entry.result === null)
                    entry.mutations.push(mutation);
                entry.targets = remapNodes(entry.targets, mutation);
                if (entry.result)
                    entry.result.nodes = remapNodes(entry.result.nodes, mutation);
                for (const node of entry.targets)
                    entry.keys.add(keyForNode(node));
                publish(entry.keys);
            }
            reconcile();
        });
    publish(operation.keys);
    return operation;
};
exports.beginPendingSequenceSplit = beginPendingSequenceSplit;
exports.finishPendingSequenceSplit = remove;
const acknowledgePendingSequenceSplit = (operation, mutationId, nodes, sourceVersions) => {
    if (!pending.has(operation))
        return;
    if (operation.superseded ||
        sourceVersions.some(({ absolutePath, sourceVersion }) => {
            const received = operation.receivedSourceVersions.get(sourceFileKey(absolutePath));
            return (sourceVersion !== null &&
                (received === null || received === void 0 ? void 0 : received.sessionId) === sourceVersion.sessionId &&
                received.revision > sourceVersion.revision);
        })) {
        remove(operation);
        return;
    }
    const ownIndex = operation.mutations.findIndex((mutation) => mutation.mutationId === mutationId);
    let currentNodes = nodes;
    if (ownIndex >= 0)
        for (const mutation of operation.mutations.slice(ownIndex + 1))
            currentNodes = remapNodes(currentNodes, mutation);
    operation.result = {
        mutationId,
        nodes: currentNodes,
        sourceVersions: new Map(sourceVersions.map(({ absolutePath, sourceVersion }) => [
            sourceFileKey(absolutePath),
            sourceVersion,
        ])),
    };
    operation.mutations = [];
    operation.receivedSourceVersions.clear();
    reconcile();
};
exports.acknowledgePendingSequenceSplit = acknowledgePendingSequenceSplit;
const reconcilePendingSequenceSplits = (snapshot) => {
    timeline = snapshot;
    reconcile();
};
exports.reconcilePendingSequenceSplits = reconcilePendingSequenceSplits;
// A later source snapshot can replace the split timing before its preview mounts.
// Versions distinguish that edit from delayed notifications for the split itself.
const observePendingSequenceSplitSourceVersion = (absolutePath, sourceVersion) => {
    if (sourceVersion === null || pending.size === 0)
        return;
    const fileKey = sourceFileKey(absolutePath);
    for (const operation of [...pending]) {
        if (!operation.targets.some((target) => sourceFileKey(target.absolutePath) === fileKey))
            continue;
        if (operation.result === null) {
            const previous = operation.receivedSourceVersions.get(fileKey);
            if ((previous === null || previous === void 0 ? void 0 : previous.sessionId) !== sourceVersion.sessionId ||
                previous.revision < sourceVersion.revision)
                operation.receivedSourceVersions.set(fileKey, sourceVersion);
            continue;
        }
        const written = operation.result.sourceVersions.get(fileKey);
        if (written &&
            written.sessionId === sourceVersion.sessionId &&
            sourceVersion.revision > written.revision)
            remove(operation);
    }
};
exports.observePendingSequenceSplitSourceVersion = observePendingSequenceSplitSourceVersion;
