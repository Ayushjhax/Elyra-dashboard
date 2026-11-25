"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.TimelineColorField = void 0;
const jsx_runtime_1 = require("react/jsx-runtime");
const react_1 = require("react");
const colors_1 = require("../../helpers/colors");
const ColorPicker_1 = require("../ColorPicker/ColorPicker");
const containerStyle = {
    display: 'flex',
    alignItems: 'center',
    gap: 3,
};
const SWATCH_WIDTH = 20;
const SWATCH_HEIGHT = 15;
const DEFAULT_SET_COLOR = '#808080';
const noneLabelStyle = {
    color: colors_1.LIGHT_TEXT,
    fontSize: 12,
};
const setButtonStyle = {
    background: 'none',
    border: 'none',
    color: colors_1.BLUE,
    cursor: 'pointer',
    fontSize: 12,
    margin: 0,
    padding: 0,
};
const TimelineColorField = ({ field, effectiveValue, propStatus, onSave, onDragValueChange, onDragEnd, }) => {
    var _a, _b;
    const currentValue = typeof effectiveValue === 'string'
        ? effectiveValue
        : field.fieldSchema.type === 'color'
            ? ((_a = field.fieldSchema.default) !== null && _a !== void 0 ? _a : '#000')
            : '';
    const onChange = (0, react_1.useCallback)((next) => {
        onDragValueChange(next);
    }, [onDragValueChange]);
    const onChangeComplete = (0, react_1.useCallback)((next) => {
        if (next !== propStatus.codeValue) {
            onSave(next);
        }
        onDragEnd(next !== propStatus.codeValue ? 'commit' : 'cancel');
    }, [onSave, onDragEnd, propStatus]);
    if (currentValue === 'none') {
        return ((0, jsx_runtime_1.jsxs)("span", { style: containerStyle, children: [(0, jsx_runtime_1.jsx)("span", { style: noneLabelStyle, children: "None" }), (0, jsx_runtime_1.jsx)("button", { type: "button", style: setButtonStyle, "aria-label": `Set ${(_b = field.description) !== null && _b !== void 0 ? _b : field.key} to gray`, onClick: () => onChangeComplete(DEFAULT_SET_COLOR), children: "Set" })] }));
    }
    return ((0, jsx_runtime_1.jsx)("span", { style: containerStyle, children: (0, jsx_runtime_1.jsx)(ColorPicker_1.ColorPicker, { value: currentValue, status: "ok", onChange: onChange, onChangeComplete: onChangeComplete, width: SWATCH_WIDTH, height: SWATCH_HEIGHT, disabled: false, name: field.key, "aria-label": currentValue }) }));
};
exports.TimelineColorField = TimelineColorField;
