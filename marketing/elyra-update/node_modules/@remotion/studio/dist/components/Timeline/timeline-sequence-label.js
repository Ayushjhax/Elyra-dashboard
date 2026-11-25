"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.TimelineSequenceLabel = exports.timelineSequenceLabelStyle = exports.PACKED_LABEL_BOTTOM = void 0;
const jsx_runtime_1 = require("react/jsx-runtime");
const ActionTooltip_1 = require("../ActionTooltip");
const TimelineSelection_1 = require("./TimelineSelection");
const MAX_TOOLTIP_LENGTH = 200;
exports.PACKED_LABEL_BOTTOM = 1;
exports.timelineSequenceLabelStyle = {
    flex: 1,
    fontSize: 11,
    lineHeight: '15px',
    color: (0, TimelineSelection_1.getTimelineColor)(false, false),
    maskImage: 'linear-gradient(to right, black calc(100% - 5px), transparent)',
    minWidth: 0,
    // Keep the fade in empty space unless the label is clipped.
    paddingRight: 5,
    whiteSpace: 'nowrap',
    overflow: 'hidden',
    WebkitMaskImage: 'linear-gradient(to right, black calc(100% - 5px), transparent)',
};
const TimelineSequenceLabel = ({ label, children }) => {
    return ((0, jsx_runtime_1.jsx)(ActionTooltip_1.ActionTooltip, { label: label.length > MAX_TOOLTIP_LENGTH
            ? `${label.slice(0, MAX_TOOLTIP_LENGTH - 1).trimEnd()}…`
            : label, shortcut: null, delay: 250, dismissOnClick: true, triggerStyle: {
            alignSelf: 'flex-start',
            maxWidth: '100%',
            minWidth: 0,
            pointerEvents: 'auto',
        }, children: (0, jsx_runtime_1.jsx)("span", { style: exports.timelineSequenceLabelStyle, children: children }) }));
};
exports.TimelineSequenceLabel = TimelineSequenceLabel;
