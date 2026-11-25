"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.TimelineTrimTooltip = void 0;
const jsx_runtime_1 = require("react/jsx-runtime");
const react_1 = require("react");
const react_dom_1 = require("react-dom");
const colors_1 = require("../../helpers/colors");
const render_frame_1 = require("../../state/render-frame");
const z_index_1 = require("../../state/z-index");
const portals_1 = require("../Menu/portals");
const timeline_trim_limit_reason_1 = require("./timeline-trim-limit-reason");
const TimelineTickFormatProvider_1 = require("./TimelineTickFormatProvider");
const tooltip = {
    backgroundColor: colors_1.BLACK_ALPHA_85,
    borderRadius: 2,
    boxSizing: 'border-box',
    color: colors_1.WHITE,
    fontSize: 11,
    fontVariantNumeric: 'tabular-nums',
    lineHeight: '14px',
    padding: '4px 7px',
    pointerEvents: 'none',
    position: 'fixed',
    textAlign: 'right',
    whiteSpace: 'nowrap',
    zIndex: 2147483647,
};
// `.css-reset *` sets font-size and line-height on descendants
const line = {
    fontSize: 11,
    lineHeight: '14px',
};
const TimelineTrimTooltip = ({ state, fps, showSourceLimits }) => {
    var _a;
    const { showFrames } = (0, react_1.useContext)(TimelineTickFormatProvider_1.TimelineTickFormatContext);
    const { currentZIndex } = (0, z_index_1.useZIndex)();
    const delta = Math.round(state.deltaFrames);
    const edge = Math.max(0, Math.round(state.edgeFrame));
    const format = (frame) => showFrames ? `${frame}f` : (0, render_frame_1.renderFrame)(frame, fps);
    const deltaLabel = delta === 0
        ? format(0)
        : `${delta < 0 ? '−' : '+'}${format(Math.abs(delta))}`;
    const edgeLabel = format(edge);
    const limitReason = showSourceLimits &&
        (state.limitReason === 'Source start' || state.limitReason === 'Source end')
        ? state.limitReason
        : (0, timeline_trim_limit_reason_1.getVisibleTimelineTrimLimitReason)(state.limitReason);
    const tooltipWidth = Math.max(82, Math.ceil(Math.max(deltaLabel.length, edgeLabel.length, (_a = limitReason === null || limitReason === void 0 ? void 0 : limitReason.length) !== null && _a !== void 0 ? _a : 0) *
        7 +
        14));
    // Start centered on the trim edge, then grow to the left when the text changes.
    const initialWidth = (0, react_1.useRef)(tooltipWidth).current;
    const tooltipHeight = limitReason === null ? 36 : 50;
    const left = Math.max(8, Math.min(state.x + initialWidth / 2 - tooltipWidth, window.innerWidth - tooltipWidth - 8));
    const top = Math.max(8, Math.min(state.y - tooltipHeight - 4, window.innerHeight - tooltipHeight - 8));
    return (0, react_dom_1.createPortal)((0, jsx_runtime_1.jsxs)("div", { "aria-hidden": "true", className: "css-reset", style: { ...tooltip, left, top, width: tooltipWidth }, "data-remotion-timeline-trim-tooltip": "true", children: [limitReason === null ? null : ((0, jsx_runtime_1.jsx)("div", { style: { ...line, color: colors_1.WHITE }, children: limitReason })), (0, jsx_runtime_1.jsx)("div", { style: { ...line, color: colors_1.WHITE }, children: deltaLabel }), (0, jsx_runtime_1.jsx)("div", { style: { ...line, color: colors_1.LIGHT_TEXT }, children: edgeLabel })] }), (0, portals_1.getPortal)(currentZIndex));
};
exports.TimelineTrimTooltip = TimelineTrimTooltip;
