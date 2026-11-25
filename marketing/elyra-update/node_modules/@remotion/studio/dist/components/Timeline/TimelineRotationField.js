"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.TimelineRotationField = void 0;
const jsx_runtime_1 = require("react/jsx-runtime");
const react_1 = require("react");
const InputDragger_1 = require("../NewComposition/InputDragger");
const timeline_field_utils_1 = require("./timeline-field-utils");
const timeline_rotation_field_utils_1 = require("./timeline-rotation-field-utils");
const timeline_rotation_utils_1 = require("./timeline-rotation-utils");
const Transform3DModeContext_1 = require("./Transform3DModeContext");
const use_timeline_field_edit_1 = require("./use-timeline-field-edit");
const containerStyle = {
    alignItems: 'center',
    display: 'flex',
    gap: 4,
};
const compactDraggerStyle = {
    paddingLeft: 2,
    paddingRight: 2,
};
const ROTATION_LABELS = ['X', 'Y', 'Z'];
const TimelineRotationField = ({ field, effectiveValue, propStatus, onSave, onDragValueChange, onDragEnd, }) => {
    var _a, _b;
    const { markEdit, finishEdit } = (0, use_timeline_field_edit_1.useTimelineFieldEdit)();
    const [dragValue, setDragValue] = (0, react_1.useState)(null);
    const [dragRotation, setDragRotation] = (0, react_1.useState)(null);
    const transform3DMode = (0, react_1.useContext)(Transform3DModeContext_1.Transform3DModeContext);
    const isCssRotation = field.fieldSchema.type === 'rotation-css';
    const cssRotation = (0, react_1.useMemo)(() => isCssRotation
        ? (0, timeline_rotation_utils_1.parseCssRotationToEuler)(String(effectiveValue !== null && effectiveValue !== void 0 ? effectiveValue : '0deg'))
        : [0, 0, 0], [effectiveValue, isCssRotation]);
    const show3D = isCssRotation &&
        (transform3DMode || cssRotation[0] !== 0 || cssRotation[1] !== 0);
    const degrees = isCssRotation
        ? cssRotation[2]
        : typeof effectiveValue === 'number'
            ? effectiveValue
            : 0;
    const configuredStep = field.fieldSchema.type === 'rotation-css' ||
        field.fieldSchema.type === 'rotation-degrees'
        ? field.fieldSchema.step
        : undefined;
    const step = configuredStep !== null && configuredStep !== void 0 ? configuredStep : 1;
    const min = field.fieldSchema.type === 'rotation-degrees'
        ? ((_a = field.fieldSchema.min) !== null && _a !== void 0 ? _a : -Infinity)
        : -Infinity;
    const max = field.fieldSchema.type === 'rotation-degrees'
        ? ((_b = field.fieldSchema.max) !== null && _b !== void 0 ? _b : Infinity)
        : Infinity;
    const decimalPlaces = (0, react_1.useMemo)(() => (0, timeline_field_utils_1.getTimelineDisplayDecimalPlaces)({
        defaultDecimalPlaces: 1,
        step: configuredStep,
    }), [configuredStep]);
    const serializeValue = (0, react_1.useCallback)((value) => isCssRotation
        ? (0, timeline_rotation_utils_1.serializeCssRotation)(value, Math.max(6, decimalPlaces))
        : (0, timeline_field_utils_1.normalizeTimelineNumber)(value), [decimalPlaces, isCssRotation]);
    const serializeRotation = (0, react_1.useCallback)((rotation) => (0, timeline_rotation_utils_1.serializeCssRotationFromEuler)({
        rotation,
        decimalPlaces: Math.max(6, decimalPlaces),
    }), [decimalPlaces]);
    const onValueChangeCancel = (0, react_1.useCallback)(() => {
        markEdit();
        setDragValue(null);
        setDragRotation(null);
        onDragEnd('cancel');
    }, [markEdit, onDragEnd]);
    const onValueChange = (0, react_1.useCallback)((newVal) => {
        markEdit();
        setDragValue(newVal);
        onDragValueChange(serializeValue(newVal));
    }, [onDragValueChange, serializeValue, markEdit]);
    const onValueChangeEnd = (0, react_1.useCallback)((newVal) => {
        markEdit();
        const newValue = serializeValue(newVal);
        if (newValue !== propStatus.codeValue) {
            finishEdit(onSave(newValue), () => {
                setDragValue(null);
                onDragEnd('commit');
            });
        }
        else {
            setDragValue(null);
            onDragEnd('cancel');
        }
    }, [propStatus, onSave, onDragEnd, serializeValue, markEdit, finishEdit]);
    const onTextChange = (0, react_1.useCallback)((newVal) => {
        const parsed = Number(newVal);
        if (!Number.isNaN(parsed)) {
            const newValue = serializeValue(parsed);
            if (newValue !== propStatus.codeValue) {
                markEdit();
                setDragValue(parsed);
                finishEdit(onSave(newValue), () => {
                    setDragValue(null);
                });
            }
        }
    }, [propStatus, onSave, serializeValue, markEdit, finishEdit]);
    const formatter = (0, react_1.useCallback)((v) => {
        return (0, timeline_rotation_field_utils_1.formatTimelineRotationFieldValue)({
            decimalPlaces,
            fieldSchema: field.fieldSchema,
            value: v,
        });
    }, [decimalPlaces, field.fieldSchema]);
    const onRotationValueChange = (0, react_1.useCallback)((rotationIndex, newValue) => {
        markEdit();
        const nextRotation = [...(dragRotation !== null && dragRotation !== void 0 ? dragRotation : cssRotation)];
        nextRotation[rotationIndex] = newValue;
        setDragRotation(nextRotation);
        onDragValueChange(serializeRotation(nextRotation));
    }, [cssRotation, dragRotation, onDragValueChange, serializeRotation, markEdit]);
    const onRotationValueChangeEnd = (0, react_1.useCallback)((rotationIndex, newValue) => {
        markEdit();
        const nextRotation = [...(dragRotation !== null && dragRotation !== void 0 ? dragRotation : cssRotation)];
        nextRotation[rotationIndex] = newValue;
        const newRotation = serializeRotation(nextRotation);
        const clearDragState = (reason) => {
            setDragRotation(null);
            onDragEnd(reason);
        };
        if (newRotation !== propStatus.codeValue) {
            finishEdit(onSave(newRotation), () => clearDragState('commit'));
        }
        else {
            clearDragState('cancel');
        }
    }, [
        cssRotation,
        dragRotation,
        onDragEnd,
        onSave,
        propStatus.codeValue,
        serializeRotation,
        markEdit,
        finishEdit,
    ]);
    const onRotationTextChange = (0, react_1.useCallback)((rotationIndex, newValue) => {
        const parsed = Number(newValue);
        if (Number.isNaN(parsed)) {
            return;
        }
        const nextRotation = [...(dragRotation !== null && dragRotation !== void 0 ? dragRotation : cssRotation)];
        nextRotation[rotationIndex] = parsed;
        const newRotation = serializeRotation(nextRotation);
        if (newRotation !== propStatus.codeValue) {
            markEdit();
            setDragRotation(nextRotation);
            finishEdit(onSave(newRotation), () => setDragRotation(null));
        }
    }, [
        cssRotation,
        dragRotation,
        onSave,
        propStatus.codeValue,
        serializeRotation,
        markEdit,
        finishEdit,
    ]);
    const angleDragger = ((0, jsx_runtime_1.jsx)(InputDragger_1.InputDragger, { onValueChangeCancel: onValueChangeCancel, type: "number", value: dragValue !== null && dragValue !== void 0 ? dragValue : degrees, buttonStyle: timeline_field_utils_1.leftAlignedDraggerStyle, style: timeline_field_utils_1.draggerStyle, status: "ok", small: true, onValueChange: onValueChange, onValueChangeEnd: onValueChangeEnd, onTextChange: onTextChange, min: min, max: max, step: step, formatter: formatter, rightAlign: false, allowStepMismatch: true, "aria-label": isCssRotation ? 'Rotation Z' : 'Rotation angle' }));
    if (show3D) {
        return ((0, jsx_runtime_1.jsx)("span", { style: containerStyle, children: ROTATION_LABELS.map((rotationLabel, rotationIndex) => ((0, jsx_runtime_1.jsx)(InputDragger_1.InputDragger, { onValueChangeCancel: onValueChangeCancel, type: "number", value: (dragRotation !== null && dragRotation !== void 0 ? dragRotation : cssRotation)[rotationIndex], buttonStyle: compactDraggerStyle, status: "ok", small: true, onValueChange: (newValue) => onRotationValueChange(rotationIndex, newValue), onValueChangeEnd: (newValue) => onRotationValueChangeEnd(rotationIndex, newValue), onTextChange: (newValue) => onRotationTextChange(rotationIndex, newValue), min: -Infinity, max: Infinity, step: step, formatter: formatter, rightAlign: false, allowStepMismatch: true, "aria-label": `Rotation ${rotationLabel}` }, rotationLabel))) }));
    }
    return angleDragger;
};
exports.TimelineRotationField = TimelineRotationField;
