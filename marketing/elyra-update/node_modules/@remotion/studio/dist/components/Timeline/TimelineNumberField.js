"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.TimelineNumberField = void 0;
const jsx_runtime_1 = require("react/jsx-runtime");
const react_1 = require("react");
const InputDragger_1 = require("../NewComposition/InputDragger");
const timeline_field_display_utils_1 = require("./timeline-field-display-utils");
const timeline_field_utils_1 = require("./timeline-field-utils");
const use_timeline_field_edit_1 = require("./use-timeline-field-edit");
const TimelineNumberField = ({ field, effectiveValue, onSave, onDragValueChange, onDragEnd, propStatus, }) => {
    var _a, _b;
    const { markEdit, finishEdit } = (0, use_timeline_field_edit_1.useTimelineFieldEdit)();
    const [dragValue, setDragValue] = (0, react_1.useState)(null);
    const onValueChangeCancel = (0, react_1.useCallback)(() => {
        markEdit();
        setDragValue(null);
        onDragEnd('cancel');
    }, [markEdit, onDragEnd]);
    const onValueChange = (0, react_1.useCallback)((newVal) => {
        markEdit();
        setDragValue(newVal);
        onDragValueChange(newVal);
    }, [onDragValueChange, markEdit]);
    const onValueChangeEnd = (0, react_1.useCallback)((newVal) => {
        markEdit();
        if (newVal !== propStatus.codeValue) {
            finishEdit(onSave(newVal), () => {
                setDragValue(null);
                onDragEnd('commit');
            });
        }
        else {
            setDragValue(null);
            onDragEnd('cancel');
        }
    }, [onSave, propStatus, onDragEnd, markEdit, finishEdit]);
    const onTextChange = (0, react_1.useCallback)((newVal) => {
        const parsed = Number(newVal);
        if (!Number.isNaN(parsed) && parsed !== propStatus.codeValue) {
            markEdit();
            setDragValue(parsed);
            finishEdit(onSave(parsed), () => {
                setDragValue(null);
            });
        }
    }, [onSave, propStatus, markEdit, finishEdit]);
    const configuredStep = field.fieldSchema.type === 'number' ? field.fieldSchema.step : undefined;
    const currentValue = dragValue !== null && dragValue !== void 0 ? dragValue : effectiveValue;
    const step = field.fieldSchema.type === 'font-weight' && currentValue % 100 === 0
        ? 100
        : (configuredStep !== null && configuredStep !== void 0 ? configuredStep : 1);
    const integerOnly = field.fieldSchema.type === 'number' && field.fieldSchema.integer === true;
    const inherited = field.key === 'premountFor' &&
        field.fieldSchema.default === undefined &&
        propStatus.codeValue === undefined &&
        dragValue === null;
    const formatter = (0, react_1.useCallback)((v) => {
        const formatted = (0, timeline_field_display_utils_1.formatTimelineFieldValueForDisplay)({
            fieldSchema: field.fieldSchema,
            value: v,
        });
        return inherited ? `Default (${formatted})` : formatted;
    }, [field.fieldSchema, inherited]);
    return ((0, jsx_runtime_1.jsx)(InputDragger_1.InputDragger, { onValueChangeCancel: onValueChangeCancel, type: "number", value: currentValue, buttonStyle: timeline_field_utils_1.leftAlignedDraggerStyle, style: timeline_field_utils_1.draggerStyle, status: "ok", small: true, onValueChange: onValueChange, onValueChangeEnd: onValueChangeEnd, onTextChange: onTextChange, min: field.fieldSchema.type === 'number'
            ? ((_a = field.fieldSchema.min) !== null && _a !== void 0 ? _a : -Infinity)
            : field.fieldSchema.type === 'font-weight'
                ? 1
                : -Infinity, max: field.fieldSchema.type === 'number'
            ? ((_b = field.fieldSchema.max) !== null && _b !== void 0 ? _b : Infinity)
            : field.fieldSchema.type === 'font-weight'
                ? 1000
                : Infinity, step: step, dragSensitivity: field.fieldSchema.type === 'font-weight' && step === 100 ? 0.1 : 1, formatter: formatter, rightAlign: false, allowStepMismatch: true, integerOnly: integerOnly }));
};
exports.TimelineNumberField = TimelineNumberField;
