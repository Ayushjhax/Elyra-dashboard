"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.JumpToStart = void 0;
const jsx_runtime_1 = require("react/jsx-runtime");
const colors_1 = require("../helpers/colors");
const JumpToStart = ({ color = colors_1.CURRENT_COLOR, ...props }) => {
    return ((0, jsx_runtime_1.jsx)("svg", { xmlns: "http://www.w3.org/2000/svg", viewBox: "0 0 18 18", ...props, children: (0, jsx_runtime_1.jsx)("path", { fill: color, d: "M0 3a1 1 0 0 1 2 0v5l6.3 -5.7C9 1.7 10 2.2 10 3v5l6.3 -5.7C17 1.7 18 2.2 18 3v12c0 0.8 -1 1.3 -1.7 0.7L10 10v5c0 0.8 -1 1.3 -1.7 0.7L2 10v5a1 1 0 0 1 -2 0z" }) }));
};
exports.JumpToStart = JumpToStart;
