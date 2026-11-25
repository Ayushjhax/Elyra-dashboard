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
exports.TimelineTrack = void 0;
const jsx_runtime_1 = require("react/jsx-runtime");
const react_1 = __importStar(require("react"));
const timeline_layout_1 = require("../../helpers/timeline-layout");
const timeline_sequence_hover_1 = require("../../state/timeline-sequence-hover");
const timeline_track_groups_1 = require("./timeline-track-groups");
const TimelineSelection_1 = require("./TimelineSelection");
const TimelineSequence_1 = require("./TimelineSequence");
const TimelineWidthProvider_1 = require("./TimelineWidthProvider");
const emptyConnectedCompositions = [];
const TimelineTrackHighlight = ({ background, }) => {
    const timelineWidth = (0, react_1.useContext)(TimelineWidthProvider_1.TimelineWidthContext);
    return timelineWidth === null ? null : ((0, jsx_runtime_1.jsx)("div", { style: (0, TimelineSelection_1.getTimelineSelectedTrackHighlightStyle)(timelineWidth, background) }));
};
const TimelineTrackUnmemoized = ({ track }) => {
    var _a;
    const { hovered, onPointerEnter, onPointerLeave } = (0, timeline_sequence_hover_1.useTimelineSequenceHover)(track.nodePathInfo);
    const rowHighlightBackground = (0, TimelineSelection_1.useTimelineRowHighlightBackground)(track.nodePathInfo, {
        hovered,
        selectedBackground: TimelineSelection_1.TIMELINE_SELECTED_BACKGROUND,
    });
    const layerStyle = (0, react_1.useMemo)(() => ({
        height: (0, timeline_track_groups_1.getTimelineSequenceHeight)(track.sequence),
        marginBottom: timeline_layout_1.TIMELINE_ITEM_BORDER_BOTTOM,
        position: 'relative',
    }), [track.sequence]);
    return ((0, jsx_runtime_1.jsx)("div", { onPointerEnter: onPointerEnter, onPointerLeave: onPointerLeave, children: (0, jsx_runtime_1.jsxs)("div", { style: layerStyle, children: [rowHighlightBackground ? ((0, jsx_runtime_1.jsx)(TimelineTrackHighlight, { background: rowHighlightBackground })) : null, (0, jsx_runtime_1.jsx)(TimelineSequence_1.TimelineSequence, { s: track.sequence, labelStartFrame: null, cascadedStart: track.cascadedStart, localStart: track.localStart, parentVisibleStart: track.parentVisibleStart, parentVisibleEnd: track.parentVisibleEnd, connectedCompositions: (_a = track.connectedCompositions) !== null && _a !== void 0 ? _a : emptyConnectedCompositions, nodePathInfo: track.nodePathInfo, keyframeDisplayOffset: track.keyframeDisplayOffset, keyframePlaybackRate: track.keyframePlaybackRate, sequenceFrameOffset: track.sequenceFrameOffset })] }) }));
};
exports.TimelineTrack = react_1.default.memo(TimelineTrackUnmemoized);
