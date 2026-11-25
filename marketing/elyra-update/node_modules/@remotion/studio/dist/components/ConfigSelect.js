"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.ConfigSelect = exports.booleanOptions = void 0;
const jsx_runtime_1 = require("react/jsx-runtime");
const Checkmark_1 = require("../icons/Checkmark");
const ComboBox_1 = require("./NewComposition/ComboBox");
const InfoBubble_1 = require("./RenderModal/InfoBubble");
const InfoTooltip_1 = require("./RenderModal/InfoTooltip");
const layout_1 = require("./RenderModal/layout");
const DEFAULT_VALUE = 'studio-default';
const controlWidth = {
    boxSizing: 'border-box',
    width: 180,
};
exports.booleanOptions = [
    { label: 'Enabled', value: true },
    { label: 'Disabled', value: false },
];
const ConfigSelect = ({ defaultLabel, description, name, onChange, options, value, }) => {
    const values = [
        {
            id: DEFAULT_VALUE,
            keyHint: null,
            label: `Default (${defaultLabel})`,
            leftItem: value === null ? (0, jsx_runtime_1.jsx)(Checkmark_1.Checkmark, {}) : null,
            onClick: () => onChange(null),
            quickSwitcherLabel: null,
            subMenu: null,
            type: 'item',
            value: DEFAULT_VALUE,
        },
        { id: `${DEFAULT_VALUE}-divider`, type: 'divider' },
        ...options.map((option) => {
            const id = `${name}-${String(option.value)}`;
            return {
                id,
                keyHint: null,
                label: option.label,
                leftItem: value === option.value ? (0, jsx_runtime_1.jsx)(Checkmark_1.Checkmark, {}) : null,
                onClick: () => onChange(option.value),
                quickSwitcherLabel: null,
                subMenu: null,
                type: 'item',
                value: id,
            };
        }),
    ];
    return ((0, jsx_runtime_1.jsxs)("div", { style: layout_1.optionRow, children: [(0, jsx_runtime_1.jsxs)("div", { style: layout_1.label, children: [name, description === null ? null : ((0, jsx_runtime_1.jsx)(InfoBubble_1.InfoBubble, { "aria-label": `About ${name.toLowerCase()}`, horizontalAlignment: "right", children: (0, jsx_runtime_1.jsx)("div", { style: {
                                padding: 12,
                                maxWidth: 280,
                                fontSize: InfoTooltip_1.INFO_TOOLTIP_FONT_SIZE,
                                lineHeight: 1.5,
                            }, children: description }) }))] }), (0, jsx_runtime_1.jsx)("div", { style: layout_1.rightRow, children: (0, jsx_runtime_1.jsx)(ComboBox_1.Combobox, { values: values, selectedId: value === null ? DEFAULT_VALUE : `${name}-${String(value)}`, style: controlWidth, "aria-label": name }) })] }));
};
exports.ConfigSelect = ConfigSelect;
