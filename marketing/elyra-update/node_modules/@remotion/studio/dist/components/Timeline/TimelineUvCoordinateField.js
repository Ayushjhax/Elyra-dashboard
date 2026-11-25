"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.TimelineUvCoordinateField = void 0;
const jsx_runtime_1 = require("react/jsx-runtime");
const react_1 = require("react");
const InputDragger_1 = require("../NewComposition/InputDragger");
const timeline_field_display_utils_1 = require("./timeline-field-display-utils");
const timeline_field_utils_1 = require("./timeline-field-utils");
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
const parseUvCoordinate = (value) => {
    if (Array.isArray(value) &&
        value.length === 2 &&
        value.every((item) => typeof item === 'number' && Number.isFinite(item))) {
        return [value[0], value[1]];
    }
    return [0, 0];
};
const tuplesEqual = (left, right) => {
    if (!Array.isArray(left) || left.length !== 2) {
        return false;
    }
    return left[0] === right[0] && left[1] === right[1];
};
const TimelineUvCoordinateField = ({ field, propStatus, effectiveValue, onSave, onDragValueChange, onDragEnd, }) => {
    var _a, _b;
    const { markEdit, finishEdit } = (0, use_timeline_field_edit_1.useTimelineFieldEdit)();
    const [dragX, setDragX] = (0, react_1.useState)(null);
    const [dragY, setDragY] = (0, react_1.useState)(null);
    const [codeX, codeY] = (0, react_1.useMemo)(() => parseUvCoordinate(effectiveValue), [effectiveValue]);
    const configuredStep = field.fieldSchema.type === 'uv-coordinate'
        ? field.fieldSchema.step
        : undefined;
    const step = configuredStep !== null && configuredStep !== void 0 ? configuredStep : 0.01;
    const min = field.fieldSchema.type === 'uv-coordinate'
        ? ((_a = field.fieldSchema.min) !== null && _a !== void 0 ? _a : -Infinity)
        : -Infinity;
    const max = field.fieldSchema.type === 'uv-coordinate'
        ? ((_b = field.fieldSchema.max) !== null && _b !== void 0 ? _b : Infinity)
        : Infinity;
    const decimalPlaces = (0, react_1.useMemo)(() => (0, timeline_field_utils_1.getTimelineDisplayDecimalPlaces)({
        defaultDecimalPlaces: 2,
        step: configuredStep,
    }), [configuredStep]);
    const formatter = (0, react_1.useCallback)((v) => {
        return (0, timeline_field_display_utils_1.formatTimelineFieldValueForDisplay)({
            fieldSchema: field.fieldSchema,
            value: v,
        });
    }, [field.fieldSchema]);
    const onValueChangeCancel = (0, react_1.useCallback)(() => {
        markEdit();
        setDragX(null);
        setDragY(null);
        onDragEnd('cancel');
    }, [markEdit, onDragEnd]);
    const onXChange = (0, react_1.useCallback)((newVal) => {
        markEdit();
        setDragX(newVal);
        const currentY = dragY !== null && dragY !== void 0 ? dragY : codeY;
        onDragValueChange([newVal, currentY]);
    }, [onDragValueChange, dragY, codeY, markEdit]);
    const onXChangeEnd = (0, react_1.useCallback)((newVal) => {
        markEdit();
        const currentY = dragY !== null && dragY !== void 0 ? dragY : codeY;
        const newTuple = [newVal, currentY];
        if (!tuplesEqual(propStatus.codeValue, newTuple)) {
            finishEdit(onSave(newTuple), () => {
                setDragX(null);
                onDragEnd('commit');
            });
        }
        else {
            setDragX(null);
            onDragEnd('cancel');
        }
    }, [dragY, codeY, propStatus, onSave, onDragEnd, markEdit, finishEdit]);
    const onXTextChange = (0, react_1.useCallback)((newVal) => {
        const parsed = Number(newVal);
        if (!Number.isNaN(parsed)) {
            const currentY = dragY !== null && dragY !== void 0 ? dragY : codeY;
            const newTuple = [parsed, currentY];
            if (!tuplesEqual(propStatus.codeValue, newTuple)) {
                markEdit();
                setDragX(parsed);
                finishEdit(onSave(newTuple), () => {
                    setDragX(null);
                });
            }
        }
    }, [propStatus, dragY, codeY, onSave, markEdit, finishEdit]);
    const onYChange = (0, react_1.useCallback)((newVal) => {
        markEdit();
        setDragY(newVal);
        const currentX = dragX !== null && dragX !== void 0 ? dragX : codeX;
        onDragValueChange([currentX, newVal]);
    }, [onDragValueChange, dragX, codeX, markEdit]);
    const onYChangeEnd = (0, react_1.useCallback)((newVal) => {
        markEdit();
        const currentX = dragX !== null && dragX !== void 0 ? dragX : codeX;
        const newTuple = [currentX, newVal];
        if (!tuplesEqual(propStatus.codeValue, newTuple)) {
            finishEdit(onSave(newTuple), () => {
                setDragY(null);
                onDragEnd('commit');
            });
        }
        else {
            setDragY(null);
            onDragEnd('cancel');
        }
    }, [dragX, codeX, propStatus, onSave, onDragEnd, markEdit, finishEdit]);
    const onYTextChange = (0, react_1.useCallback)((newVal) => {
        const parsed = Number(newVal);
        if (!Number.isNaN(parsed)) {
            const currentX = dragX !== null && dragX !== void 0 ? dragX : codeX;
            const newTuple = [currentX, parsed];
            if (!tuplesEqual(propStatus.codeValue, newTuple)) {
                markEdit();
                setDragY(parsed);
                finishEdit(onSave(newTuple), () => {
                    setDragY(null);
                });
            }
        }
    }, [propStatus, onSave, dragX, codeX, markEdit, finishEdit]);
    return ((0, jsx_runtime_1.jsxs)("span", { style: containerStyle, children: [(0, jsx_runtime_1.jsx)(InputDragger_1.InputDragger, { onValueChangeCancel: onValueChangeCancel, type: "number", value: dragX !== null && dragX !== void 0 ? dragX : codeX, buttonStyle: leftDraggerStyle, style: leftDraggerStyle, status: "ok", small: true, onValueChange: onXChange, onValueChangeEnd: onXChangeEnd, onTextChange: onXTextChange, min: min, max: max, step: step, formatter: formatter, rightAlign: false, snapToStep: false, dragDecimalPlaces: decimalPlaces }), (0, jsx_runtime_1.jsx)("div", { style: { marginLeft: -6, marginRight: -6 } }), (0, jsx_runtime_1.jsx)(InputDragger_1.InputDragger, { onValueChangeCancel: onValueChangeCancel, type: "number", value: dragY !== null && dragY !== void 0 ? dragY : codeY, buttonStyle: rightDraggerStyle, style: rightDraggerStyle, status: "ok", small: true, onValueChange: onYChange, onValueChangeEnd: onYChangeEnd, onTextChange: onYTextChange, min: min, max: max, step: step, formatter: formatter, rightAlign: false, snapToStep: false, dragDecimalPlaces: decimalPlaces })] }));
};
exports.TimelineUvCoordinateField = TimelineUvCoordinateField;
