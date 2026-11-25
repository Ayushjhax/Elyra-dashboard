"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.requestCodexAnnotation = exports.getVisibleAnnotationTarget = void 0;
const NotificationCenter_1 = require("../components/Notifications/NotificationCenter");
const get_codex_annotation_1 = require("./get-codex-annotation");
const getVisibleAnnotationTarget = (targets) => {
    var _a;
    return ((_a = targets.find((element) => {
        if (!(element === null || element === void 0 ? void 0 : element.isConnected)) {
            return false;
        }
        const rect = element.getBoundingClientRect();
        const style = window.getComputedStyle(element);
        return (style.visibility !== 'hidden' &&
            style.display !== 'none' &&
            rect.width > 0 &&
            rect.height > 0 &&
            rect.bottom > 0 &&
            rect.right > 0 &&
            rect.top < window.innerHeight &&
            rect.left < window.innerWidth);
    })) !== null && _a !== void 0 ? _a : null);
};
exports.getVisibleAnnotationTarget = getVisibleAnnotationTarget;
const requestCodexAnnotation = ({ target, initialComment, metadata, }) => {
    const annotation = (0, get_codex_annotation_1.getCodexAnnotation)();
    if (annotation === null) {
        (0, NotificationCenter_1.showNotification)('The annotation editor is unavailable', 3000);
        return false;
    }
    if (target === null || (0, exports.getVisibleAnnotationTarget)([target]) === null) {
        (0, NotificationCenter_1.showNotification)('The annotation target is no longer visible', 3000);
        return false;
    }
    // Omit oversized facts instead of truncating source paths or identifiers.
    const boundedMetadata = {};
    for (const [key, value] of Object.entries(metadata !== null && metadata !== void 0 ? metadata : {})) {
        if (Object.keys(boundedMetadata).length >= 6 ||
            key.length > 64 ||
            !/^[A-Za-z][A-Za-z0-9 _-]*$/.test(key) ||
            key.includes('  ') ||
            (typeof value === 'string' ? value.length > 256 : !Number.isFinite(value))) {
            continue;
        }
        const next = { ...boundedMetadata, [key]: value };
        if (new TextEncoder().encode(JSON.stringify(next)).length <= 2048) {
            boundedMetadata[key] = value;
        }
    }
    try {
        const result = annotation.request(target, {
            ...(initialComment === null ? {} : { initialComment }),
            ...(Object.keys(boundedMetadata).length === 0
                ? {}
                : { metadata: boundedMetadata }),
        });
        if (result === null || result === void 0 ? void 0 : result.accepted) {
            return true;
        }
        (0, NotificationCenter_1.showNotification)('Could not open the annotation editor', 3000);
    }
    catch (err) {
        (0, NotificationCenter_1.showNotification)(`Could not open the annotation editor: ${err.message}`, 3000);
    }
    return false;
};
exports.requestCodexAnnotation = requestCodexAnnotation;
