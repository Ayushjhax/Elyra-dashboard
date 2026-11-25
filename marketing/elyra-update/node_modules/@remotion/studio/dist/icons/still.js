"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.StillIcon = void 0;
const jsx_runtime_1 = require("react/jsx-runtime");
const StillIcon = ({ color, ...props }) => {
    var _a;
    const size = typeof ((_a = props.style) === null || _a === void 0 ? void 0 : _a.height) === 'number' ? props.style.height : 18;
    const bodyTop = Math.round((size * 3) / 16);
    const humpLeft = Math.round((size * 3) / 8) - 0.5;
    return ((0, jsx_runtime_1.jsxs)("svg", { ...props, xmlns: "http://www.w3.org/2000/svg", viewBox: `0 0 ${size} ${size}`, fill: "none", stroke: color, strokeWidth: 1, children: [(0, jsx_runtime_1.jsx)("path", { d: `M2 ${bodyTop + 0.5}
				H${humpLeft - 1}L${humpLeft} 1.5H${size - humpLeft}
				L${size - humpLeft + 1} ${bodyTop + 0.5}H${size - 2}
				a1.5 1.5 0 0 1 1.5 1.5V${size - 3}
				a1.5 1.5 0 0 1 -1.5 1.5H2
				a1.5 1.5 0 0 1 -1.5 -1.5V${bodyTop + 2}
				a1.5 1.5 0 0 1 1.5 -1.5z`, strokeLinejoin: "round" }), (0, jsx_runtime_1.jsx)("circle", { cx: size / 2, cy: Math.floor((size * 9) / 16), r: Math.round((size * 7) / 32) - 0.5 })] }));
};
exports.StillIcon = StillIcon;
