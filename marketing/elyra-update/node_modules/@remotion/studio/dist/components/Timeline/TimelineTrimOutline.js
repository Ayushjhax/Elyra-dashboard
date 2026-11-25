"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.TimelineUndimmedTrimContent = exports.TimelineUnclippedTrimContent = exports.TimelineTrimOutlineContainer = void 0;
const jsx_runtime_1 = require("react/jsx-runtime");
const react_1 = require("react");
const react_dom_1 = require("react-dom");
const timeline_zoom_1 = require("../../state/timeline-zoom");
const originStyle = {
    position: 'absolute',
    inset: 0,
    pointerEvents: 'none',
};
const TimelineTrimOutlineTarget = (0, react_1.createContext)(null);
const TimelineTrimHighlightTarget = (0, react_1.createContext)(null);
const TimelineTrimOutlineContainer = ({ children, style, clipPath }) => {
    const ref = (0, react_1.useRef)(null);
    const highlightRef = (0, react_1.useRef)(null);
    return ((0, jsx_runtime_1.jsx)("div", { ref: ref, style: { ...style, pointerEvents: 'none' }, children: (0, jsx_runtime_1.jsx)(TimelineTrimOutlineTarget.Provider, { value: ref, children: (0, jsx_runtime_1.jsx)(TimelineTrimHighlightTarget.Provider, { value: highlightRef, children: (0, jsx_runtime_1.jsx)("div", { ref: highlightRef, style: {
                        clipPath: clipPath !== null && clipPath !== void 0 ? clipPath : undefined,
                        height: '100%',
                        pointerEvents: 'auto',
                        position: 'relative',
                    }, children: children }) }) }) }));
};
exports.TimelineTrimOutlineContainer = TimelineTrimOutlineContainer;
const TimelineTrimPortal = ({ children, targetRef }) => {
    const isZooming = (0, react_1.useContext)(timeline_zoom_1.TimelineZoomActiveContext);
    const originRef = (0, react_1.useRef)(null);
    const [placement, setPlacement] = (0, react_1.useState)(null);
    (0, react_1.useLayoutEffect)(() => {
        if (isZooming) {
            return;
        }
        const target = targetRef === null || targetRef === void 0 ? void 0 : targetRef.current;
        const origin = originRef.current;
        if (!target || !origin) {
            return;
        }
        // Preserve the local coordinate space when escaping the dimmed content.
        // Recheck after renders so a moving or resized clip keeps its handle aligned.
        const targetBounds = target.getBoundingClientRect();
        const originBounds = origin.getBoundingClientRect();
        const next = {
            target,
            left: originBounds.left - targetBounds.left,
            top: originBounds.top - targetBounds.top,
            width: originBounds.width,
            height: originBounds.height,
        };
        setPlacement((previous) => (previous === null || previous === void 0 ? void 0 : previous.target) === next.target &&
            previous.left === next.left &&
            previous.top === next.top &&
            previous.width === next.width &&
            previous.height === next.height
            ? previous
            : next);
    }, [children, isZooming, targetRef]);
    if (targetRef === null) {
        return isZooming ? null : children;
    }
    return ((0, jsx_runtime_1.jsxs)(jsx_runtime_1.Fragment, { children: [(0, jsx_runtime_1.jsx)("div", { ref: originRef, style: originStyle }), isZooming || placement === null
                ? null
                : (0, react_dom_1.createPortal)((0, jsx_runtime_1.jsx)("div", { style: {
                        position: 'absolute',
                        left: placement.left,
                        top: placement.top,
                        width: placement.width,
                        height: placement.height,
                        pointerEvents: 'none',
                        zIndex: 2,
                    }, children: children }), placement.target)] }));
};
const TimelineUnclippedTrimContent = ({ children }) => {
    const targetRef = (0, react_1.useContext)(TimelineTrimOutlineTarget);
    return ((0, jsx_runtime_1.jsx)(TimelineTrimPortal, { targetRef: targetRef, children: children }));
};
exports.TimelineUnclippedTrimContent = TimelineUnclippedTrimContent;
const TimelineUndimmedTrimContent = ({ children }) => {
    const targetRef = (0, react_1.useContext)(TimelineTrimHighlightTarget);
    return ((0, jsx_runtime_1.jsx)(TimelineTrimPortal, { targetRef: targetRef, children: children }));
};
exports.TimelineUndimmedTrimContent = TimelineUndimmedTrimContent;
