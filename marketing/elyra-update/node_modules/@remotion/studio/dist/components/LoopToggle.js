"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.LoopToggle = exports.toggleLoop = void 0;
const jsx_runtime_1 = require("react/jsx-runtime");
const react_1 = require("react");
const colors_1 = require("../helpers/colors");
const use_keybinding_1 = require("../helpers/use-keybinding");
const use_keyboard_shortcut_label_1 = require("../helpers/use-keyboard-shortcut-label");
const loop_1 = require("../state/loop");
const ActionTooltip_1 = require("./ActionTooltip");
const ControlButton_1 = require("./ControlButton");
const accessibilityLabel = 'Loop';
const buttonStyle = { width: 30 };
const toggleLoop = (setLoop) => {
    setLoop((currentLoop) => {
        (0, loop_1.persistLoopOption)(!currentLoop);
        return !currentLoop;
    });
};
exports.toggleLoop = toggleLoop;
const LoopToggle = ({ loop, setLoop }) => {
    const shortcut = (0, use_keyboard_shortcut_label_1.useKeyboardShortcutLabel)('toggleLoop');
    const ariaShortcut = (0, use_keyboard_shortcut_label_1.useKeyboardShortcutAriaKeyShortcuts)('toggleLoop');
    const shortcutsDisabled = (0, use_keybinding_1.areKeyboardShortcutsDisabled)();
    const onClick = (0, react_1.useCallback)(() => {
        (0, exports.toggleLoop)(setLoop);
    }, [setLoop]);
    return ((0, jsx_runtime_1.jsx)(ActionTooltip_1.ActionTooltip, { label: accessibilityLabel, shortcut: shortcutsDisabled ? null : shortcut, delay: 800, dismissOnClick: false, children: (0, jsx_runtime_1.jsx)(ControlButton_1.ControlButton, { "aria-label": accessibilityLabel, "aria-keyshortcuts": shortcutsDisabled ? undefined : ariaShortcut || undefined, "aria-pressed": loop, onClick: onClick, style: buttonStyle, children: (color) => ((0, jsx_runtime_1.jsx)("svg", { viewBox: "0 0 18 18", style: { width: 18, height: 18 }, children: (0, jsx_runtime_1.jsx)("path", { fill: "none", stroke: loop ? colors_1.BLUE : color, strokeWidth: "1", strokeLinecap: "round", strokeLinejoin: "round", d: "M0.5 9.5a6 6 0 0 1 6 -6h6M12.5 0.5l4 3 -4 3zM17.5 8.5a6 6 0 0 1 -6 6h-6M5.5 11.5l-4 3 4 3z" }) })) }) }));
};
exports.LoopToggle = LoopToggle;
