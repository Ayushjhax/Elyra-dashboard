"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.FullscreenIcon = void 0;
const jsx_runtime_1 = require("react/jsx-runtime");
const FullscreenIcon = ({ color, ...props }) => {
    var _a;
    const size = typeof ((_a = props.style) === null || _a === void 0 ? void 0 : _a.height) === 'number' ? props.style.height : 18;
    const inset = Math.floor(size / 8) + 0.5;
    const oppositeEdge = size - inset;
    const cornerLength = Math.floor(size / 4);
    return ((0, jsx_runtime_1.jsx)("svg", { viewBox: `0 0 ${size} ${size}`, ...props, children: (0, jsx_runtime_1.jsx)("path", { fill: "none", stroke: color, strokeWidth: "1", strokeLinecap: "round", strokeLinejoin: "round", d: `M${inset + cornerLength} ${inset}H${inset}v${cornerLength}M${inset} ${oppositeEdge - cornerLength}v${cornerLength}h${cornerLength}M${oppositeEdge - cornerLength} ${inset}h${cornerLength}v${cornerLength}M${oppositeEdge} ${oppositeEdge - cornerLength}v${cornerLength}h${-cornerLength}` }) }));
};
exports.FullscreenIcon = FullscreenIcon;
