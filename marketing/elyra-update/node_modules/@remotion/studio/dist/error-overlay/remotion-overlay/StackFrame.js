"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.StackElement = void 0;
const jsx_runtime_1 = require("react/jsx-runtime");
const react_1 = require("react");
const Button_1 = require("../../components/Button");
const CodeFrame_1 = require("../../components/CodeFrame");
const colors_1 = require("../../helpers/colors");
const hoverable_1 = require("../../helpers/hoverable");
const open_in_editor_1 = require("../../helpers/open-in-editor");
const caret_1 = require("../../icons/caret");
const format_location_1 = require("./format-location");
const location = {
    color: colors_1.LIGHT_TEXT,
    fontFamily: 'monospace',
    textAlign: 'left',
    whiteSpace: 'nowrap',
};
const locationMask = 'linear-gradient(to right, black calc(100% - 20px), transparent)';
const locationContainer = {
    ...location,
    maskImage: locationMask,
    overflow: 'hidden',
    WebkitMaskImage: locationMask,
};
const header = {
    paddingTop: 10,
    paddingBottom: 10,
    display: 'flex',
    flexDirection: 'row',
    alignItems: 'center',
};
const left = {
    paddingRight: 14,
    flex: 1,
    minWidth: 0,
};
const fnName = {
    lineHeight: 1.5,
    marginBottom: 3,
};
const StackElement = ({ s, lineNumberWidth, isFirst, defaultFunctionName, editorId, collapsible, fontSize, horizontalSpacing, headerAction, }) => {
    var _a;
    const [showCodeFrame, setShowCodeFrame] = (0, react_1.useState)(() => {
        var _a, _b;
        return (!((_a = s.originalFileName) === null || _a === void 0 ? void 0 : _a.includes('node_modules')) &&
            !((_b = s.originalFileName) === null || _b === void 0 ? void 0 : _b.startsWith('webpack/'))) ||
            isFirst;
    });
    const locationRef = (0, react_1.useRef)(null);
    const [locationOverflows, setLocationOverflows] = (0, react_1.useState)(false);
    const fileLocation = s.originalFileName
        ? `${(0, format_location_1.formatLocation)(s.originalFileName)}:${s.originalLineNumber}`
        : null;
    (0, react_1.useLayoutEffect)(() => {
        const element = locationRef.current;
        if (!element) {
            return;
        }
        const update = () => {
            setLocationOverflows(element.scrollWidth > element.clientWidth);
        };
        update();
        const observer = new ResizeObserver(update);
        observer.observe(element);
        if (element.firstElementChild) {
            observer.observe(element.firstElementChild);
        }
        return () => observer.disconnect();
    }, [fileLocation, fontSize]);
    const canOpenFileLocation = Boolean(editorId && s.originalFileName);
    const onOpenFileLocation = (0, react_1.useCallback)(() => {
        if (!canOpenFileLocation) {
            return;
        }
        if (!editorId) {
            return;
        }
        (0, open_in_editor_1.openInEditor)(s, editorId).catch((err) => {
            // eslint-disable-next-line no-console
            console.log('Could not open in editor', err);
        });
    }, [canOpenFileLocation, editorId, s]);
    const toggleCodeFrame = (0, react_1.useCallback)(() => {
        setShowCodeFrame((f) => !f);
    }, []);
    const functionName = (_a = s.originalFunctionName) !== null && _a !== void 0 ? _a : defaultFunctionName;
    const shouldShowCodeFrame = collapsible ? showCodeFrame : true;
    return ((0, jsx_runtime_1.jsxs)("div", { className: "css-reset", children: [(0, jsx_runtime_1.jsxs)("div", { style: {
                    ...header,
                    borderBottom: shouldShowCodeFrame ? 'none' : colors_1.BORDER_WHITE_ALPHA_12,
                    paddingLeft: horizontalSpacing,
                    paddingRight: horizontalSpacing,
                }, children: [(0, jsx_runtime_1.jsxs)("div", { style: left, children: [functionName === null ? null : ((0, jsx_runtime_1.jsx)("div", { style: { ...fnName, fontSize }, children: functionName })), fileLocation ? ((0, jsx_runtime_1.jsx)("div", { ref: locationRef, role: "group", style: { ...locationContainer, fontSize }, "aria-label": locationOverflows ? fileLocation : undefined, children: canOpenFileLocation ? ((0, jsx_runtime_1.jsx)("button", { type: "button", className: `${hoverable_1.HOVERABLE_CLASS_NAME} ${hoverable_1.FOCUS_VISIBLE_ONLY_CLASS_NAME}`, onClick: onOpenFileLocation, style: {
                                        ...location,
                                        ...(0, hoverable_1.hoverableStyle)({
                                            idleBackground: colors_1.TRANSPARENT,
                                            hoverBackground: colors_1.TRANSPARENT,
                                            idleColor: colors_1.LIGHT_TEXT,
                                            hoverColor: colors_1.WHITE,
                                        }),
                                        appearance: 'none',
                                        border: 'none',
                                        color: undefined,
                                        cursor: 'default',
                                        fontSize,
                                        padding: 0,
                                    }, children: fileLocation })) : (fileLocation) })) : null] }), headerAction, collapsible &&
                        s.originalScriptCode &&
                        s.originalScriptCode.length > 0 ? ((0, jsx_runtime_1.jsx)(Button_1.Button, { onClick: toggleCodeFrame, children: (0, jsx_runtime_1.jsx)("div", { style: {
                                display: 'flex',
                                transform: shouldShowCodeFrame ? undefined : 'rotate(-90deg)',
                            }, children: (0, jsx_runtime_1.jsx)(caret_1.CaretDown, {}) }) })) : null] }), (0, jsx_runtime_1.jsx)("div", { children: s.originalScriptCode &&
                    s.originalScriptCode.length > 0 &&
                    shouldShowCodeFrame ? ((0, jsx_runtime_1.jsx)(CodeFrame_1.CodeFrame, { fontSize: fontSize, horizontalMargin: horizontalSpacing, lineNumberWidth: lineNumberWidth, source: s.originalScriptCode })) : null })] }));
};
exports.StackElement = StackElement;
