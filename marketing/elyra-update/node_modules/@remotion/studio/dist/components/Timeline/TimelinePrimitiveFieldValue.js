"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.TimelinePrimitiveFieldValue = exports.isTimelinePrimitiveFieldInfo = void 0;
const jsx_runtime_1 = require("react/jsx-runtime");
const TimelineAssetField_1 = require("./TimelineAssetField");
const TimelineBooleanField_1 = require("./TimelineBooleanField");
const TimelineColorField_1 = require("./TimelineColorField");
const TimelineEnumField_1 = require("./TimelineEnumField");
const TimelineFontFamilyField_1 = require("./TimelineFontFamilyField");
const TimelineFontWeightField_1 = require("./TimelineFontWeightField");
const TimelineNumberField_1 = require("./TimelineNumberField");
const TimelineRotationField_1 = require("./TimelineRotationField");
const TimelineScaleField_1 = require("./TimelineScaleField");
const TimelineTextContentField_1 = require("./TimelineTextContentField");
const TimelineTransformOriginField_1 = require("./TimelineTransformOriginField");
const TimelineTranslateField_1 = require("./TimelineTranslateField");
const TimelineUvCoordinateField_1 = require("./TimelineUvCoordinateField");
const inlineWrapper = {
    fontSize: 12,
};
const assetInlineWrapper = {
    ...inlineWrapper,
    display: 'flex',
    flex: 1,
    minWidth: 0,
};
const isTimelinePrimitiveFieldInfo = (field) => {
    return (field.typeName !== 'array' &&
        field.fieldSchema.type !== 'array' &&
        field.fieldSchema.type !== 'remotion-captions');
};
exports.isTimelinePrimitiveFieldInfo = isTimelinePrimitiveFieldInfo;
const TimelinePrimitiveFieldValue = ({ field, onSave, onDragValueChange, onDragEnd, propStatus, effectiveValue, scaleLockNodePath, }) => {
    if (field.typeName === 'number') {
        return ((0, jsx_runtime_1.jsx)(TimelineNumberField_1.TimelineNumberField, { effectiveValue: effectiveValue, field: field, onDragEnd: onDragEnd, onDragValueChange: onDragValueChange, onSave: onSave, propStatus: propStatus }));
    }
    if (field.typeName === 'rotation-css' ||
        field.typeName === 'rotation-degrees') {
        return ((0, jsx_runtime_1.jsx)("span", { children: (0, jsx_runtime_1.jsx)(TimelineRotationField_1.TimelineRotationField, { effectiveValue: effectiveValue, field: field, onDragEnd: onDragEnd, onDragValueChange: onDragValueChange, onSave: onSave, propStatus: propStatus }) }));
    }
    if (field.typeName === 'translate') {
        return ((0, jsx_runtime_1.jsx)("span", { children: (0, jsx_runtime_1.jsx)(TimelineTranslateField_1.TimelineTranslateField, { effectiveValue: effectiveValue, field: field, onDragEnd: onDragEnd, onDragValueChange: onDragValueChange, onSave: onSave, propStatus: propStatus }) }));
    }
    if (field.typeName === 'transform-origin') {
        return ((0, jsx_runtime_1.jsx)("span", { children: (0, jsx_runtime_1.jsx)(TimelineTransformOriginField_1.TimelineTransformOriginField, { effectiveValue: effectiveValue, field: field, onDragEnd: onDragEnd, onDragValueChange: onDragValueChange, onSave: onSave, propStatus: propStatus }) }));
    }
    if (field.typeName === 'scale') {
        if (scaleLockNodePath === null) {
            throw new Error('Expected scale lock node path for scale field');
        }
        return ((0, jsx_runtime_1.jsx)("span", { children: (0, jsx_runtime_1.jsx)(TimelineScaleField_1.TimelineScaleField, { effectiveValue: effectiveValue, field: field, onDragEnd: onDragEnd, onDragValueChange: onDragValueChange, onSave: onSave, propStatus: propStatus, scaleLockNodePath: scaleLockNodePath }) }));
    }
    if (field.typeName === 'uv-coordinate') {
        return ((0, jsx_runtime_1.jsx)("span", { children: (0, jsx_runtime_1.jsx)(TimelineUvCoordinateField_1.TimelineUvCoordinateField, { effectiveValue: effectiveValue, field: field, onDragEnd: onDragEnd, onDragValueChange: onDragValueChange, onSave: onSave, propStatus: propStatus }) }));
    }
    if (field.typeName === 'boolean') {
        return ((0, jsx_runtime_1.jsx)("span", { children: (0, jsx_runtime_1.jsx)(TimelineBooleanField_1.TimelineBooleanField, { effectiveValue: effectiveValue, field: field, onSave: onSave, propStatus: propStatus }) }));
    }
    if (field.typeName === 'color') {
        return ((0, jsx_runtime_1.jsx)("span", { children: (0, jsx_runtime_1.jsx)(TimelineColorField_1.TimelineColorField, { effectiveValue: effectiveValue, field: field, onDragEnd: onDragEnd, onDragValueChange: onDragValueChange, onSave: onSave, propStatus: propStatus }) }));
    }
    if (field.typeName === 'enum') {
        return ((0, jsx_runtime_1.jsx)("span", { style: inlineWrapper, children: (0, jsx_runtime_1.jsx)(TimelineEnumField_1.TimelineEnumField, { effectiveValue: effectiveValue, field: field, onDragEnd: onDragEnd, onDragValueChange: onDragValueChange, onSave: onSave, propStatus: propStatus }) }));
    }
    if (field.typeName === 'string' ||
        field.typeName === 'text-content' ||
        field.typeName === 'svg-path') {
        return ((0, jsx_runtime_1.jsx)(TimelineTextContentField_1.TimelineTextContentField, { effectiveValue: effectiveValue, field: field, nodePath: scaleLockNodePath, onDragEnd: onDragEnd, onDragValueChange: onDragValueChange, onSave: onSave, propStatus: propStatus }));
    }
    if (field.typeName === 'font-family') {
        return ((0, jsx_runtime_1.jsx)("span", { style: inlineWrapper, children: (0, jsx_runtime_1.jsx)(TimelineFontFamilyField_1.TimelineFontFamilyField, { effectiveValue: effectiveValue, field: field, onDragEnd: onDragEnd, onDragValueChange: onDragValueChange, onSave: onSave, propStatus: propStatus }) }));
    }
    if (field.typeName === 'font-weight') {
        return ((0, jsx_runtime_1.jsx)("span", { style: inlineWrapper, children: (0, jsx_runtime_1.jsx)(TimelineFontWeightField_1.TimelineFontWeightField, { effectiveValue: effectiveValue, field: field, onDragEnd: onDragEnd, onDragValueChange: onDragValueChange, onSave: onSave, propStatus: propStatus }) }));
    }
    if (field.typeName === 'asset') {
        return ((0, jsx_runtime_1.jsx)("span", { style: assetInlineWrapper, children: (0, jsx_runtime_1.jsx)(TimelineAssetField_1.TimelineAssetField, { effectiveValue: effectiveValue, field: field, onDragEnd: onDragEnd, onDragValueChange: onDragValueChange, onSave: onSave, propStatus: propStatus }) }));
    }
    throw new Error(`Unsupported field type: ${field.typeName}`);
};
exports.TimelinePrimitiveFieldValue = TimelinePrimitiveFieldValue;
