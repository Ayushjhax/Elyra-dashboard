"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.AngleDown = exports.CaretDown = exports.CaretRight = void 0;
const jsx_runtime_1 = require("react/jsx-runtime");
const react_1 = require("react");
const colors_1 = require("../helpers/colors");
const caret = {
    height: 12,
};
const caretDown = {
    width: 10,
    height: 12,
};
const caretDownSmall = {
    width: 7,
    height: 8,
};
const angleDown = {
    width: 10,
};
const CaretRight = () => ((0, jsx_runtime_1.jsx)("svg", { viewBox: "0 0 192 512", style: caret, children: (0, jsx_runtime_1.jsx)("path", { fill: colors_1.CURRENT_COLOR, d: "M0 384.662V127.338c0-17.818 21.543-26.741 34.142-14.142l128.662 128.662c7.81 7.81 7.81 20.474 0 28.284L34.142 398.804C21.543 411.404 0 402.48 0 384.662z" }) }));
exports.CaretRight = CaretRight;
const CaretDown = ({ color = colors_1.CURRENT_COLOR, small = false }) => {
    return ((0, jsx_runtime_1.jsx)("svg", { viewBox: small ? '0 0 7 8' : '0 0 10 12', style: small ? caretDownSmall : caretDown, children: (0, jsx_runtime_1.jsx)("path", { fill: "none", stroke: color, strokeWidth: "1", strokeLinecap: "round", strokeLinejoin: "round", d: small ? 'M0.5 2.5L3.5 5.5L6.5 2.5' : 'M1 4L5 8L9 4' }) }));
};
exports.CaretDown = CaretDown;
const AngleDown = ({ down }) => {
    const style = (0, react_1.useMemo)(() => {
        return {
            ...angleDown,
            transform: down ? 'rotate(180deg)' : 'rotate(0deg)',
            marginTop: 1,
        };
    }, [down]);
    return ((0, jsx_runtime_1.jsx)("svg", { style: style, viewBox: "0 0 448 512", children: (0, jsx_runtime_1.jsx)("path", { fill: colors_1.LIGHT_TEXT, d: "M201.4 342.6c12.5 12.5 32.8 12.5 45.3 0l160-160c12.5-12.5 12.5-32.8 0-45.3s-32.8-12.5-45.3 0L224 274.7 86.6 137.4c-12.5-12.5-32.8-12.5-45.3 0s-12.5 32.8 0 45.3l160 160z" }) }));
};
exports.AngleDown = AngleDown;
