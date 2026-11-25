"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
Object.defineProperty(exports, "__esModule", { value: true });
exports.CaptionTextEditor = void 0;
const jsx_runtime_1 = require("react/jsx-runtime");
const react_1 = __importStar(require("react"));
const colors_1 = require("../helpers/colors");
const hoverable_1 = require("../helpers/hoverable");
const enter_1 = require("../icons/enter");
const ActionTooltip_1 = require("./ActionTooltip");
const InlineAction_1 = require("./InlineAction");
const RemInput_1 = require("./NewComposition/RemInput");
const container = {
    alignSelf: 'stretch',
    backgroundColor: colors_1.BACKGROUND,
    display: 'flex',
    flexDirection: 'column',
    fontFamily: 'sans-serif',
    width: '100%',
};
const list = {
    display: 'flex',
    flexDirection: 'column',
};
const row = {
    alignItems: 'center',
    backgroundColor: 'var(--remotion-active-caption-background, transparent)',
    borderBottom: `1px solid ${colors_1.LINE_COLOR}`,
    display: 'grid',
    gap: 8,
    gridTemplateColumns: '100px minmax(0, 1fr) 24px',
    padding: '5px 12px',
};
const timing = {
    color: colors_1.LIGHT_TEXT,
    fontFamily: 'monospace',
    fontSize: 11,
    fontVariantNumeric: 'tabular-nums',
    lineHeight: '16px',
    textAlign: 'right',
    whiteSpace: 'nowrap',
};
const empty = {
    color: colors_1.LIGHT_TEXT,
    fontFamily: 'sans-serif',
    fontSize: 13,
    lineHeight: '18px',
    padding: 12,
    textAlign: 'center',
};
const formatMilliseconds = (milliseconds) => {
    return Math.round(milliseconds);
};
exports.CaptionTextEditor = react_1.default.memo(({ captions, onChange, onSave, onCancel, readOnly }) => {
    const listRef = (0, react_1.useRef)(null);
    const cancelledBlurIndexes = (0, react_1.useRef)(new Set());
    const dirtyRef = (0, react_1.useRef)(false);
    const pendingFocusIndex = (0, react_1.useRef)(null);
    const latestRef = (0, react_1.useRef)({ captions, onSave });
    latestRef.current = { captions, onSave };
    const captionRows = (0, react_1.useMemo)(() => {
        const occurrences = new Map();
        return captions.map((caption) => {
            var _a;
            const signature = [
                caption.startMs,
                caption.endMs,
                caption.timestampMs,
                caption.confidence,
            ].join('-');
            const occurrence = (_a = occurrences.get(signature)) !== null && _a !== void 0 ? _a : 0;
            occurrences.set(signature, occurrence + 1);
            return { caption, key: `${signature}-${occurrence}` };
        });
    }, [captions]);
    const commitPending = (0, react_1.useCallback)(() => {
        var _a, _b;
        if (!dirtyRef.current) {
            return;
        }
        dirtyRef.current = false;
        (_b = (_a = latestRef.current).onSave) === null || _b === void 0 ? void 0 : _b.call(_a, latestRef.current.captions);
    }, []);
    (0, react_1.useEffect)(() => {
        return commitPending;
    }, [commitPending]);
    const updateCaption = (0, react_1.useCallback)((index, changes) => {
        const currentCaption = latestRef.current.captions[index];
        if (!currentCaption) {
            return;
        }
        const nextCaptions = latestRef.current.captions.map((caption, captionIndex) => {
            return captionIndex === index ? { ...caption, ...changes } : caption;
        });
        latestRef.current.captions = nextCaptions;
        dirtyRef.current = true;
        onChange(nextCaptions);
    }, [onChange]);
    const updateText = (0, react_1.useCallback)((index, text) => {
        var _a;
        if (((_a = latestRef.current.captions[index]) === null || _a === void 0 ? void 0 : _a.text) === text) {
            return;
        }
        updateCaption(index, { text });
    }, [updateCaption]);
    const updatePageBreakAfter = (0, react_1.useCallback)((index, pageBreakAfter) => {
        var _a;
        if (Boolean((_a = latestRef.current.captions[index]) === null || _a === void 0 ? void 0 : _a.pageBreakAfter) ===
            pageBreakAfter) {
            return;
        }
        updateCaption(index, { pageBreakAfter });
    }, [updateCaption]);
    const focusSibling = (0, react_1.useCallback)((index) => {
        var _a;
        const input = (_a = listRef.current) === null || _a === void 0 ? void 0 : _a.querySelector(`[data-caption-index="${index}"]`);
        input === null || input === void 0 ? void 0 : input.focus();
        input === null || input === void 0 ? void 0 : input.scrollIntoView({ block: 'nearest' });
    }, []);
    (0, react_1.useEffect)(() => {
        var _a;
        const index = pendingFocusIndex.current;
        if (index === null) {
            return;
        }
        pendingFocusIndex.current = null;
        const input = (_a = listRef.current) === null || _a === void 0 ? void 0 : _a.querySelector(`[data-caption-index="${index}"]`);
        input === null || input === void 0 ? void 0 : input.focus();
        input === null || input === void 0 ? void 0 : input.setSelectionRange(1, 1);
        input === null || input === void 0 ? void 0 : input.scrollIntoView({ block: 'nearest' });
    }, [captions]);
    const splitCaption = (0, react_1.useCallback)((index, characterIndex) => {
        const currentCaptions = latestRef.current.captions;
        const caption = currentCaptions[index];
        if (!caption || caption.text.length === 0) {
            return;
        }
        const splitIndex = Math.min(Math.max(characterIndex, 0), caption.text.length);
        const splitTimestamp = Math.round(caption.startMs +
            ((caption.endMs - caption.startMs) * splitIndex) /
                caption.text.length);
        const afterText = caption.text.slice(splitIndex).trimStart();
        const { pageBreakAfter, ...captionWithoutPageBreak } = caption;
        const nextCaptions = [
            ...currentCaptions.slice(0, index),
            {
                ...captionWithoutPageBreak,
                text: caption.text.slice(0, splitIndex).trimEnd(),
                endMs: splitTimestamp,
                timestampMs: caption.timestampMs === null
                    ? null
                    : Math.round((caption.startMs + splitTimestamp) / 2),
                ...(pageBreakAfter === undefined ? {} : { pageBreakAfter: false }),
            },
            {
                ...captionWithoutPageBreak,
                text: ` ${afterText}`,
                startMs: splitTimestamp,
                timestampMs: caption.timestampMs === null
                    ? null
                    : Math.round((splitTimestamp + caption.endMs) / 2),
                ...(pageBreakAfter === undefined ? {} : { pageBreakAfter }),
            },
            ...currentCaptions.slice(index + 1),
        ];
        latestRef.current.captions = nextCaptions;
        dirtyRef.current = true;
        pendingFocusIndex.current = index + 1;
        onChange(nextCaptions);
        commitPending();
    }, [commitPending, onChange]);
    return ((0, jsx_runtime_1.jsx)("div", { style: container, children: (0, jsx_runtime_1.jsxs)("div", { ref: listRef, style: list, children: [captions.length === 0 ? (0, jsx_runtime_1.jsx)("div", { style: empty, children: "No captions" }) : null, captionRows.map(({ caption, key }, index) => {
                    const hasPageBreakAfter = Boolean(caption.pageBreakAfter);
                    const pageBreakTitle = hasPageBreakAfter
                        ? `Remove page break after caption ${index + 1}`
                        : `Add page break after caption ${index + 1}`;
                    return ((0, jsx_runtime_1.jsxs)("div", { "data-caption-row-index": index, style: row, children: [(0, jsx_runtime_1.jsxs)("div", { style: timing, children: [formatMilliseconds(caption.startMs), " \u2192", ' ', formatMilliseconds(caption.endMs), " ms"] }), (0, jsx_runtime_1.jsx)(RemInput_1.RemotionInput, { "aria-label": `Caption ${index + 1}`, "data-caption-index": index, disabled: readOnly, onBlur: (event) => {
                                    if (cancelledBlurIndexes.current.delete(index)) {
                                        return;
                                    }
                                    updateText(index, event.currentTarget.value);
                                    commitPending();
                                }, onChange: (event) => updateText(index, event.target.value), onKeyDown: (event) => {
                                    var _a;
                                    if (event.key === 'Enter' && !event.nativeEvent.isComposing) {
                                        event.preventDefault();
                                        splitCaption(index, (_a = event.currentTarget.selectionStart) !== null && _a !== void 0 ? _a : event.currentTarget.value.length);
                                    }
                                    if (event.key === 'ArrowDown' &&
                                        index < captions.length - 1) {
                                        event.preventDefault();
                                        focusSibling(index + 1);
                                    }
                                    if (event.key === 'ArrowUp' && index > 0) {
                                        event.preventDefault();
                                        focusSibling(index - 1);
                                    }
                                    if (event.key === 'Escape') {
                                        event.preventDefault();
                                        cancelledBlurIndexes.current.add(index);
                                        dirtyRef.current = false;
                                        onCancel === null || onCancel === void 0 ? void 0 : onCancel();
                                        event.currentTarget.blur();
                                    }
                                }, rightAlign: false, small: true, status: "ok", style: {
                                    color: colors_1.WHITE,
                                    fontFamily: 'sans-serif',
                                    fontSize: 12,
                                    lineHeight: '16px',
                                }, value: caption.text }), (0, jsx_runtime_1.jsx)(ActionTooltip_1.ActionTooltip, { label: hasPageBreakAfter
                                    ? 'Remove break after this'
                                    : 'Break after this', shortcut: null, delay: 800, dismissOnClick: true, children: (0, jsx_runtime_1.jsx)(InlineAction_1.InlineAction, { "aria-pressed": hasPageBreakAfter, className: hoverable_1.FOCUS_VISIBLE_ONLY_CLASS_NAME, disabled: readOnly, onClick: () => {
                                        updatePageBreakAfter(index, !hasPageBreakAfter);
                                        commitPending();
                                    }, renderAction: (color) => ((0, jsx_runtime_1.jsx)(enter_1.EnterIcon, { "aria-hidden": "true", color: hasPageBreakAfter ? colors_1.BLUE : color, focusable: "false", style: { height: 16, width: 16 } })), "aria-label": pageBreakTitle, variant: null }) })] }, key));
                })] }) }));
});
exports.CaptionTextEditor.displayName = 'CaptionTextEditor';
