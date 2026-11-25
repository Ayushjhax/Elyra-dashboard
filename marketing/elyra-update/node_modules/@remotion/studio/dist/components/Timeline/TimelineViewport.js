"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.TimelineViewportProvider = exports.getTimelineRenderWindow = exports.syncTimelineViewport = exports.TimelineViewportContext = void 0;
const jsx_runtime_1 = require("react/jsx-runtime");
const react_1 = require("react");
exports.TimelineViewportContext = (0, react_1.createContext)(null);
let updateTimelineViewport = null;
const syncTimelineViewport = () => {
    updateTimelineViewport === null || updateTimelineViewport === void 0 ? void 0 : updateTimelineViewport();
};
exports.syncTimelineViewport = syncTimelineViewport;
const getTimelineRenderWindow = (scrollable) => {
    const viewportWidth = scrollable.clientWidth;
    if (viewportWidth === 0) {
        return { left: 0, width: 0 };
    }
    // Move the render window half a viewport before the visible viewport reaches
    // its right edge. This keeps at least half a viewport rendered ahead while
    // retaining the three-viewport-wide window.
    const currentSection = Math.floor((scrollable.scrollLeft + viewportWidth / 2) / viewportWidth);
    const left = Math.max(0, (currentSection - 1) * viewportWidth);
    return {
        left,
        width: viewportWidth * 3,
    };
};
exports.getTimelineRenderWindow = getTimelineRenderWindow;
const TimelineViewportProvider = ({ children, scrollable }) => {
    const [renderWindow, setRenderWindow] = (0, react_1.useState)({
        left: 0,
        width: window.innerWidth * 3,
    });
    const update = (0, react_1.useCallback)(() => {
        const element = scrollable.current;
        if (!element) {
            return;
        }
        const next = (0, exports.getTimelineRenderWindow)(element);
        setRenderWindow((previous) => {
            if (previous.left === next.left && previous.width === next.width) {
                return previous;
            }
            return next;
        });
    }, [scrollable]);
    (0, react_1.useLayoutEffect)(() => {
        let element = null;
        let resizeObserver = null;
        updateTimelineViewport = update;
        const animationFrame = requestAnimationFrame(() => {
            element = scrollable.current;
            if (!element) {
                return;
            }
            resizeObserver = new ResizeObserver(update);
            resizeObserver.observe(element);
            update();
            element.addEventListener('scroll', update);
        });
        return () => {
            if (updateTimelineViewport === update) {
                updateTimelineViewport = null;
            }
            cancelAnimationFrame(animationFrame);
            resizeObserver === null || resizeObserver === void 0 ? void 0 : resizeObserver.disconnect();
            element === null || element === void 0 ? void 0 : element.removeEventListener('scroll', update);
        };
    }, [scrollable, update]);
    return ((0, jsx_runtime_1.jsx)(exports.TimelineViewportContext.Provider, { value: renderWindow, children: children }));
};
exports.TimelineViewportProvider = TimelineViewportProvider;
