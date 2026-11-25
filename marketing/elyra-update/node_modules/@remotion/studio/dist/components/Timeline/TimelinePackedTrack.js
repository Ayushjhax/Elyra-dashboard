"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
Object.defineProperty(exports, "__esModule", { value: true });
exports.TimelinePackedTrack = void 0;
const jsx_runtime_1 = require("react/jsx-runtime");
const react_1 = __importStar(require("react"));
const colors_1 = require("../../helpers/colors");
const timeline_layout_1 = require("../../helpers/timeline-layout");
const get_timeline_scene_range_1 = require("./get-timeline-scene-range");
const get_timeline_transition_ranges_1 = require("./get-timeline-transition-ranges");
const timeline_track_groups_1 = require("./timeline-track-groups");
const TimelineSceneRangeContext_1 = require("./TimelineSceneRangeContext");
const TimelineSequence_1 = require("./TimelineSequence");
const use_series_reorder_1 = require("./use-series-reorder");
const noConnectedCompositions = [];
const primaryRowHeight = timeline_track_groups_1.TIMELINE_PACKED_TRACK_HEIGHT + timeline_layout_1.TIMELINE_ITEM_BORDER_BOTTOM;
// Reorder feedback only changes the indicator. Keep each clip's context and
// contents stable while its item, neighbors, and row geometry are unchanged.
const TimelinePackedTrackItem = react_1.default.memo(({ item, previous, next, transitionRangesByStart, top, height }) => {
    var _a, _b, _c;
    var _d;
    const parentSceneRange = (0, react_1.useContext)(TimelineSceneRangeContext_1.TimelineSceneRangeContext);
    return ((0, jsx_runtime_1.jsx)(TimelineSceneRangeContext_1.TimelineSceneRangeContext.Provider, { value: ((_a = item.sequence.timelineTrack) === null || _a === void 0 ? void 0 : _a.role) === 'clip'
            ? (0, get_timeline_scene_range_1.getTimelineSceneRange)({
                sequence: item.sequence,
                transitionRangesByStart,
                previous,
                next,
                // The containing row already clips the parent transition.
                range: parentSceneRange
                    ? {
                        ...parentSceneRange,
                        transitionInEnd: null,
                        transitionOutStart: null,
                    }
                    : null,
            })
            : parentSceneRange, children: (0, jsx_runtime_1.jsx)("div", { "data-timeline-track-item-id": item.sequence.id, style: {
                position: 'absolute',
                zIndex: ((_b = item.sequence.timelineTrack) === null || _b === void 0 ? void 0 : _b.role) === 'transition'
                    ? 1
                    : ((_c = item.sequence.controls) === null || _c === void 0 ? void 0 : _c.componentIdentity) ===
                        'dev.remotion.transitions.TransitionSeries.Sequence'
                        ? undefined
                        : 0,
                top,
                left: 0,
                // The clip supplies its own pixel width. Empty row space must
                // not intercept clicks on other clips or the marquee.
                width: 0,
                height: height - timeline_layout_1.TIMELINE_ITEM_BORDER_BOTTOM,
            }, children: (0, jsx_runtime_1.jsx)(TimelineSequence_1.TimelineSequence, { s: item.sequence, labelStartFrame: null, cascadedStart: item.cascadedStart, localStart: item.localStart, parentVisibleStart: item.parentVisibleStart, parentVisibleEnd: item.parentVisibleEnd, connectedCompositions: (_d = item.connectedCompositions) !== null && _d !== void 0 ? _d : noConnectedCompositions, nodePathInfo: item.nodePathInfo, keyframeDisplayOffset: item.keyframeDisplayOffset, keyframePlaybackRate: item.keyframePlaybackRate, sequenceFrameOffset: item.sequenceFrameOffset }) }) }));
});
const TimelinePackedTrack = ({ track, items, auxiliaryRows, auxiliaryRowOffsets }) => {
    const { dropIndicatorLeft, onClickCapture, onPointerDownCapture } = (0, use_series_reorder_1.useSeriesReorder)(items);
    const previousTransitionRangesRef = (0, react_1.useRef)([]);
    const { rows, transitionRanges } = (0, react_1.useMemo)(() => {
        const clips = items
            .filter((item) => { var _a; return ((_a = item.sequence.timelineTrack) === null || _a === void 0 ? void 0 : _a.role) === 'clip'; })
            .sort((a, b) => a.sequence.from - b.sequence.from);
        const transitions = items
            .filter((item) => { var _a; return ((_a = item.sequence.timelineTrack) === null || _a === void 0 ? void 0 : _a.role) === 'transition'; })
            .sort((a, b) => a.sequence.from - b.sequence.from);
        const nextTransitionRanges = transitions.map(({ sequence }) => ({
            id: sequence.id,
            from: sequence.from,
            end: sequence.from + sequence.duration,
        }));
        const previousTransitionRanges = previousTransitionRangesRef.current;
        // A clip edit need not invalidate the transition context of every sibling.
        const stableTransitionRanges = previousTransitionRanges.length === nextTransitionRanges.length &&
            nextTransitionRanges.every((range, index) => range.id === previousTransitionRanges[index].id &&
                range.from === previousTransitionRanges[index].from &&
                range.end === previousTransitionRanges[index].end)
            ? previousTransitionRanges
            : nextTransitionRanges;
        return {
            rows: [[...clips, ...transitions], ...auxiliaryRows].map((row, index) => ({
                items: row,
                top: index === 0 ? 0 : auxiliaryRowOffsets[index - 1],
                height: index === 0
                    ? primaryRowHeight
                    : timeline_track_groups_1.TIMELINE_PACKED_AUXILIARY_ROW_HEIGHT,
            })),
            transitionRanges: stableTransitionRanges,
        };
    }, [auxiliaryRows, auxiliaryRowOffsets, items]);
    (0, react_1.useLayoutEffect)(() => {
        previousTransitionRangesRef.current = transitionRanges;
    }, [transitionRanges]);
    const transitionRangesByStart = (0, react_1.useMemo)(() => (0, get_timeline_transition_ranges_1.getTimelineTransitionRangesByStart)(transitionRanges), [transitionRanges]);
    return ((0, jsx_runtime_1.jsxs)("div", { "data-timeline-track": track.sequence.displayName, onClickCapture: onClickCapture, onPointerDownCapture: onPointerDownCapture, style: {
            position: 'relative',
            // Keep clip stacking inside the track, below the pinned timeline ruler.
            isolation: 'isolate',
            height: Math.max(primaryRowHeight, ...auxiliaryRowOffsets.map((offset) => offset + timeline_track_groups_1.TIMELINE_PACKED_AUXILIARY_ROW_HEIGHT)),
        }, children: [rows.map((row) => {
                var _a, _b;
                return ((0, jsx_runtime_1.jsx)("div", { "aria-hidden": "true", "data-timeline-track-row": row.top === 0 ? 'clips' : (_b = (_a = row.items[0]) === null || _a === void 0 ? void 0 : _a.sequence.timelineTrack) === null || _b === void 0 ? void 0 : _b.role, style: {
                        position: 'absolute',
                        top: row.top,
                        left: 0,
                        right: 0,
                        height: row.height,
                        borderBottom: `${timeline_layout_1.TIMELINE_ITEM_BORDER_BOTTOM}px solid ${colors_1.TIMELINE_TRACK_SEPARATOR}`,
                        pointerEvents: 'none',
                    } }, row.top));
            }), rows.flatMap((row) => row.items.map((item, index) => {
                var _a, _b, _c;
                var _d;
                return ((0, jsx_runtime_1.jsx)(TimelinePackedTrackItem, { item: item, previous: (_d = (_a = row.items[index - 1]) === null || _a === void 0 ? void 0 : _a.sequence) !== null && _d !== void 0 ? _d : null, next: ((_c = (_b = row.items[index + 1]) === null || _b === void 0 ? void 0 : _b.sequence.timelineTrack) === null || _c === void 0 ? void 0 : _c.role) === 'clip'
                        ? row.items[index + 1].sequence
                        : null, transitionRangesByStart: transitionRangesByStart, top: row.top, height: row.height }, item.sequence.id));
            })), dropIndicatorLeft === null ? null : ((0, jsx_runtime_1.jsx)("div", { "aria-hidden": "true", "data-series-reorder-indicator": true, style: {
                    position: 'absolute',
                    left: dropIndicatorLeft - 6.5,
                    top: 0,
                    height: timeline_track_groups_1.TIMELINE_PACKED_TRACK_HEIGHT,
                    width: 13,
                    background: 'linear-gradient(to right, #00E50000, #00E500 6px, #00E500 7px, #00E50000)',
                    pointerEvents: 'none',
                    zIndex: 2,
                } }))] }));
};
exports.TimelinePackedTrack = TimelinePackedTrack;
