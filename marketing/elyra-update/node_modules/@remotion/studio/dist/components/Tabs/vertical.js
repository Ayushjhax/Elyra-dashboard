"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.VerticalTab = void 0;
const jsx_runtime_1 = require("react/jsx-runtime");
const react_1 = require("react");
const colors_1 = require("../../helpers/colors");
const hoverable_1 = require("../../helpers/hoverable");
const use_breakpoint_1 = require("../../helpers/use-breakpoint");
const z_index_1 = require("../../state/z-index");
const ActionTooltip_1 = require("../ActionTooltip");
const compactTabBreakpoint = 700;
const selectorButton = {
    border: 'none',
    flex: 1,
    padding: 8,
    paddingLeft: 16,
    display: 'flex',
    flexDirection: 'row',
    fontFamily: 'sans-serif',
    fontSize: 14,
    alignItems: 'center',
    userSelect: 'none',
    WebkitUserSelect: 'none',
};
const compactSelectorButton = {
    width: 42,
    paddingLeft: 12,
    paddingRight: 4,
};
const VerticalTab = ({ children, onClick, renderIcon, style, selected, autoFocus }) => {
    const { tabIndex } = (0, z_index_1.useZIndex)();
    const isCompact = (0, use_breakpoint_1.useBreakpoint)(compactTabBreakpoint);
    const definiteStyle = (0, react_1.useMemo)(() => {
        return {
            ...selectorButton,
            ...(0, hoverable_1.hoverableStyle)({
                idleBackground: selected ? colors_1.WHITE_ALPHA_06 : colors_1.TRANSPARENT,
                hoverBackground: colors_1.WHITE_ALPHA_06,
                idleColor: selected ? colors_1.WHITE : colors_1.LIGHT_TEXT,
                hoverColor: colors_1.WHITE,
            }),
            boxShadow: 'none',
            ...style,
            ...(isCompact ? compactSelectorButton : null),
        };
    }, [isCompact, selected, style]);
    const button = ((0, jsx_runtime_1.jsxs)("button", { "aria-label": children, autoFocus: autoFocus, style: definiteStyle, className: hoverable_1.HOVERABLE_CLASS_NAME, type: "button", onClick: onClick, tabIndex: tabIndex, children: [renderIcon ? renderIcon(colors_1.CURRENT_COLOR) : null, isCompact ? null : children] }));
    if (!isCompact) {
        return button;
    }
    return ((0, jsx_runtime_1.jsx)(ActionTooltip_1.ActionTooltip, { label: children, shortcut: null, delay: 800, dismissOnClick: true, side: "right", children: button }));
};
exports.VerticalTab = VerticalTab;
