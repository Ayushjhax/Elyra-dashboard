"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.AlignCenterHorizontalIcon = void 0;
const jsx_runtime_1 = require("react/jsx-runtime");
const colors_1 = require("../helpers/colors");
const AlignCenterHorizontalIcon = (props) => {
    var _a;
    const color = (_a = props.color) !== null && _a !== void 0 ? _a : colors_1.CURRENT_COLOR;
    return ((0, jsx_runtime_1.jsxs)("svg", { ...props, viewBox: "0 0 16 16", fill: "none", xmlns: "http://www.w3.org/2000/svg", children: [(0, jsx_runtime_1.jsx)("path", { d: "M7.5 2.5V13.5", stroke: color, strokeLinecap: "square" }), (0, jsx_runtime_1.jsx)("line", { x1: "3", y1: "6", x2: "12", y2: "6", stroke: color, strokeWidth: "2" }), (0, jsx_runtime_1.jsx)("line", { x1: "4", y1: "10", x2: "11", y2: "10", stroke: color, strokeWidth: "2" })] }));
};
exports.AlignCenterHorizontalIcon = AlignCenterHorizontalIcon;
