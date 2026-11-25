"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.VideoFileIcon = exports.FilmIcon = void 0;
const jsx_runtime_1 = require("react/jsx-runtime");
const FilmIcon = ({ color, ...props }) => {
    var _a;
    const size = typeof ((_a = props.style) === null || _a === void 0 ? void 0 : _a.height) === 'number' ? props.style.height : 18;
    const sideWidth = Math.floor(size / 8);
    const upperFrameBottom = Math.floor(size / 2) - 1;
    const topDivider = Math.floor((2 + upperFrameBottom) / 2);
    const bottomDivider = size - topDivider - 1;
    return ((0, jsx_runtime_1.jsxs)("svg", { ...props, xmlns: "http://www.w3.org/2000/svg", viewBox: `0 0 ${size} ${size}`, children: [(0, jsx_runtime_1.jsx)("rect", { x: 0.5, y: 1.5, width: size - 1, height: size - 3, rx: 1.5, fill: "none", stroke: color, strokeWidth: 1 }), (0, jsx_runtime_1.jsx)("path", { fill: color, d: `M${sideWidth + 1} 2h1v${size - 4}h-1z
				M${size - sideWidth - 2} 2h1v${size - 4}h-1z
				M${sideWidth + 2} ${upperFrameBottom}h${size - 2 * sideWidth - 4}v1h-${size - 2 * sideWidth - 4}z
				M1 ${topDivider}h${sideWidth}v1H1z
				M${size - sideWidth - 1} ${topDivider}h${sideWidth}v1h-${sideWidth}z
				M1 ${bottomDivider}h${sideWidth}v1H1z
				M${size - sideWidth - 1} ${bottomDivider}h${sideWidth}v1h-${sideWidth}z` })] }));
};
exports.FilmIcon = FilmIcon;
const VideoFileIcon = ({ color, ...props }) => {
    return ((0, jsx_runtime_1.jsx)("svg", { ...props, xmlns: "http://www.w3.org/2000/svg", viewBox: "0 0 576 512", children: (0, jsx_runtime_1.jsx)("path", { fill: color, d: "M96 96c-17.7 0-32 14.3-32 32l0 256c0 17.7 14.3 32 32 32l256 0c17.7 0 32-14.3 32-32l0-256c0-17.7-14.3-32-32-32L96 96zM32 128c0-35.3 28.7-64 64-64l256 0c35.3 0 64 28.7 64 64l0 256c0 35.3-28.7 64-64 64L96 448c-35.3 0-64-28.7-64-64l0-256zm432 84l0-40 73.6-55.2c4.2-3.1 9.2-4.8 14.4-4.8 13.3 0 24 10.7 24 24l0 240c0 13.3-10.7 24-24 24-5.2 0-10.2-1.7-14.4-4.8l-73.6-55.2 0-40 80 60 0-208-80 60z" }) }));
};
exports.VideoFileIcon = VideoFileIcon;
