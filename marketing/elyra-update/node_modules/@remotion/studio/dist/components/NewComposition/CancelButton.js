"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.CancelButton = exports.CancelIcon = void 0;
const jsx_runtime_1 = require("react/jsx-runtime");
const colors_1 = require("../../helpers/colors");
const hoverable_1 = require("../../helpers/hoverable");
const z_index_1 = require("../../state/z-index");
const style = {
    appearance: 'none',
    border: 'none',
    borderRadius: 4,
    cursor: 'default',
    display: 'inline-flex',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 3,
    ...(0, hoverable_1.hoverableStyle)({
        idleBackground: colors_1.TRANSPARENT,
        hoverBackground: colors_1.WHITE_ALPHA_06,
        idleColor: colors_1.LIGHT_TEXT,
        hoverColor: colors_1.WHITE,
    }),
};
const CancelIcon = (props) => {
    return ((0, jsx_runtime_1.jsx)("svg", { viewBox: "0 0 640 640", ...props, children: (0, jsx_runtime_1.jsx)("path", { fill: colors_1.CURRENT_COLOR, d: "M507.3 155.3C513.5 149.1 513.5 138.9 507.3 132.7C501.1 126.5 490.9 126.5 484.7 132.7L320 297.4L155.3 132.7C149.1 126.5 138.9 126.5 132.7 132.7C126.5 138.9 126.5 149.1 132.7 155.3L297.4 320L132.7 484.7C126.5 490.9 126.5 501.1 132.7 507.3C138.9 513.5 149.1 513.5 155.3 507.3L320 342.6L484.7 507.3C490.9 513.5 501.1 513.5 507.3 507.3C513.5 501.1 513.5 490.9 507.3 484.7L342.6 320L507.3 155.3z" }) }));
};
exports.CancelIcon = CancelIcon;
const CancelButton = ({ onPress, 'aria-label': ariaLabel, ...props }) => {
    const { tabIndex } = (0, z_index_1.useZIndex)();
    return ((0, jsx_runtime_1.jsx)("button", { "aria-label": ariaLabel, className: `${hoverable_1.HOVERABLE_CLASS_NAME} ${hoverable_1.FOCUS_VISIBLE_ONLY_CLASS_NAME}`, tabIndex: tabIndex, style: style, type: "button", onClick: onPress, children: (0, jsx_runtime_1.jsx)(exports.CancelIcon, { ...props }) }));
};
exports.CancelButton = CancelButton;
