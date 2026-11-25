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
exports.SequenceActivityBoundary = exports.SequenceActivityContent = void 0;
const jsx_runtime_1 = require("react/jsx-runtime");
const react_1 = __importStar(require("react"));
const sequence_activity_context_js_1 = require("./sequence-activity-context.js");
const TimelineContext_js_1 = require("./TimelineContext.js");
const use_video_config_js_1 = require("./use-video-config.js");
// Resume through the context update, never through a wakeable callback. React
// 19.2 can retry an already unmounted Activity with a null Offscreen stateNode.
// Do not retain retry callbacks either: this token is shared by all activities.
const suspendedActivity = { then: () => undefined };
const SuspendSequenceActivity = ({ children, dormant }) => {
    const suspended = (0, react_1.useContext)(sequence_activity_context_js_1.SequenceActivitySuspensionContext);
    if (dormant && suspended) {
        // The hidden Activity retains its last committed children when suspended,
        // including the metadata used by Studio's timeline registry.
        throw suspendedActivity;
    }
    return children;
};
const areActivityChildrenEqual = (previous, next) => {
    if (Object.is(previous, next)) {
        return true;
    }
    if (Array.isArray(previous) && Array.isArray(next)) {
        return (previous.length === next.length &&
            previous.every((child, index) => areActivityChildrenEqual(child, next[index])));
    }
    if (!react_1.default.isValidElement(previous) ||
        !react_1.default.isValidElement(next) ||
        previous.type !== next.type ||
        previous.key !== next.key) {
        return false;
    }
    const keys = Object.keys(previous.props);
    return (keys.length === Object.keys(next.props).length &&
        keys.every((key) => Object.prototype.hasOwnProperty.call(next.props, key) &&
            (key === 'children'
                ? areActivityChildrenEqual(previous.props.children, next.props.children)
                : Object.is(previous.props[key], next.props[key]))));
};
// Parent frame subscriptions often recreate unchanged JSX. Compare element
// structure and all props instead of ignoring changes to dormant scene props.
exports.SequenceActivityContent = react_1.default.memo(({ children }) => children, (previous, next) => previous.dormant &&
    next.dormant &&
    areActivityChildrenEqual(previous.children, next.children));
const SequenceActivityBoundary = ({ children, dormant, frame }) => {
    const parentDormant = (0, react_1.useContext)(sequence_activity_context_js_1.SequenceActivityDormantContext);
    const timeline = (0, react_1.useContext)(parentDormant ? sequence_activity_context_js_1.SequenceActivityTimelineContext : TimelineContext_js_1.TimelineContext);
    const absoluteTime = (0, react_1.useContext)(parentDormant ? sequence_activity_context_js_1.SequenceActivityAbsoluteTimeContext : TimelineContext_js_1.AbsoluteTimeContext);
    const { id } = (0, use_video_config_js_1.useVideoConfig)();
    if (timeline === null) {
        throw new Error('TimelineContext is missing');
    }
    const { audioAndVideoTags } = timeline;
    const dormantTimeline = (0, react_1.useMemo)(() => ({
        frame: { [id]: frame },
        isPlaying: () => false,
        isInsideFreeze: true,
        audioAndVideoTags,
    }), [audioAndVideoTags, frame, id]);
    // Keep the providers and Activity at the same position when activating a
    // scene. Unlike Freeze, discovery does not reset SequenceContext origins or
    // disable Series duration inference.
    return ((0, jsx_runtime_1.jsx)(sequence_activity_context_js_1.SequenceActivityDormantContext.Provider, { value: dormant, children: (0, jsx_runtime_1.jsx)(sequence_activity_context_js_1.SequenceActivityTimelineContext.Provider, { value: dormant ? dormantTimeline : null, children: (0, jsx_runtime_1.jsx)(sequence_activity_context_js_1.SequenceActivityAbsoluteTimeContext.Provider, { value: dormant ? dormantTimeline : null, children: (0, jsx_runtime_1.jsx)(TimelineContext_js_1.TimelineContext.Provider, { value: dormant ? dormantTimeline : timeline, children: (0, jsx_runtime_1.jsx)(TimelineContext_js_1.AbsoluteTimeContext.Provider, { value: dormant ? dormantTimeline : absoluteTime, children: (0, jsx_runtime_1.jsx)(react_1.default.Activity, { mode: dormant && !parentDormant ? 'hidden' : 'visible', children: (0, jsx_runtime_1.jsx)(SuspendSequenceActivity, { dormant: dormant, children: children }) }) }) }) }) }) }));
};
exports.SequenceActivityBoundary = SequenceActivityBoundary;
