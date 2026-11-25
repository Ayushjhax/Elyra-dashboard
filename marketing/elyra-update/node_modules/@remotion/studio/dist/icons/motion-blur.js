"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.MotionBlurIcon = void 0;
const jsx_runtime_1 = require("react/jsx-runtime");
const MotionBlurIcon = ({ color, ...props }) => {
    return ((0, jsx_runtime_1.jsxs)("svg", { ...props, xmlns: "http://www.w3.org/2000/svg", viewBox: "0 0 640 640", children: [(0, jsx_runtime_1.jsx)("circle", { cx: 220, cy: 320, fill: "none", r: 160, stroke: color, strokeWidth: 28 }), (0, jsx_runtime_1.jsx)("path", { d: "M420 160a160 160 0 0 1 0 320", fill: "none", stroke: color, strokeLinecap: "round", strokeWidth: 28 })] }));
};
exports.MotionBlurIcon = MotionBlurIcon;
