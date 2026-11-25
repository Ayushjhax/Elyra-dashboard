"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.PicIcon = void 0;
const jsx_runtime_1 = require("react/jsx-runtime");
const colors_1 = require("../helpers/colors");
const PicIcon = ({ color, ...props }) => {
    var _a;
    const size = typeof ((_a = props.style) === null || _a === void 0 ? void 0 : _a.height) === 'number' ? props.style.height : 18;
    const peakTop = Math.round((size * 5) / 16) - 0.5;
    const peakRight = Math.round((size * 5) / 8) - 0.5;
    const valleyX = Math.round((size * 7) / 16) - 0.5;
    const sunCenter = Math.round((size * 9) / 32);
    return ((0, jsx_runtime_1.jsxs)("svg", { xmlns: "http://www.w3.org/2000/svg", viewBox: `0 0 ${size} ${size}`, ...props, fill: "none", stroke: color !== null && color !== void 0 ? color : colors_1.CURRENT_COLOR_LOWERCASE, strokeWidth: 1, children: [(0, jsx_runtime_1.jsx)("rect", { x: 0.5, y: 1.5, width: size - 1, height: size - 3, rx: 1.5 }), (0, jsx_runtime_1.jsx)("path", { d: `M3 ${size - 4.5}L${peakTop} ${Math.round(size / 2) - 0.5}L${valleyX} ${peakRight}L${peakRight} ${peakTop}L${size - 3} ${size - 4.5}z`, strokeLinejoin: "round" }), (0, jsx_runtime_1.jsx)("circle", { cx: sunCenter, cy: sunCenter, r: Math.round((size * 3) / 32) - 0.5 })] }));
};
exports.PicIcon = PicIcon;
