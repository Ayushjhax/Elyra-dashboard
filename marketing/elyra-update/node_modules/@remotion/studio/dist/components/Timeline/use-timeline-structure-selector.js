"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.useTimelineStructureSelector = void 0;
const react_1 = require("react");
const use_runtime_values_1 = require("../../helpers/use-runtime-values");
// Timeline tree structure depends on enum choices and array lengths, while
// animated field values are read by their editors through the runtime store.
const useTimelineStructureSelector = ({ controls, selector, isEqual, }) => {
    const schema = controls === null || controls === void 0 ? void 0 : controls.schema;
    const store = controls === null || controls === void 0 ? void 0 : controls.runtimeValues;
    const selectStructure = (0, react_1.useMemo)(() => {
        const keys = new Map();
        const schemas = schema ? [schema] : [];
        for (const current of schemas) {
            for (const [key, field] of Object.entries(current)) {
                if (field.type === 'enum') {
                    keys.set(key, true);
                    schemas.push(...Object.values(field.variants));
                }
                else if (field.type === 'array' && !keys.has(key)) {
                    keys.set(key, false);
                }
            }
        }
        let previous = null;
        let result;
        return (values) => {
            const next = [];
            let cacheable = true;
            for (const [key, isEnum] of keys) {
                // Absent keys do not resolve source values or drag overrides.
                const present = Object.prototype.propertyIsEnumerable.call(values, key);
                next.push(present);
                if (!present)
                    continue;
                const value = values[key];
                if (isEnum) {
                    // Object-to-key coercion can change without a new reference.
                    if (value !== null &&
                        (typeof value === 'object' || typeof value === 'function')) {
                        cacheable = false;
                    }
                    next.push(value);
                }
                else {
                    // Capture length now, including arrays later mutated in place.
                    next.push(Array.isArray(value) ? value.length : null);
                }
            }
            const last = previous;
            if (cacheable &&
                last !== null &&
                last.length === next.length &&
                next.every((value, index) => Object.is(value, last[index]))) {
                return result;
            }
            result = selector(values);
            previous = cacheable ? next : null;
            return result;
        };
        // Tree nodes hold runtime-store references, so a new store must reset the cache.
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [schema, store, selector]);
    return (0, use_runtime_values_1.useRuntimeValueSelector)({
        controls,
        selector: selectStructure,
        isEqual: isEqual !== null && isEqual !== void 0 ? isEqual : Object.is,
    });
};
exports.useTimelineStructureSelector = useTimelineStructureSelector;
