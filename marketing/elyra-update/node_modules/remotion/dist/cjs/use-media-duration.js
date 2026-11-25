"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.scheduleMediaSourceCleanup = exports.useMediaDuration = void 0;
const react_1 = require("react");
const subscribeToMediaDuration = (mediaRef, onDurationRef, src) => {
    var _a;
    const { current } = mediaRef;
    if (!current) {
        return;
    }
    if (current.duration) {
        (_a = onDurationRef.current) === null || _a === void 0 ? void 0 : _a.call(onDurationRef, src !== null && src !== void 0 ? src : current.src, current.duration);
        return;
    }
    const onLoadedMetadata = () => {
        var _a;
        (_a = onDurationRef.current) === null || _a === void 0 ? void 0 : _a.call(onDurationRef, src !== null && src !== void 0 ? src : current.src, current.duration);
    };
    current.addEventListener('loadedmetadata', onLoadedMetadata);
    return () => {
        current.removeEventListener('loadedmetadata', onLoadedMetadata);
    };
};
const useMediaDuration = (mediaRef, onDuration, src, useCurrentSrc) => {
    const onDurationRef = (0, react_1.useRef)(onDuration);
    onDurationRef.current = onDuration;
    // The listener and its cleanup must not share the component render scope.
    // Binding prevents production minifiers from inlining that scope back in.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    (0, react_1.useEffect)(subscribeToMediaDuration.bind(null, mediaRef, onDurationRef, useCurrentSrc ? null : src), [mediaRef, src, useCurrentSrc]);
};
exports.useMediaDuration = useMediaDuration;
const scheduleMediaSourceCleanup = (cleanup) => {
    requestAnimationFrame(() => cleanup === null || cleanup === void 0 ? void 0 : cleanup());
};
exports.scheduleMediaSourceCleanup = scheduleMediaSourceCleanup;
