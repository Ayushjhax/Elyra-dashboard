"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.StepForward = void 0;
const jsx_runtime_1 = require("react/jsx-runtime");
const colors_1 = require("../helpers/colors");
const StepForward = ({ color = colors_1.CURRENT_COLOR, ...props }) => {
    return ((0, jsx_runtime_1.jsx)("svg", { viewBox: "0 0 14 16", ...props, children: (0, jsx_runtime_1.jsx)("path", { fill: color, d: "M12 1h-2v6L3.7 1.3C3 0.7 2 1.2 2 2v12c0 0.8 1 1.3 1.7 0.7L10 9v6h2z" }) }));
};
exports.StepForward = StepForward;
