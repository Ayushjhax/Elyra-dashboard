"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.TimelineCombobox = void 0;
const jsx_runtime_1 = require("react/jsx-runtime");
const colors_1 = require("../helpers/colors");
const caret_1 = require("../icons/caret");
const ActionTooltip_1 = require("./ActionTooltip");
const layout_1 = require("./layout");
const SegmentedButton_1 = require("./SegmentedButton");
const segmentedButtonStyle = {
    height: 28,
};
const label = {
    flex: 'none',
    fontFamily: 'inherit',
    fontSize: 12,
    fontVariantNumeric: 'tabular-nums',
    lineHeight: '16px',
    overflow: 'hidden',
    textAlign: 'left',
    textOverflow: 'ellipsis',
    userSelect: 'none',
    WebkitUserSelect: 'none',
    whiteSpace: 'nowrap',
};
const TimelineCombobox = ({ values, selectedId, selectedLabel, 'aria-label': ariaLabel, tooltipDelay, labelWidth = 32, renderLeftItem, unhoveredIconColor = colors_1.LIGHT_TEXT, }) => {
    const selected = values.find((value) => value.id === selectedId);
    const displayLabel = selectedLabel !== null && selectedLabel !== void 0 ? selectedLabel : selected === null || selected === void 0 ? void 0 : selected.label;
    const segments = [
        {
            ariaLabel,
            buttonId: null,
            disabled: false,
            idleColor: unhoveredIconColor,
            leaveLeftSpace: true,
            onOpenChange: null,
            renderContent: (color) => ((0, jsx_runtime_1.jsxs)(jsx_runtime_1.Fragment, { children: [renderLeftItem ? ((0, jsx_runtime_1.jsxs)(jsx_runtime_1.Fragment, { children: [renderLeftItem(color), (0, jsx_runtime_1.jsx)(layout_1.Spacing, { x: 0.5 })] })) : null, selected || displayLabel ? ((0, jsx_runtime_1.jsx)("div", { role: "group", "aria-label": tooltipDelay === null && typeof displayLabel === 'string'
                            ? displayLabel
                            : undefined, style: { ...label, minWidth: labelWidth }, children: displayLabel })) : null, (0, jsx_runtime_1.jsx)(layout_1.Spacing, { x: 0.5 }), (0, jsx_runtime_1.jsx)(caret_1.CaretDown, { color: color })] })),
            segmentId: 'selector',
            selectedId,
            style: { fontFamily: 'inherit', padding: '0 4px' },
            tooltipLabel: null,
            type: 'menu',
            values,
        },
    ];
    const button = ((0, jsx_runtime_1.jsx)(SegmentedButton_1.SegmentedButton, { segments: segments, style: segmentedButtonStyle }));
    return tooltipDelay === null ? (button) : ((0, jsx_runtime_1.jsx)(ActionTooltip_1.ActionTooltip, { label: ariaLabel, shortcut: null, delay: tooltipDelay, dismissOnClick: true, children: button }));
};
exports.TimelineCombobox = TimelineCombobox;
