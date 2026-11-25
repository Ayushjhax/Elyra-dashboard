"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.getKeyframeInterpolationFunction = exports.getKeyframeOutputTypeForSchemaField = exports.getKeyframeInterpolationFunctionForSchemaField = exports.isSchemaFieldHoldOnly = exports.isInteractivitySchemaFieldHoldOnly = exports.isSchemaFieldKeyframable = exports.isInteractivitySchemaFieldKeyframable = exports.canEditEasingForInterpolationFunction = exports.isKeyframeInterpolationFunction = exports.keyframeInterpolationFunctions = void 0;
exports.keyframeInterpolationFunctions = [
    'interpolate',
    'interpolateColors',
    'interpolatePaths',
];
// Keep these tables exhaustive so every schema field requires explicit
// keyframe and interpolation decisions.
const KEYFRAME_FIELD_TYPE_SUPPORT = {
    array: false,
    asset: false,
    boolean: true,
    'remotion-captions': false,
    color: true,
    enum: true,
    'font-family': false,
    'font-weight': true,
    hidden: true,
    number: true,
    'rotation-css': true,
    'rotation-degrees': true,
    scale: true,
    'svg-path': true,
    string: false,
    'text-content': false,
    'transform-origin': true,
    translate: true,
    'uv-coordinate': true,
};
const KEYFRAME_FIELD_TYPE_INTERPOLATION = {
    array: 'unsupported',
    asset: 'unsupported',
    boolean: 'interpolate',
    'remotion-captions': 'unsupported',
    color: 'interpolateColors',
    enum: 'interpolate',
    'font-family': 'unsupported',
    'font-weight': 'interpolate',
    hidden: 'infer',
    number: 'infer',
    'rotation-css': 'interpolate',
    'rotation-degrees': 'infer',
    scale: 'interpolate',
    'svg-path': 'interpolatePaths',
    string: 'unsupported',
    'text-content': 'unsupported',
    'transform-origin': 'interpolate',
    translate: 'interpolate',
    'uv-coordinate': 'infer',
};
const KEYFRAME_FIELD_TYPE_OUTPUT_TYPE = {
    array: null,
    asset: null,
    boolean: null,
    'remotion-captions': null,
    color: null,
    enum: null,
    'font-family': null,
    'font-weight': 'font-weight',
    hidden: null,
    number: null,
    'rotation-css': 'rotate',
    'rotation-degrees': null,
    scale: 'scale',
    'svg-path': null,
    string: null,
    'text-content': null,
    'transform-origin': 'transform-origin',
    translate: 'translate',
    'uv-coordinate': null,
};
const KEYFRAME_INTERPOLATION_EASING_SUPPORT = {
    interpolate: true,
    interpolateColors: true,
    interpolatePaths: true,
};
const isKeyframeInterpolationFunction = (name) => {
    return exports.keyframeInterpolationFunctions.includes(name);
};
exports.isKeyframeInterpolationFunction = isKeyframeInterpolationFunction;
const canEditEasingForInterpolationFunction = (interpolationFunction) => (0, exports.isKeyframeInterpolationFunction)(interpolationFunction) &&
    KEYFRAME_INTERPOLATION_EASING_SUPPORT[interpolationFunction];
exports.canEditEasingForInterpolationFunction = canEditEasingForInterpolationFunction;
const isInteractivitySchemaFieldKeyframable = (field) => {
    if (!field) {
        return true;
    }
    if (field.type === 'enum') {
        return field.keyframable === true;
    }
    return KEYFRAME_FIELD_TYPE_SUPPORT[field.type] && field.keyframable !== false;
};
exports.isInteractivitySchemaFieldKeyframable = isInteractivitySchemaFieldKeyframable;
const findFieldInSchema = (schema, key) => {
    if (key in schema) {
        return schema[key];
    }
    for (const field of Object.values(schema)) {
        if (field.type !== 'enum') {
            continue;
        }
        for (const variant of Object.values(field.variants)) {
            const found = findFieldInSchema(variant, key);
            if (found) {
                return found;
            }
        }
    }
    return undefined;
};
const isSchemaFieldKeyframable = ({ schema, key, }) => {
    const field = schema ? findFieldInSchema(schema, key) : undefined;
    return (0, exports.isInteractivitySchemaFieldKeyframable)(field);
};
exports.isSchemaFieldKeyframable = isSchemaFieldKeyframable;
const isInteractivitySchemaFieldHoldOnly = (field) => {
    return (((field === null || field === void 0 ? void 0 : field.type) === 'boolean' && field.keyframable !== false) ||
        ((field === null || field === void 0 ? void 0 : field.type) === 'enum' && field.keyframable === true) ||
        ((field === null || field === void 0 ? void 0 : field.type) === 'number' &&
            field.integer === true &&
            field.keyframable !== false));
};
exports.isInteractivitySchemaFieldHoldOnly = isInteractivitySchemaFieldHoldOnly;
const isSchemaFieldHoldOnly = ({ schema, key, }) => {
    return (0, exports.isInteractivitySchemaFieldHoldOnly)(schema ? findFieldInSchema(schema, key) : undefined);
};
exports.isSchemaFieldHoldOnly = isSchemaFieldHoldOnly;
const getKeyframeInterpolationFunctionForSchemaField = ({ schema, key, }) => {
    const field = schema ? findFieldInSchema(schema, key) : undefined;
    if (!field) {
        return null;
    }
    const strategy = KEYFRAME_FIELD_TYPE_INTERPOLATION[field.type];
    return strategy === 'infer' || strategy === 'unsupported' ? null : strategy;
};
exports.getKeyframeInterpolationFunctionForSchemaField = getKeyframeInterpolationFunctionForSchemaField;
const getKeyframeOutputTypeForSchemaField = ({ schema, key, }) => {
    const field = schema ? findFieldInSchema(schema, key) : undefined;
    return field ? KEYFRAME_FIELD_TYPE_OUTPUT_TYPE[field.type] : null;
};
exports.getKeyframeOutputTypeForSchemaField = getKeyframeOutputTypeForSchemaField;
const getKeyframeInterpolationFunction = ({ schema, key, staticValue, newValue, }) => {
    const schemaFunction = (0, exports.getKeyframeInterpolationFunctionForSchemaField)({
        schema,
        key,
    });
    if (schemaFunction) {
        return schemaFunction;
    }
    return typeof staticValue === 'string' && typeof newValue === 'string'
        ? 'interpolateColors'
        : 'interpolate';
};
exports.getKeyframeInterpolationFunction = getKeyframeInterpolationFunction;
