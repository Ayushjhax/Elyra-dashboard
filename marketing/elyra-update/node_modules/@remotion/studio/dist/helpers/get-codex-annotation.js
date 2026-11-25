"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.getCodexAnnotation = void 0;
const getCodexAnnotation = () => {
    var _a;
    if (typeof document === 'undefined') {
        return null;
    }
    // The Codex browser injects this bridge. Check it when used, since the
    // browser can install or remove it after the page has loaded.
    const annotation = (_a = document.oai) === null || _a === void 0 ? void 0 : _a.annotation;
    return typeof (annotation === null || annotation === void 0 ? void 0 : annotation.request) === 'function' ? annotation : null;
};
exports.getCodexAnnotation = getCodexAnnotation;
