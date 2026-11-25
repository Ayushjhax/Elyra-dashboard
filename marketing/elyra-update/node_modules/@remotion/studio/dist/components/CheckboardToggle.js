"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.CheckboardToggle = void 0;
const jsx_runtime_1 = require("react/jsx-runtime");
const react_1 = require("react");
const colors_1 = require("../helpers/colors");
const use_keybinding_1 = require("../helpers/use-keybinding");
const use_keyboard_shortcut_label_1 = require("../helpers/use-keyboard-shortcut-label");
const checkerboard_1 = require("../state/checkerboard");
const ActionTooltip_1 = require("./ActionTooltip");
const ControlButton_1 = require("./ControlButton");
const buttonStyle = { width: 26 };
const CheckboardToggle = () => {
    const { checkerboard, setCheckerboard } = (0, react_1.useContext)(checkerboard_1.CheckerboardContext);
    const onClick = (0, react_1.useCallback)(() => {
        setCheckerboard((c) => {
            return !c;
        });
    }, [setCheckerboard]);
    const shortcut = (0, use_keyboard_shortcut_label_1.useKeyboardShortcutLabel)('toggleCheckerboard');
    const ariaKeyShortcuts = (0, use_keyboard_shortcut_label_1.useKeyboardShortcutAriaKeyShortcuts)('toggleCheckerboard');
    const accessibilityLabel = 'Show transparency as checkerboard';
    const shortcutsDisabled = (0, use_keybinding_1.areKeyboardShortcutsDisabled)();
    return ((0, jsx_runtime_1.jsx)(ActionTooltip_1.ActionTooltip, { label: "Checkerboard", shortcut: shortcutsDisabled ? null : shortcut, delay: 800, dismissOnClick: false, children: (0, jsx_runtime_1.jsx)(ControlButton_1.ControlButton, { "aria-label": accessibilityLabel, "aria-pressed": checkerboard, "aria-keyshortcuts": shortcutsDisabled ? undefined : ariaKeyShortcuts || undefined, onClick: onClick, style: buttonStyle, children: (color) => ((0, jsx_runtime_1.jsx)("svg", { "aria-hidden": "true", focusable: "false", xmlns: "http://www.w3.org/2000/svg", viewBox: "0 0 18 18", style: { width: 18, height: 18 }, fill: "none", children: (0, jsx_runtime_1.jsx)("path", { fill: checkerboard ? colors_1.BLUE : color, fillRule: "evenodd", d: "M3 2h12a1 1 0 0 1 1 1v12a1 1 0 0 1 -1 1H3a1 1 0 0 1 -1 -1V3a1 1 0 0 1 1 -1zM3 3h6v6H3zM9 9h6v6H9z" }) })) }) }));
};
exports.CheckboardToggle = CheckboardToggle;
