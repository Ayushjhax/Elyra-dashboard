// src/keyframe-interpolation-function.ts
var keyframeInterpolationFunctions = [
  "interpolate",
  "interpolateColors",
  "interpolatePaths"
];
var KEYFRAME_FIELD_TYPE_SUPPORT = {
  array: false,
  asset: false,
  boolean: true,
  "remotion-captions": false,
  color: true,
  enum: true,
  "font-family": false,
  "font-weight": true,
  hidden: true,
  number: true,
  "rotation-css": true,
  "rotation-degrees": true,
  scale: true,
  "svg-path": true,
  string: false,
  "text-content": false,
  "transform-origin": true,
  translate: true,
  "uv-coordinate": true
};
var KEYFRAME_FIELD_TYPE_INTERPOLATION = {
  array: "unsupported",
  asset: "unsupported",
  boolean: "interpolate",
  "remotion-captions": "unsupported",
  color: "interpolateColors",
  enum: "interpolate",
  "font-family": "unsupported",
  "font-weight": "interpolate",
  hidden: "infer",
  number: "infer",
  "rotation-css": "interpolate",
  "rotation-degrees": "infer",
  scale: "interpolate",
  "svg-path": "interpolatePaths",
  string: "unsupported",
  "text-content": "unsupported",
  "transform-origin": "interpolate",
  translate: "interpolate",
  "uv-coordinate": "infer"
};
var KEYFRAME_FIELD_TYPE_OUTPUT_TYPE = {
  array: null,
  asset: null,
  boolean: null,
  "remotion-captions": null,
  color: null,
  enum: null,
  "font-family": null,
  "font-weight": "font-weight",
  hidden: null,
  number: null,
  "rotation-css": "rotate",
  "rotation-degrees": null,
  scale: "scale",
  "svg-path": null,
  string: null,
  "text-content": null,
  "transform-origin": "transform-origin",
  translate: "translate",
  "uv-coordinate": null
};
var KEYFRAME_INTERPOLATION_EASING_SUPPORT = {
  interpolate: true,
  interpolateColors: true,
  interpolatePaths: true
};
var isKeyframeInterpolationFunction = (name) => {
  return keyframeInterpolationFunctions.includes(name);
};
var canEditEasingForInterpolationFunction = (interpolationFunction) => isKeyframeInterpolationFunction(interpolationFunction) && KEYFRAME_INTERPOLATION_EASING_SUPPORT[interpolationFunction];
var isInteractivitySchemaFieldKeyframable = (field) => {
  if (!field) {
    return true;
  }
  if (field.type === "enum") {
    return field.keyframable === true;
  }
  return KEYFRAME_FIELD_TYPE_SUPPORT[field.type] && field.keyframable !== false;
};
var findFieldInSchema = (schema, key) => {
  if (key in schema) {
    return schema[key];
  }
  for (const field of Object.values(schema)) {
    if (field.type !== "enum") {
      continue;
    }
    for (const variant of Object.values(field.variants)) {
      const found = findFieldInSchema(variant, key);
      if (found) {
        return found;
      }
    }
  }
  return;
};
var isSchemaFieldKeyframable = ({
  schema,
  key
}) => {
  const field = schema ? findFieldInSchema(schema, key) : undefined;
  return isInteractivitySchemaFieldKeyframable(field);
};
var isInteractivitySchemaFieldHoldOnly = (field) => {
  return field?.type === "boolean" && field.keyframable !== false || field?.type === "enum" && field.keyframable === true || field?.type === "number" && field.integer === true && field.keyframable !== false;
};
var isSchemaFieldHoldOnly = ({
  schema,
  key
}) => {
  return isInteractivitySchemaFieldHoldOnly(schema ? findFieldInSchema(schema, key) : undefined);
};
var getKeyframeInterpolationFunctionForSchemaField = ({
  schema,
  key
}) => {
  const field = schema ? findFieldInSchema(schema, key) : undefined;
  if (!field) {
    return null;
  }
  const strategy = KEYFRAME_FIELD_TYPE_INTERPOLATION[field.type];
  return strategy === "infer" || strategy === "unsupported" ? null : strategy;
};
var getKeyframeOutputTypeForSchemaField = ({
  schema,
  key
}) => {
  const field = schema ? findFieldInSchema(schema, key) : undefined;
  return field ? KEYFRAME_FIELD_TYPE_OUTPUT_TYPE[field.type] : null;
};
var getKeyframeInterpolationFunction = ({
  schema,
  key,
  staticValue,
  newValue
}) => {
  const schemaFunction = getKeyframeInterpolationFunctionForSchemaField({
    schema,
    key
  });
  if (schemaFunction) {
    return schemaFunction;
  }
  return typeof staticValue === "string" && typeof newValue === "string" ? "interpolateColors" : "interpolate";
};
export {
  canEditEasingForInterpolationFunction,
  getKeyframeInterpolationFunction,
  getKeyframeInterpolationFunctionForSchemaField,
  getKeyframeOutputTypeForSchemaField,
  isInteractivitySchemaFieldHoldOnly,
  isInteractivitySchemaFieldKeyframable,
  isKeyframeInterpolationFunction,
  isSchemaFieldHoldOnly,
  isSchemaFieldKeyframable,
  keyframeInterpolationFunctions
};
