"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.ClippedTextTooltip = exports.ActionTooltip = void 0;
const jsx_runtime_1 = require("react/jsx-runtime");
const react_1 = require("react");
const react_dom_1 = require("react-dom");
const colors_1 = require("../helpers/colors");
const observe_hover_1 = require("../helpers/observe-hover");
const z_index_1 = require("../state/z-index");
const KeyboardShortcutLabel_1 = require("./KeyboardShortcutLabel");
const portals_1 = require("./Menu/portals");
const styles_1 = require("./Menu/styles");
const defaultTriggerStyle = { display: 'inline-flex' };
const tooltipStyle = {
    position: 'fixed',
    display: 'flex',
    alignItems: 'center',
    gap: 6,
    backgroundColor: colors_1.TIMELINE_BACKGROUND_COLOR,
    color: colors_1.WHITE_ALPHA_90,
    borderRadius: 6,
    padding: '6px 8px',
    fontSize: 12,
    lineHeight: '16px',
    whiteSpace: 'pre-wrap',
    overflowWrap: 'anywhere',
    maxWidth: 'calc(100vw - 16px)',
    boxShadow: styles_1.SHADOW_TOWARDS_TOP,
    pointerEvents: 'none',
};
const labelStyle = {
    font: 'inherit',
    color: 'inherit',
    minWidth: 0,
};
const shortcutStyle = {
    ...labelStyle,
    backgroundColor: 'transparent',
    opacity: 0.6,
    whiteSpace: 'nowrap',
    flexShrink: 0,
};
let visibleTooltipCount = 0;
let lastTooltipHiddenAt = null;
const TOOLTIP_SKIP_DELAY_WINDOW = 300;
const Tooltip = ({ label, shortcut, delay, dismissOnClick, side = 'top', triggerStyle, children, overflowTarget, }) => {
    var _a, _b;
    const triggerRef = (0, react_1.useRef)(null);
    const tooltipRef = (0, react_1.useRef)(null);
    const timer = (0, react_1.useRef)(null);
    const activation = (0, react_1.useRef)(null);
    const delayRef = (0, react_1.useRef)(delay);
    // Dismissal must also cancel a tooltip that is waiting for its hover delay.
    const [active, setActive] = (0, react_1.useState)(false);
    const [visible, setVisible] = (0, react_1.useState)(false);
    const [position, setPosition] = (0, react_1.useState)(null);
    const { currentZIndex } = (0, z_index_1.useZIndex)();
    (0, react_1.useLayoutEffect)(() => {
        delayRef.current = delay;
    }, [delay]);
    (0, react_1.useLayoutEffect)(() => {
        if (!visible) {
            return;
        }
        visibleTooltipCount++;
        return () => {
            visibleTooltipCount--;
            lastTooltipHiddenAt = Date.now();
        };
    }, [visible]);
    const hide = (0, react_1.useCallback)(() => {
        activation.current = null;
        if (timer.current !== null) {
            clearTimeout(timer.current);
            timer.current = null;
        }
        setActive(false);
        setVisible(false);
        setPosition(null);
    }, []);
    const canShow = (0, react_1.useCallback)(() => {
        if (overflowTarget === null) {
            return true;
        }
        const element = overflowTarget.current;
        return (element !== null &&
            (element.scrollWidth > element.clientWidth ||
                element.scrollHeight > element.clientHeight));
    }, [overflowTarget]);
    const show = (0, react_1.useCallback)(() => {
        if (timer.current !== null) {
            clearTimeout(timer.current);
            timer.current = null;
        }
        if (!canShow()) {
            hide();
            return;
        }
        setActive(true);
        setVisible(true);
    }, [canShow, hide]);
    (0, react_1.useLayoutEffect)(() => {
        const trigger = triggerRef.current;
        if (!trigger) {
            return;
        }
        const unobserve = (0, observe_hover_1.observeHover)({
            element: trigger,
            onHoverChange: (hovered) => {
                // Keyboard focus is independent of the pointer's location.
                if (activation.current === 'focus') {
                    return;
                }
                if (!hovered || !canShow()) {
                    hide();
                    return;
                }
                activation.current = 'hover';
                const hoverDelay = delayRef.current;
                // Keep adjacent controls instant, including crossing the gap between them.
                if (!hoverDelay ||
                    visibleTooltipCount > 0 ||
                    (lastTooltipHiddenAt !== null &&
                        Date.now() - lastTooltipHiddenAt < TOOLTIP_SKIP_DELAY_WINDOW)) {
                    show();
                    return;
                }
                setActive(true);
                timer.current = setTimeout(() => {
                    // Recheck before opening, even if the browser missed a leave event.
                    if (trigger.isConnected && trigger.matches(':hover')) {
                        show();
                    }
                    else {
                        hide();
                    }
                }, hoverDelay);
            },
        });
        return () => {
            unobserve();
            activation.current = null;
            if (timer.current !== null) {
                clearTimeout(timer.current);
                timer.current = null;
            }
        };
    }, [canShow, hide, show]);
    (0, react_1.useEffect)(() => {
        const element = overflowTarget === null || overflowTarget === void 0 ? void 0 : overflowTarget.current;
        if (!active || !element) {
            return;
        }
        const observer = new ResizeObserver(() => {
            if (!canShow()) {
                hide();
            }
        });
        observer.observe(element);
        return () => observer.disconnect();
    }, [active, canShow, hide, overflowTarget]);
    (0, react_1.useEffect)(() => {
        var _a;
        if (!active) {
            return;
        }
        const onKeyDown = (event) => {
            if (event.key === 'Escape') {
                hide();
            }
        };
        const doc = (_a = triggerRef.current) === null || _a === void 0 ? void 0 : _a.ownerDocument;
        const win = doc === null || doc === void 0 ? void 0 : doc.defaultView;
        if (!doc || !win) {
            return;
        }
        const onVisibilityChange = () => {
            if (doc.hidden) {
                hide();
            }
        };
        win.addEventListener('keydown', onKeyDown);
        win.addEventListener('blur', hide);
        win.addEventListener('resize', hide);
        win.addEventListener('scroll', hide, true);
        doc.addEventListener('visibilitychange', onVisibilityChange);
        return () => {
            if (timer.current !== null) {
                clearTimeout(timer.current);
                timer.current = null;
            }
            win.removeEventListener('keydown', onKeyDown);
            win.removeEventListener('blur', hide);
            win.removeEventListener('resize', hide);
            win.removeEventListener('scroll', hide, true);
            doc.removeEventListener('visibilitychange', onVisibilityChange);
        };
    }, [active, hide]);
    (0, react_1.useLayoutEffect)(() => {
        if (!visible || !triggerRef.current || !tooltipRef.current) {
            return;
        }
        if (!canShow()) {
            hide();
            return;
        }
        const trigger = triggerRef.current.getBoundingClientRect();
        const tooltip = tooltipRef.current.getBoundingClientRect();
        if (side === 'right') {
            const right = trigger.right + 4;
            setPosition({
                left: right + tooltip.width <= window.innerWidth - 8
                    ? right
                    : Math.max(8, trigger.left - tooltip.width - 4),
                top: Math.max(8, Math.min(trigger.top + (trigger.height - tooltip.height) / 2, window.innerHeight - tooltip.height - 8)),
            });
            return;
        }
        const above = trigger.top - tooltip.height - 4;
        setPosition({
            left: Math.max(8, Math.min(trigger.left + (trigger.width - tooltip.width) / 2, window.innerWidth - tooltip.width - 8)),
            top: Math.max(8, Math.min(above >= 8 ? above : trigger.bottom + 4, window.innerHeight - tooltip.height - 8)),
        });
    }, [canShow, hide, label, shortcut, side, visible]);
    return ((0, jsx_runtime_1.jsxs)(jsx_runtime_1.Fragment, { children: [(0, jsx_runtime_1.jsx)("span", { ref: triggerRef, style: { ...defaultTriggerStyle, ...triggerStyle }, onPointerDownCapture: dismissOnClick ? hide : undefined, onClickCapture: dismissOnClick ? hide : undefined, onFocus: (event) => {
                    if (event.currentTarget.contains(event.target) &&
                        event.target.matches(':focus-visible')) {
                        activation.current = 'focus';
                        show();
                    }
                }, onBlur: (event) => {
                    if (!event.currentTarget.contains(event.relatedTarget)) {
                        hide();
                    }
                }, children: children }), visible
                ? (0, react_dom_1.createPortal)((0, jsx_runtime_1.jsxs)("div", { ref: tooltipRef, role: "tooltip", className: "css-reset", style: {
                        ...tooltipStyle,
                        left: (_a = position === null || position === void 0 ? void 0 : position.left) !== null && _a !== void 0 ? _a : 0,
                        top: (_b = position === null || position === void 0 ? void 0 : position.top) !== null && _b !== void 0 ? _b : 0,
                        visibility: position ? 'visible' : 'hidden',
                    }, children: [(0, jsx_runtime_1.jsx)("span", { style: labelStyle, children: label }), shortcut ? ((0, jsx_runtime_1.jsx)("kbd", { style: shortcutStyle, children: (0, jsx_runtime_1.jsx)(KeyboardShortcutLabel_1.KeyboardShortcutLabel, { shortcut: shortcut, style: null }) })) : null] }), (0, portals_1.getPortal)(currentZIndex))
                : null] }));
};
const ActionTooltip = (props) => {
    return (0, jsx_runtime_1.jsx)(Tooltip, { ...props, overflowTarget: null });
};
exports.ActionTooltip = ActionTooltip;
const ClippedTextTooltip = (props) => {
    return (0, jsx_runtime_1.jsx)(Tooltip, { ...props });
};
exports.ClippedTextTooltip = ClippedTextTooltip;
