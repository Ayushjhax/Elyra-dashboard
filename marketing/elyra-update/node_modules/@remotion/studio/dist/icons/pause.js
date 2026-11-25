"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.Pause = void 0;
const jsx_runtime_1 = require("react/jsx-runtime");
const colors_1 = require("../helpers/colors");
const Pause = ({ color = colors_1.CURRENT_COLOR, ...props }) => ((0, jsx_runtime_1.jsx)("svg", { ...props, "aria-hidden": "true", focusable: "false", "data-prefix": "fas", "data-icon": "pause", className: "svg-inline--fa fa-pause fa-w-14", role: "img", xmlns: "http://www.w3.org/2000/svg", viewBox: "0 0 14 14", children: (0, jsx_runtime_1.jsx)("path", { fill: color, d: "M2 1h3a1 1 0 0 1 1 1v10a1 1 0 0 1 -1 1H2a1 1 0 0 1 -1 -1V2a1 1 0 0 1 1 -1zM9 1h3a1 1 0 0 1 1 1v10a1 1 0 0 1 -1 1H9a1 1 0 0 1 -1 -1V2a1 1 0 0 1 1 -1z" }) }));
exports.Pause = Pause;
