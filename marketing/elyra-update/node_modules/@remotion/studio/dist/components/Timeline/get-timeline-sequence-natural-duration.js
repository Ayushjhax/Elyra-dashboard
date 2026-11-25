"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.getTimelineSequenceNaturalDuration = void 0;
// Returns the full child end in the wrapper's parent clock, independently of
// its current trim. Resizing and the available-content outline share this end.
const getTimelineSequenceNaturalDuration = ({ sequence, sequences, }) => {
    if (!sequence.canInferDuration) {
        return null;
    }
    let ancestor = sequence;
    while (ancestor) {
        if (ancestor.loopDisplay || ancestor.frozenFrame !== null) {
            return null;
        }
        const parentId = ancestor.parent;
        ancestor = sequences.find((candidate) => candidate.id === parentId);
    }
    const children = sequences.filter((child) => child.parent === sequence.id);
    if (children.length === 0 ||
        children.some((child) => child.unclippedDuration === null ||
            child.unclippedDuration === undefined)) {
        return null;
    }
    const duration = Math.max(...children.map((child) => {
        var _a, _b;
        return (child.from -
            ((_a = sequence.trimBefore) !== null && _a !== void 0 ? _a : 0) +
            ((_b = child.unclippedDuration) !== null && _b !== void 0 ? _b : 0)) /
            sequence.sequencePlaybackRate;
    }));
    return Number.isFinite(duration) ? duration : null;
};
exports.getTimelineSequenceNaturalDuration = getTimelineSequenceNaturalDuration;
