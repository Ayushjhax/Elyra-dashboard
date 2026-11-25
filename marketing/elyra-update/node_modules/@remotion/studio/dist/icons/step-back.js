"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.StepBack = void 0;
const jsx_runtime_1 = require("react/jsx-runtime");
const colors_1 = require("../helpers/colors");
const StepBack = ({ color = colors_1.CURRENT_COLOR, ...props }) => {
    return ((0, jsx_runtime_1.jsx)("svg", { viewBox: "0 0 14 16", ...props, children: (0, jsx_runtime_1.jsx)("path", { fill: color, d: "M2 1h2v6l6.3 -5.7C11 0.7 12 1.2 12 2v12c0 0.8 -1 1.3 -1.7 0.7L4 9v6H2z" }) }));
};
exports.StepBack = StepBack;
