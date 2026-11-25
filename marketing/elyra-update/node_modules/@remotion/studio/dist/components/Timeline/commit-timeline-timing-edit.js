"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.commitTimelineTimingEdit = exports.getPendingTimelineTimingEdits = void 0;
const NotificationCenter_1 = require("../Notifications/NotificationCenter");
const save_sequence_prop_1 = require("./save-sequence-prop");
const pending = new Map();
let nextId = 0;
const getPendingTimelineTimingEdits = () => [...pending.values()].map(({ id, operation, nodes }) => ({
    id,
    operation,
    nodes: nodes(),
}));
exports.getPendingTimelineTimingEdits = getPendingTimelineTimingEdits;
const commitTimelineTimingEdit = async ({ preview, changes, movedKeyframes, clientId, operation, undoLabel, redoLabel, }) => {
    var _a, _b;
    const id = nextId++;
    const nodes = [
        ...new Map([
            ...changes,
            ...((_a = movedKeyframes === null || movedKeyframes === void 0 ? void 0 : movedKeyframes.sequenceKeyframes) !== null && _a !== void 0 ? _a : []),
            ...((_b = movedKeyframes === null || movedKeyframes === void 0 ? void 0 : movedKeyframes.effectKeyframes) !== null && _b !== void 0 ? _b : []),
        ].map(({ nodePath }) => [
            JSON.stringify([nodePath.absolutePath, nodePath.nodePath]),
            nodePath,
        ])).values(),
    ];
    pending.set(id, {
        id,
        operation,
        nodes: () => nodes.flatMap((node) => {
            const current = preview.getNodePath(node);
            return current
                ? [{ absolutePath: current.absolutePath, nodePath: current.nodePath }]
                : [];
        }),
    });
    try {
        const resolve = (change) => {
            const nodePath = preview.getNodePath(change.nodePath);
            if (nodePath === null)
                throw new Error('The layer was removed before the edit could be saved.');
            return { ...change, nodePath, fileName: nodePath.absolutePath };
        };
        const response = await (0, save_sequence_prop_1.saveSequencePropsWithResult)({
            addedKeyframes: null,
            changes: changes.map(resolve),
            movedKeyframes: movedKeyframes === null
                ? null
                : {
                    sequenceKeyframes: movedKeyframes.sequenceKeyframes.map(resolve),
                    effectKeyframes: movedKeyframes.effectKeyframes.map(resolve),
                },
            setPropStatuses: preview.setPropStatuses,
            clientId,
            undoLabel,
            redoLabel,
        });
        if (response && !response.canUpdate) {
            throw new Error('The layer could not be updated. Try the edit again.');
        }
        preview.acknowledge(response);
        return { success: true };
    }
    catch (error) {
        preview.fail();
        const cause = error instanceof Error ? error.message : String(error);
        const action = operation === 'move'
            ? 'move clip'
            : operation === 'slip-source'
                ? 'adjust source start'
                : 'resize clip';
        const reason = /^(Failed to fetch|fetch failed|NetworkError when attempting to fetch resource\.?)$/i.test(cause)
            ? `Could not ${action}. Check your connection to Studio and try again.`
            : `Could not ${action}: ${cause}`;
        (0, NotificationCenter_1.showNotification)(reason, 4000);
        return { success: false, reason };
    }
    finally {
        pending.delete(id);
    }
};
exports.commitTimelineTimingEdit = commitTimelineTimingEdit;
