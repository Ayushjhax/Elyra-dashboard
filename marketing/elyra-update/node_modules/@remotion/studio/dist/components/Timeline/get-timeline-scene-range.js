"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.getTimelineSceneRange = void 0;
const getTimelineSceneRange = ({ sequence, previous, next, range, transitionRangesByStart, }) => {
    var _a, _b;
    var _c, _d, _e, _f, _g, _h, _j, _k, _l, _m;
    const sceneEnd = sequence.from + sequence.duration;
    const previousEnd = previous
        ? previous.from + previous.duration
        : sequence.from;
    const incomingTransition = ((_a = sequence.timelineTrack) === null || _a === void 0 ? void 0 : _a.role) === 'clip' && previousEnd > sequence.from
        ? transitionRangesByStart.get(sequence.from)
        : undefined;
    const outgoingTransition = ((_b = sequence.timelineTrack) === null || _b === void 0 ? void 0 : _b.role) === 'clip' &&
        next !== null &&
        next.from < sceneEnd
        ? transitionRangesByStart.get(next.from)
        : undefined;
    const from = Math.max((_c = range === null || range === void 0 ? void 0 : range.from) !== null && _c !== void 0 ? _c : -Infinity, sequence.from, (_d = incomingTransition === null || incomingTransition === void 0 ? void 0 : incomingTransition.from) !== null && _d !== void 0 ? _d : -Infinity);
    const end = Math.min((_e = range === null || range === void 0 ? void 0 : range.end) !== null && _e !== void 0 ? _e : Infinity, sceneEnd, (_f = outgoingTransition === null || outgoingTransition === void 0 ? void 0 : outgoingTransition.end) !== null && _f !== void 0 ? _f : Infinity);
    return {
        from,
        end,
        activeFrom: Math.max((_g = range === null || range === void 0 ? void 0 : range.activeFrom) !== null && _g !== void 0 ? _g : -Infinity, incomingTransition ? (sequence.from + previousEnd) / 2 : sequence.from),
        activeEnd: Math.min((_h = range === null || range === void 0 ? void 0 : range.activeEnd) !== null && _h !== void 0 ? _h : Infinity, outgoingTransition && next ? (next.from + sceneEnd) / 2 : sceneEnd),
        transitionInEnd: incomingTransition
            ? Math.max((_j = range === null || range === void 0 ? void 0 : range.transitionInEnd) !== null && _j !== void 0 ? _j : -Infinity, incomingTransition.end)
            : ((_k = range === null || range === void 0 ? void 0 : range.transitionInEnd) !== null && _k !== void 0 ? _k : null),
        transitionOutStart: outgoingTransition
            ? Math.min((_l = range === null || range === void 0 ? void 0 : range.transitionOutStart) !== null && _l !== void 0 ? _l : Infinity, outgoingTransition.from)
            : ((_m = range === null || range === void 0 ? void 0 : range.transitionOutStart) !== null && _m !== void 0 ? _m : null),
    };
};
exports.getTimelineSceneRange = getTimelineSceneRange;
