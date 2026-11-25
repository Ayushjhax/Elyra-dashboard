"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.getTimelineTransitionRanges = exports.getTimelineTransitionRangesByStart = void 0;
const getTimelineTransitionRangesByStart = (ranges) => {
    const byStart = new Map();
    for (const range of ranges) {
        // Keep the first matching transition, as with an array lookup. NaN must
        // not match itself, even though Map treats NaN keys as equal.
        if (!Number.isNaN(range.from) && !byStart.has(range.from)) {
            byStart.set(range.from, range);
        }
    }
    return byStart;
};
exports.getTimelineTransitionRangesByStart = getTimelineTransitionRangesByStart;
const getTimelineTransitionRanges = (items) => {
    return items
        .filter((item) => { var _a; return ((_a = item.timelineTrack) === null || _a === void 0 ? void 0 : _a.role) === 'transition'; })
        .sort((a, b) => a.from - b.from)
        .map((transition) => ({
        id: transition.id,
        from: transition.from,
        end: transition.from + transition.duration,
    }));
};
exports.getTimelineTransitionRanges = getTimelineTransitionRanges;
