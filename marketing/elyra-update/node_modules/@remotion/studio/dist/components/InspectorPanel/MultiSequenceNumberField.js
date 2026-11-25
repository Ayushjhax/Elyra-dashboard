"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.MultiSequenceNumberField = void 0;
const jsx_runtime_1 = require("react/jsx-runtime");
const react_1 = require("react");
const noop_1 = require("../../helpers/noop");
const InputDragger_1 = require("../NewComposition/InputDragger");
const timeline_field_display_utils_1 = require("../Timeline/timeline-field-display-utils");
const timeline_field_utils_1 = require("../Timeline/timeline-field-utils");
const timeline_translate_utils_1 = require("../Timeline/timeline-translate-utils");
const use_timeline_field_edit_1 = require("../Timeline/use-timeline-field-edit");
const NumericAxis = ({ field, values, forceMixed, inherited, axis, onPreview, onSave, onClear, }) => {
    var _a, _b, _c, _d;
    const [dragValue, setDragValue] = (0, react_1.useState)(null);
    const { markEdit, finishEdit } = (0, use_timeline_field_edit_1.useTimelineFieldEdit)();
    const initialValues = (0, react_1.useRef)(null);
    const coordinates = values.map((value) => { var _a; return axis === null ? Number(value) : ((_a = (0, timeline_translate_utils_1.parseTranslate)(String(value))[axis]) !== null && _a !== void 0 ? _a : 0); });
    const mixed = forceMixed || coordinates.some((value) => value !== coordinates[0]);
    const schema = field.fieldSchema;
    const step = 'step' in schema ? ((_a = schema.step) !== null && _a !== void 0 ? _a : 1) : 1;
    const decimalPlaces = (0, timeline_field_utils_1.getTimelineDisplayDecimalPlaces)({
        defaultDecimalPlaces: 1,
        step,
    });
    const min = schema.type === 'number' ? ((_b = schema.min) !== null && _b !== void 0 ? _b : -Infinity) : -Infinity;
    const max = schema.type === 'number' ? ((_c = schema.max) !== null && _c !== void 0 ? _c : Infinity) : Infinity;
    const nextValues = (value, source) => {
        var _a, _b;
        const baseline = (_a = initialValues.current) !== null && _a !== void 0 ? _a : values;
        const first = axis === null
            ? Number(baseline[0])
            : ((_b = (0, timeline_translate_utils_1.parseTranslate)(String(baseline[0]))[axis]) !== null && _b !== void 0 ? _b : 0);
        return baseline.map((original) => {
            var _a;
            const coordinatesForValue = axis === null ? null : (0, timeline_translate_utils_1.parseTranslate)(String(original));
            const current = coordinatesForValue === null || axis === null
                ? Number(original)
                : ((_a = coordinatesForValue[axis]) !== null && _a !== void 0 ? _a : 0);
            const next = Math.min(max, Math.max(min, source === 'drag'
                ? (0, timeline_field_utils_1.roundToDecimalPlaces)(current + value - first, Math.max((0, timeline_field_utils_1.getDecimalPlaces)(current), (0, timeline_field_utils_1.getDecimalPlaces)(value), (0, timeline_field_utils_1.getDecimalPlaces)(first)))
                : value));
            if (coordinatesForValue === null || axis === null) {
                return next;
            }
            const [x, y, z] = coordinatesForValue;
            return (0, timeline_translate_utils_1.serializeTranslate)([axis === 0 ? next : x, axis === 1 ? next : y, axis === 2 ? next : z], decimalPlaces);
        });
    };
    const clear = () => {
        markEdit();
        initialValues.current = null;
        setDragValue(null);
        onClear('cancel');
    };
    return ((0, jsx_runtime_1.jsx)("span", { onKeyDownCapture: (event) => {
            if (event.key === 'Escape') {
                clear();
            }
        }, onPointerCancelCapture: clear, onBlurCapture: (event) => {
            if (event.target instanceof HTMLInputElement &&
                event.target.value.trim() === '') {
                clear();
            }
        }, children: (0, jsx_runtime_1.jsx)(InputDragger_1.InputDragger, { onValueChangeCancel: clear, type: "number", "aria-description": "Type to set all values; drag to adjust each value", value: dragValue !== null && dragValue !== void 0 ? dragValue : coordinates[0], "aria-label": axis === null
                ? ((_d = field.description) !== null && _d !== void 0 ? _d : field.key)
                : `Offset ${['X', 'Y', 'Z'][axis]}`, status: "ok", small: true, rightAlign: false, min: min, max: max, step: step, allowStepMismatch: true, integerOnly: schema.type === 'number' && schema.integer === true, snapToStep: axis === null, dragDecimalPlaces: decimalPlaces, dragSensitivity: axis === null ? 1 : 3, buttonStyle: { paddingLeft: 0 }, style: { width: 70 }, formatter: (value) => {
                if (mixed && dragValue === null) {
                    return 'Mixed';
                }
                const formatted = (0, timeline_field_display_utils_1.formatTimelineFieldValueForDisplay)({
                    fieldSchema: schema,
                    value,
                });
                return inherited && dragValue === null
                    ? `Default (${formatted})`
                    : formatted;
            }, onTextChange: noop_1.noop, onValueChange: (value, source) => {
                var _a;
                markEdit();
                (_a = initialValues.current) !== null && _a !== void 0 ? _a : (initialValues.current = values);
                setDragValue(value);
                onPreview(nextValues(value, source));
            }, onValueChangeEnd: (value, source) => {
                if (initialValues.current === null) {
                    return;
                }
                const next = nextValues(value, source);
                initialValues.current = null;
                finishEdit(onSave(next), () => {
                    setDragValue(null);
                    onClear('commit');
                });
            } }) }));
};
const MultiSequenceNumberField = (props) => {
    const axes = props.field.typeName === 'translate'
        ? props.values.some((value) => (0, timeline_translate_utils_1.parseTranslate)(String(value))[2] !== null)
            ? [0, 1, 2]
            : [0, 1]
        : [null];
    return ((0, jsx_runtime_1.jsx)("span", { style: { display: 'flex', gap: 4 }, children: axes.map((axis) => ((0, jsx_runtime_1.jsx)(NumericAxis, { ...props, axis: axis }, axis !== null && axis !== void 0 ? axis : 'value'))) }));
};
exports.MultiSequenceNumberField = MultiSequenceNumberField;
