"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.SplitIcon = void 0;
const jsx_runtime_1 = require("react/jsx-runtime");
const SplitIcon = ({ color, ...props }) => {
    return ((0, jsx_runtime_1.jsx)("svg", { viewBox: "0 0 640 640", ...props, children: (0, jsx_runtime_1.jsx)("path", { d: "M152 112h72c26.5 0 48 21.5 48 48v320c0 26.5-21.5 48-48 48h-72M488 112h-72c-26.5 0-48 21.5-48 48v320c0 26.5 21.5 48 48 48h72", fill: "none", stroke: color, strokeWidth: 32, strokeLinecap: "round", strokeLinejoin: "round" }) }));
};
exports.SplitIcon = SplitIcon;
