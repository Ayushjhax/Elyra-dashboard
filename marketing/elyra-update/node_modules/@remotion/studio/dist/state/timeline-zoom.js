"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.TimelineZoomContext = exports.TimelineZoomImperativeContext = exports.TimelineZoomActiveContext = exports.TimelineZoomCtx = void 0;
const jsx_runtime_1 = require("react/jsx-runtime");
const react_1 = require("react");
const react_dom_1 = require("react-dom");
const imperative_state_1 = require("../components/Timeline/imperative-state");
const timeline_refs_1 = require("../components/Timeline/timeline-refs");
const timeline_scroll_logic_1 = require("../components/Timeline/timeline-scroll-logic");
const TimelineViewport_1 = require("../components/Timeline/TimelineViewport");
const ZoomPersistor_1 = require("../components/ZoomPersistor");
const get_timeline_max_zoom_1 = require("../helpers/get-timeline-max-zoom");
exports.TimelineZoomCtx = (0, react_1.createContext)({
    zoom: {},
    setZoom: () => {
        throw new Error('has no context');
    },
});
exports.TimelineZoomActiveContext = (0, react_1.createContext)(false);
exports.TimelineZoomImperativeContext = (0, react_1.createContext)({
    getZoom: () => null,
    beginZoom: () => undefined,
    endZoom: () => undefined,
    setZoom: () => {
        throw new Error('has no context');
    },
});
const TimelineZoomContext = ({ children }) => {
    const [isZooming, setIsZooming] = (0, react_1.useState)(false);
    const zoomHeld = (0, react_1.useRef)(false);
    const zoomIdleTimeout = (0, react_1.useRef)(null);
    const endZoom = (0, react_1.useCallback)(() => {
        zoomHeld.current = false;
        if (zoomIdleTimeout.current !== null) {
            clearTimeout(zoomIdleTimeout.current);
            zoomIdleTimeout.current = null;
        }
        setIsZooming(false);
    }, []);
    const beginZoom = (0, react_1.useCallback)(() => {
        zoomHeld.current = true;
        if (zoomIdleTimeout.current !== null) {
            clearTimeout(zoomIdleTimeout.current);
            zoomIdleTimeout.current = null;
        }
        setIsZooming(true);
    }, []);
    (0, react_1.useEffect)(() => {
        window.addEventListener('blur', endZoom);
        return () => {
            window.removeEventListener('blur', endZoom);
            if (zoomIdleTimeout.current !== null) {
                clearTimeout(zoomIdleTimeout.current);
            }
        };
    }, [endZoom]);
    const [zoom, setZoomState] = (0, react_1.useState)(() => (0, ZoomPersistor_1.getZoomFromLocalStorage)());
    const zoomRef = (0, react_1.useRef)(zoom);
    (0, react_1.useLayoutEffect)(() => {
        zoomRef.current = zoom;
    }, [zoom]);
    const setZoom = (0, react_1.useCallback)((videoId, callback, options) => {
        var _a, _b;
        // Capture the old geometry before committing the new timeline width.
        const preserveTimelineCursor = (0, timeline_scroll_logic_1.prepareToPreserveTimelineCursor)({
            currentDurationInFrames: (0, imperative_state_1.getCurrentDuration)(),
            currentFrame: (0, imperative_state_1.getCurrentFrame)(),
            anchorFrame: (_a = options === null || options === void 0 ? void 0 : options.anchorFrame) !== null && _a !== void 0 ? _a : null,
            anchorContentX: (_b = options === null || options === void 0 ? void 0 : options.anchorContentX) !== null && _b !== void 0 ? _b : null,
        });
        (0, react_dom_1.flushSync)(() => {
            setIsZooming(true);
            setZoomState((prevZoomMap) => {
                var _a;
                var _b, _c;
                const durationInFrames = (0, imperative_state_1.getCurrentDuration)();
                const timelineViewportWidth = (_b = (_a = timeline_refs_1.scrollableRef.current) === null || _a === void 0 ? void 0 : _a.clientWidth) !== null && _b !== void 0 ? _b : 0;
                const previousZoom = (0, get_timeline_max_zoom_1.getTimelineZoom)({
                    durationInFrames,
                    timelineViewportWidth,
                    zoom: (_c = prevZoomMap[videoId]) !== null && _c !== void 0 ? _c : null,
                });
                const newZoom = (0, get_timeline_max_zoom_1.clampTimelineZoom)({
                    zoom: callback(previousZoom),
                    durationInFrames,
                    timelineViewportWidth,
                });
                return { ...prevZoomMap, [videoId]: newZoom };
            });
        });
        // The new scroll range exists now, so the browser will not clamp the offset
        // against the previous width.
        preserveTimelineCursor();
        // A large zoom can move beyond the old horizontal render window. Commit
        // the new window before the browser paints the new scroll position.
        (0, react_dom_1.flushSync)(TimelineViewport_1.syncTimelineViewport);
        // Wheel events and zoom buttons have no explicit interaction end.
        // Slider drags and native pinch gestures keep the interaction held.
        if (zoomIdleTimeout.current !== null) {
            clearTimeout(zoomIdleTimeout.current);
        }
        if (!zoomHeld.current) {
            zoomIdleTimeout.current = setTimeout(endZoom, 150);
        }
    }, [endZoom]);
    const value = (0, react_1.useMemo)(() => {
        return {
            zoom,
            setZoom,
        };
    }, [zoom, setZoom]);
    const imperativeValue = (0, react_1.useMemo)(() => {
        return {
            getZoom: (videoId) => { var _a; return (_a = zoomRef.current[videoId]) !== null && _a !== void 0 ? _a : null; },
            setZoom,
            beginZoom,
            endZoom,
        };
    }, [beginZoom, endZoom, setZoom]);
    return ((0, jsx_runtime_1.jsx)(exports.TimelineZoomCtx.Provider, { value: value, children: (0, jsx_runtime_1.jsx)(exports.TimelineZoomImperativeContext.Provider, { value: imperativeValue, children: (0, jsx_runtime_1.jsx)(exports.TimelineZoomActiveContext.Provider, { value: isZooming, children: children }) }) }));
};
exports.TimelineZoomContext = TimelineZoomContext;
