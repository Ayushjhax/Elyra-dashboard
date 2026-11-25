"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.validatePreferredEffectBackend = void 0;
const validatePreferredEffectBackend = (value) => {
    if (value !== 'auto' &&
        value !== 'webgpu' &&
        value !== 'webgl2' &&
        value !== '2d') {
        throw new TypeError(`preferredEffectBackend must be "auto", "webgpu", "webgl2" or "2d", got ${String(value)}`);
    }
    return value;
};
exports.validatePreferredEffectBackend = validatePreferredEffectBackend;
