"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.ArrowRight = exports.ArrowLeft = exports.ShiftIcon = void 0;
const jsx_runtime_1 = require("react/jsx-runtime");
const colors_1 = require("../helpers/colors");
const iconStyle = {
    width: 10,
    display: 'inline',
};
const shiftIconStyle = {
    display: 'inline-block',
    height: 12,
    verticalAlign: 'baseline',
    width: 12,
};
const ShiftIcon = ({ color }) => {
    return ((0, jsx_runtime_1.jsx)("svg", { "aria-hidden": "true", focusable: "false", style: shiftIconStyle, viewBox: "0 0 12 12", children: (0, jsx_runtime_1.jsx)("path", { d: "M4.5 11.5V8.5H1.5L6 3.5L10.5 8.5H7.5V11.5", fill: "none", stroke: color !== null && color !== void 0 ? color : colors_1.CURRENT_COLOR, strokeLinecap: "square", strokeLinejoin: "miter", strokeWidth: "1" }) }));
};
exports.ShiftIcon = ShiftIcon;
const ArrowLeft = () => {
    return ((0, jsx_runtime_1.jsx)("svg", { style: iconStyle, viewBox: "0 0 448 512", children: (0, jsx_runtime_1.jsx)("path", { fill: colors_1.CURRENT_COLOR, d: "M257.5 445.1l-22.2 22.2c-9.4 9.4-24.6 9.4-33.9 0L7 273c-9.4-9.4-9.4-24.6 0-33.9L201.4 44.7c9.4-9.4 24.6-9.4 33.9 0l22.2 22.2c9.5 9.5 9.3 25-.4 34.3L136.6 216H424c13.3 0 24 10.7 24 24v32c0 13.3-10.7 24-24 24H136.6l120.5 114.8c9.8 9.3 10 24.8.4 34.3z" }) }));
};
exports.ArrowLeft = ArrowLeft;
const ArrowRight = () => {
    return ((0, jsx_runtime_1.jsx)("svg", { style: iconStyle, viewBox: "0 0 448 512", children: (0, jsx_runtime_1.jsx)("path", { fill: colors_1.CURRENT_COLOR, d: "M190.5 66.9l22.2-22.2c9.4-9.4 24.6-9.4 33.9 0L441 239c9.4 9.4 9.4 24.6 0 33.9L246.6 467.3c-9.4 9.4-24.6 9.4-33.9 0l-22.2-22.2c-9.5-9.5-9.3-25 .4-34.3L311.4 296H24c-13.3 0-24-10.7-24-24v-32c0-13.3 10.7-24 24-24h287.4L190.9 101.2c-9.8-9.3-10-24.8-.4-34.3z" }) }));
};
exports.ArrowRight = ArrowRight;
