"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.TimelineTranslateField = void 0;
const jsx_runtime_1 = require("react/jsx-runtime");
const react_1 = require("react");
const InputDragger_1 = require("../NewComposition/InputDragger");
const timeline_field_utils_1 = require("./timeline-field-utils");
const timeline_translate_utils_1 = require("./timeline-translate-utils");
const TimelineSchemaField_1 = require("./TimelineSchemaField");
const Transform3DModeContext_1 = require("./Transform3DModeContext");
const use_timeline_field_edit_1 = require("./use-timeline-field-edit");
const leftDraggerStyle = {
    paddingLeft: 0,
};
const rightDraggerStyle = {
    paddingRight: 0,
};
const containerStyle = {
    display: 'flex',
    gap: 4,
};
const translateDragSensitivity = 3;
const TimelineTranslateField = ({ field, propStatus, effectiveValue, onSave, onDragValueChange, onDragEnd, }) => {
    var _a;
    var _b, _c, _d, _e;
    const { markEdit, finishEdit } = (0, use_timeline_field_edit_1.useTimelineFieldEdit)();
    const [dragX, setDragX] = (0, react_1.useState)(null);
    const [dragY, setDragY] = (0, react_1.useState)(null);
    const [dragZ, setDragZ] = (0, react_1.useState)(null);
    const transform3DMode = (0, react_1.useContext)(Transform3DModeContext_1.Transform3DModeContext);
    const parsedTranslate = (0, react_1.useMemo)(() => (0, timeline_translate_utils_1.parseTranslateWithUnits)(String(effectiveValue !== null && effectiveValue !== void 0 ? effectiveValue : '0px 0px')), [effectiveValue]);
    const codeX = (_b = parsedTranslate === null || parsedTranslate === void 0 ? void 0 : parsedTranslate[0].value) !== null && _b !== void 0 ? _b : 0;
    const codeY = (_c = parsedTranslate === null || parsedTranslate === void 0 ? void 0 : parsedTranslate[1].value) !== null && _c !== void 0 ? _c : 0;
    const codeZ = (_d = (_a = parsedTranslate === null || parsedTranslate === void 0 ? void 0 : parsedTranslate[2]) === null || _a === void 0 ? void 0 : _a.value) !== null && _d !== void 0 ? _d : null;
    const show3D = transform3DMode || (codeZ !== null && codeZ !== 0);
    const configuredStep = field.fieldSchema.type === 'translate' ? field.fieldSchema.step : undefined;
    const step = configuredStep !== null && configuredStep !== void 0 ? configuredStep : 1;
    const decimalPlaces = (0, react_1.useMemo)(() => (0, timeline_field_utils_1.getTimelineDisplayDecimalPlaces)({
        defaultDecimalPlaces: 1,
        step: configuredStep,
    }), [configuredStep]);
    const formatCoordinate = (0, react_1.useCallback)((v, unit) => {
        return `${(0, timeline_field_utils_1.formatTimelineNumber)({
            decimalPlaces,
            fixed: false,
            value: (0, timeline_field_utils_1.normalizeTimelineNumber)(Number(v)),
        })}${unit}`;
    }, [decimalPlaces]);
    const serialize = (0, react_1.useCallback)((x, y, z = dragZ !== null && dragZ !== void 0 ? dragZ : codeZ) => {
        var _a, _b;
        return (0, timeline_translate_utils_1.serializeTranslateWithUnits)([
            { value: x, unit: (_a = parsedTranslate === null || parsedTranslate === void 0 ? void 0 : parsedTranslate[0].unit) !== null && _a !== void 0 ? _a : 'px' },
            { value: y, unit: (_b = parsedTranslate === null || parsedTranslate === void 0 ? void 0 : parsedTranslate[1].unit) !== null && _b !== void 0 ? _b : 'px' },
            z === null ? null : { value: z, unit: 'px' },
        ], decimalPlaces);
    }, [codeZ, decimalPlaces, dragZ, parsedTranslate]);
    // --- X callbacks ---
    const onValueChangeCancel = (0, react_1.useCallback)(() => {
        markEdit();
        setDragX(null);
        setDragY(null);
        setDragZ(null);
        onDragEnd('cancel');
    }, [markEdit, onDragEnd]);
    const onXChange = (0, react_1.useCallback)((newVal) => {
        markEdit();
        setDragX(newVal);
        const currentY = dragY !== null && dragY !== void 0 ? dragY : codeY;
        onDragValueChange(serialize(newVal, currentY));
    }, [codeY, dragY, onDragValueChange, serialize, markEdit]);
    const onXChangeEnd = (0, react_1.useCallback)((newVal) => {
        markEdit();
        const currentY = dragY !== null && dragY !== void 0 ? dragY : codeY;
        const newStr = serialize(newVal, currentY);
        if (newStr !== propStatus.codeValue) {
            finishEdit(onSave(newStr), () => {
                setDragX(null);
                onDragEnd('commit');
            });
        }
        else {
            setDragX(null);
            onDragEnd('cancel');
        }
    }, [
        codeY,
        dragY,
        onDragEnd,
        onSave,
        propStatus,
        serialize,
        markEdit,
        finishEdit,
    ]);
    const onXTextChange = (0, react_1.useCallback)((newVal) => {
        const parsed = Number(newVal);
        if (!Number.isNaN(parsed)) {
            const currentY = dragY !== null && dragY !== void 0 ? dragY : codeY;
            const newStr = serialize(parsed, currentY);
            if (newStr !== propStatus.codeValue) {
                markEdit();
                setDragX(parsed);
                finishEdit(onSave(newStr), () => {
                    setDragX(null);
                });
            }
        }
    }, [codeY, dragY, onSave, propStatus, serialize, markEdit, finishEdit]);
    // --- Y callbacks ---
    const onYChange = (0, react_1.useCallback)((newVal) => {
        markEdit();
        setDragY(newVal);
        const currentX = dragX !== null && dragX !== void 0 ? dragX : codeX;
        onDragValueChange(serialize(currentX, newVal));
    }, [codeX, dragX, onDragValueChange, serialize, markEdit]);
    const onYChangeEnd = (0, react_1.useCallback)((newVal) => {
        markEdit();
        const currentX = dragX !== null && dragX !== void 0 ? dragX : codeX;
        const newStr = serialize(currentX, newVal);
        if (newStr !== propStatus.codeValue) {
            finishEdit(onSave(newStr), () => {
                setDragY(null);
                onDragEnd('commit');
            });
        }
        else {
            setDragY(null);
            onDragEnd('cancel');
        }
    }, [
        codeX,
        dragX,
        onDragEnd,
        onSave,
        propStatus,
        serialize,
        markEdit,
        finishEdit,
    ]);
    const onYTextChange = (0, react_1.useCallback)((newVal) => {
        const parsed = Number(newVal);
        if (!Number.isNaN(parsed)) {
            const currentX = dragX !== null && dragX !== void 0 ? dragX : codeX;
            const newStr = serialize(currentX, parsed);
            if (newStr !== propStatus.codeValue) {
                markEdit();
                setDragY(parsed);
                finishEdit(onSave(newStr), () => {
                    setDragY(null);
                });
            }
        }
    }, [codeX, dragX, onSave, propStatus, serialize, markEdit, finishEdit]);
    const onZChange = (0, react_1.useCallback)((newVal) => {
        markEdit();
        setDragZ(newVal);
        onDragValueChange(serialize(dragX !== null && dragX !== void 0 ? dragX : codeX, dragY !== null && dragY !== void 0 ? dragY : codeY, newVal));
    }, [codeX, codeY, dragX, dragY, onDragValueChange, serialize, markEdit]);
    const onZChangeEnd = (0, react_1.useCallback)((newVal) => {
        markEdit();
        const newStr = serialize(dragX !== null && dragX !== void 0 ? dragX : codeX, dragY !== null && dragY !== void 0 ? dragY : codeY, newVal);
        if (newStr !== propStatus.codeValue) {
            finishEdit(onSave(newStr), () => {
                setDragZ(null);
                onDragEnd('commit');
            });
        }
        else {
            setDragZ(null);
            onDragEnd('cancel');
        }
    }, [
        codeX,
        codeY,
        dragX,
        dragY,
        onDragEnd,
        onSave,
        propStatus,
        serialize,
        markEdit,
        finishEdit,
    ]);
    const onZTextChange = (0, react_1.useCallback)((newVal) => {
        const parsed = Number(newVal);
        if (!Number.isNaN(parsed)) {
            const newStr = serialize(dragX !== null && dragX !== void 0 ? dragX : codeX, dragY !== null && dragY !== void 0 ? dragY : codeY, parsed);
            if (newStr !== propStatus.codeValue) {
                markEdit();
                setDragZ(parsed);
                finishEdit(onSave(newStr), () => setDragZ(null));
            }
        }
    }, [
        codeX,
        codeY,
        dragX,
        dragY,
        onSave,
        propStatus,
        serialize,
        markEdit,
        finishEdit,
    ]);
    if (parsedTranslate === null) {
        return ((0, jsx_runtime_1.jsx)(TimelineSchemaField_1.UnsupportedStatus, { label: "unsupported offset", formattedValue: false }));
    }
    return ((0, jsx_runtime_1.jsxs)("span", { style: containerStyle, children: [(0, jsx_runtime_1.jsx)(InputDragger_1.InputDragger, { onValueChangeCancel: onValueChangeCancel, type: "number", value: dragX !== null && dragX !== void 0 ? dragX : codeX, buttonStyle: leftDraggerStyle, style: leftDraggerStyle, status: "ok", small: true, onValueChange: onXChange, onValueChangeEnd: onXChangeEnd, onTextChange: onXTextChange, min: -Infinity, max: Infinity, step: step, formatter: (value) => formatCoordinate(value, parsedTranslate[0].unit), rightAlign: false, snapToStep: false, dragDecimalPlaces: decimalPlaces, dragSensitivity: translateDragSensitivity, "aria-label": "Offset X" }), (0, jsx_runtime_1.jsx)("div", { style: { marginLeft: -6, marginRight: -6 } }), (0, jsx_runtime_1.jsx)(InputDragger_1.InputDragger, { onValueChangeCancel: onValueChangeCancel, type: "number", value: dragY !== null && dragY !== void 0 ? dragY : codeY, buttonStyle: rightDraggerStyle, style: rightDraggerStyle, status: "ok", small: true, onValueChange: onYChange, onValueChangeEnd: onYChangeEnd, onTextChange: onYTextChange, min: -Infinity, max: Infinity, step: step, formatter: (value) => formatCoordinate(value, parsedTranslate[1].unit), rightAlign: false, snapToStep: false, dragDecimalPlaces: decimalPlaces, dragSensitivity: translateDragSensitivity, "aria-label": "Offset Y" }), show3D ? ((0, jsx_runtime_1.jsxs)(jsx_runtime_1.Fragment, { children: [(0, jsx_runtime_1.jsx)("div", { style: { marginLeft: -6, marginRight: -6 } }), (0, jsx_runtime_1.jsx)(InputDragger_1.InputDragger, { onValueChangeCancel: onValueChangeCancel, type: "number", value: (_e = dragZ !== null && dragZ !== void 0 ? dragZ : codeZ) !== null && _e !== void 0 ? _e : 0, buttonStyle: rightDraggerStyle, style: rightDraggerStyle, status: "ok", small: true, onValueChange: onZChange, onValueChangeEnd: onZChangeEnd, onTextChange: onZTextChange, min: -Infinity, max: Infinity, step: step, formatter: (value) => formatCoordinate(value, 'px'), rightAlign: false, snapToStep: false, dragDecimalPlaces: decimalPlaces, dragSensitivity: translateDragSensitivity, "aria-label": "Offset Z" })] })) : null] }));
};
exports.TimelineTranslateField = TimelineTranslateField;
