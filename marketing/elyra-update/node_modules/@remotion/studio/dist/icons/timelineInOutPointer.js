"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.TimelineOutPointer = exports.TimelineInPointer = void 0;
const jsx_runtime_1 = require("react/jsx-runtime");
const TimelineInPointer = (props) => {
    return ((0, jsx_runtime_1.jsx)("svg", { viewBox: "0 0 16 16", ...props, children: (0, jsx_runtime_1.jsx)("path", { d: "M9.5 1.5H5.5v13h4", fill: "none", stroke: props.color, strokeWidth: "1", strokeLinecap: "round", strokeLinejoin: "round" }) }));
};
exports.TimelineInPointer = TimelineInPointer;
const TimelineOutPointer = (props) => {
    return ((0, jsx_runtime_1.jsx)("svg", { viewBox: "0 0 16 16", ...props, children: (0, jsx_runtime_1.jsx)("path", { d: "M6.5 1.5h4v13H6.5", fill: "none", stroke: props.color, strokeWidth: "1", strokeLinecap: "round", strokeLinejoin: "round" }) }));
};
exports.TimelineOutPointer = TimelineOutPointer;
