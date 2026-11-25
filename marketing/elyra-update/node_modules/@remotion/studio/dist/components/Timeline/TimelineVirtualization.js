"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.useTimelineRowsRef = exports.useTimelineVirtualization = exports.TimelineVirtualizationProvider = void 0;
const jsx_runtime_1 = require("react/jsx-runtime");
const react_virtual_1 = require("@tanstack/react-virtual");
const react_1 = require("react");
const timeline_layout_1 = require("../../helpers/timeline-layout");
const timeline_zoom_1 = require("../../state/timeline-zoom");
const MaxTimelineTracks_1 = require("./MaxTimelineTracks");
const timeline_refs_1 = require("./timeline-refs");
const timeline_series_layout_1 = require("./timeline-series-layout");
const timeline_track_groups_1 = require("./timeline-track-groups");
const TimelineSelection_1 = require("./TimelineSelection");
const TimelineTimeIndicators_1 = require("./TimelineTimeIndicators");
const use_compact_series_1 = require("./use-compact-series");
const use_timeline_height_1 = require("./use-timeline-height");
const ZOOM_VERTICAL_OVERSCAN = 32;
const TimelineVirtualizationContext = (0, react_1.createContext)(null);
const TimelineRowsRefContext = (0, react_1.createContext)(null);
const getSelectionTrackKey = (selection) => {
    if (selection.type === 'guide') {
        return null;
    }
    return (0, TimelineSelection_1.getTimelineSequenceSelectionKey)(selection.nodePathInfo);
};
const TimelineVirtualizationProvider = ({ children, hasBeenCut, isStill, timeline, layoutSnapshot }) => {
    const isZooming = (0, react_1.useContext)(timeline_zoom_1.TimelineZoomActiveContext);
    const compactSeries = (0, use_compact_series_1.useCompactSeries)();
    const representativeTracks = (0, react_1.useMemo)(() => timeline.map((row) => row.track), [timeline]);
    const individualHeights = (0, use_timeline_height_1.useTimelineTrackHeights)({
        timeline: representativeTracks,
    });
    const trackHeights = (0, react_1.useMemo)(() => layoutSnapshot.timeline.map((row, index) => (row.items === null
        ? individualHeights[index]
        : timeline_track_groups_1.TIMELINE_PACKED_TRACK_HEIGHT + timeline_layout_1.TIMELINE_ITEM_BORDER_BOTTOM) +
        row.auxiliaryRows.length * timeline_track_groups_1.TIMELINE_PACKED_AUXILIARY_ROW_HEIGHT), [individualHeights, layoutSnapshot]);
    const { consumeRevealRequest, revealRequest, selectedItems } = (0, TimelineSelection_1.useTimelineSelection)();
    const paddingStart = isStill ? 0 : TimelineTimeIndicators_1.TIMELINE_TIME_INDICATOR_HEIGHT;
    const paddingEnd = timeline_layout_1.TIMELINE_ITEM_BORDER_BOTTOM +
        (hasBeenCut ? MaxTimelineTracks_1.MAX_TIMELINE_TRACKS_NOTICE_HEIGHT : 0);
    const rowsRef = (0, react_1.useRef)([]);
    // Ordinary leaf trims update the rendered track while retaining the facts
    // that determine scene packing, hierarchy, and vertical positions.
    const seriesLayout = (0, react_1.useMemo)(() => (0, timeline_series_layout_1.getTimelineSeriesLayout)({
        rows: layoutSnapshot.timeline,
        heights: trackHeights,
        sequences: layoutSnapshot.sequences,
        compactSeries,
        paddingStart,
    }), [compactSeries, layoutSnapshot, paddingStart, trackHeights]);
    const rootTrackIndexes = (0, react_1.useMemo)(() => {
        var _a;
        const indexes = new Map();
        for (let index = 0; index < layoutSnapshot.timeline.length; index++) {
            for (const { nodePathInfo } of [
                layoutSnapshot.timeline[index].track,
                ...((_a = layoutSnapshot.timeline[index].items) !== null && _a !== void 0 ? _a : []),
            ]) {
                if (nodePathInfo !== null) {
                    indexes.set((0, TimelineSelection_1.getTimelineSequenceSelectionKey)(nodePathInfo), index);
                }
            }
        }
        return indexes;
    }, [layoutSnapshot]);
    const layout = (0, react_1.useMemo)(() => {
        const rows = timeline.map(({ track, items, childScenes, auxiliaryRows }, index) => {
            var _a, _b, _c, _d, _e, _f;
            const afterDropLineOffset = seriesLayout.afterDropLineOffsets[index];
            const auxiliaryRowOffsets = seriesLayout.auxiliaryRowOffsets[index];
            const siblingIndex = seriesLayout.siblingIndexes[index];
            const sceneRange = seriesLayout.sceneRanges[index];
            const sceneGroupId = sceneRange === null
                ? null
                : timeline[seriesLayout.groups[seriesLayout.groupIndexes[index]].index].track.sequence.id;
            const previous = rowsRef.current[index];
            if ((previous === null || previous === void 0 ? void 0 : previous.track) === track &&
                previous.items === items &&
                previous.childScenes === childScenes &&
                previous.auxiliaryRows === auxiliaryRows &&
                previous.auxiliaryRowOffsets.length === auxiliaryRowOffsets.length &&
                previous.auxiliaryRowOffsets.every((offset, auxiliaryIndex) => offset === auxiliaryRowOffsets[auxiliaryIndex]) &&
                previous.afterDropLineOffset === afterDropLineOffset &&
                previous.siblingIndex === siblingIndex &&
                previous.sceneGroupId === sceneGroupId &&
                ((_a = previous.sceneRange) === null || _a === void 0 ? void 0 : _a.from) === (sceneRange === null || sceneRange === void 0 ? void 0 : sceneRange.from) &&
                ((_b = previous.sceneRange) === null || _b === void 0 ? void 0 : _b.end) === (sceneRange === null || sceneRange === void 0 ? void 0 : sceneRange.end) &&
                ((_c = previous.sceneRange) === null || _c === void 0 ? void 0 : _c.activeFrom) === (sceneRange === null || sceneRange === void 0 ? void 0 : sceneRange.activeFrom) &&
                ((_d = previous.sceneRange) === null || _d === void 0 ? void 0 : _d.activeEnd) === (sceneRange === null || sceneRange === void 0 ? void 0 : sceneRange.activeEnd) &&
                ((_e = previous.sceneRange) === null || _e === void 0 ? void 0 : _e.transitionInEnd) ===
                    (sceneRange === null || sceneRange === void 0 ? void 0 : sceneRange.transitionInEnd) &&
                ((_f = previous.sceneRange) === null || _f === void 0 ? void 0 : _f.transitionOutStart) ===
                    (sceneRange === null || sceneRange === void 0 ? void 0 : sceneRange.transitionOutStart)) {
                return previous;
            }
            return {
                auxiliaryRowOffsets,
                afterDropLineOffset,
                siblingIndex,
                track,
                items,
                childScenes,
                auxiliaryRows,
                sceneRange,
                sceneGroupId,
            };
        });
        return {
            ...seriesLayout,
            rootTrackIndexes,
            rows,
        };
    }, [rootTrackIndexes, seriesLayout, timeline]);
    (0, react_1.useLayoutEffect)(() => {
        rowsRef.current = layout.rows;
    }, [layout.rows]);
    const selectedTrackIndexes = (0, react_1.useMemo)(() => {
        const indexes = new Set();
        for (const selectedItem of selectedItems) {
            const key = getSelectionTrackKey(selectedItem);
            const index = key === null ? undefined : layout.rootTrackIndexes.get(key);
            if (index !== undefined) {
                indexes.add(index);
            }
        }
        return indexes;
    }, [layout.rootTrackIndexes, selectedItems]);
    const hasSharedRows = layout.groups.some((group) => group.rows.length > 1);
    const [verticalRenderWindow, setVerticalRenderWindow] = (0, react_1.useState)(null);
    (0, react_1.useLayoutEffect)(() => {
        if (!hasSharedRows) {
            return;
        }
        let element = null;
        let resizeObserver = null;
        const update = () => {
            if (element === null || element.clientHeight === 0) {
                return;
            }
            // The group's virtualizer does not notify while scrolling within one
            // tall Series. Maintain a buffered row window inside it as well.
            const height = element.clientHeight;
            const section = Math.floor((element.scrollTop + height / 2) / height);
            const top = isZooming
                ? Math.max(0, element.scrollTop - ZOOM_VERTICAL_OVERSCAN)
                : Math.max(0, (section - 1) * height);
            const bottom = isZooming
                ? element.scrollTop + height + ZOOM_VERTICAL_OVERSCAN
                : top + height * 3;
            setVerticalRenderWindow((previous) => (previous === null || previous === void 0 ? void 0 : previous.top) === top && previous.bottom === bottom
                ? previous
                : { top, bottom });
        };
        const animationFrame = requestAnimationFrame(() => {
            element = timeline_refs_1.timelineVerticalScroll.current;
            if (element === null) {
                return;
            }
            resizeObserver = new ResizeObserver(update);
            resizeObserver.observe(element);
            element.addEventListener('scroll', update, { passive: true });
            update();
        });
        return () => {
            cancelAnimationFrame(animationFrame);
            resizeObserver === null || resizeObserver === void 0 ? void 0 : resizeObserver.disconnect();
            element === null || element === void 0 ? void 0 : element.removeEventListener('scroll', update);
        };
    }, [hasSharedRows, isZooming]);
    const groupsRef = (0, react_1.useRef)(layout.groups);
    groupsRef.current = layout.groups;
    const timelineRef = (0, react_1.useRef)(timeline);
    timelineRef.current = timeline;
    const groupHeights = (0, react_1.useMemo)(() => layout.groups.map((group) => group.height), [layout.groups]);
    const estimateSize = (0, react_1.useCallback)((index) => { var _a; var _b; return (_b = (_a = groupsRef.current[index]) === null || _a === void 0 ? void 0 : _a.height) !== null && _b !== void 0 ? _b : 0; }, []);
    const getItemKey = (0, react_1.useCallback)((index) => {
        const group = groupsRef.current[index];
        return group === undefined
            ? index
            : timelineRef.current[group.index].track.sequence.id;
    }, []);
    const rangeExtractor = (0, react_1.useCallback)((range) => {
        const indexes = new Set((0, react_virtual_1.defaultRangeExtractor)(range));
        for (const selectedIndex of selectedTrackIndexes) {
            indexes.add(layout.groupIndexes[selectedIndex]);
        }
        return [...indexes].sort((a, b) => a - b);
    }, [layout.groupIndexes, selectedTrackIndexes]);
    const getScrollElement = (0, react_1.useCallback)(() => timeline_refs_1.timelineVerticalScroll.current, []);
    const virtualizer = (0, react_virtual_1.useVirtualizer)({
        count: layout.groups.length,
        estimateSize,
        getItemKey,
        getScrollElement,
        overscan: isZooming ? 1 : 20,
        paddingEnd,
        paddingStart,
        rangeExtractor,
    });
    const measuredLayoutRef = (0, react_1.useRef)(null);
    (0, react_1.useLayoutEffect)(() => {
        const previous = measuredLayoutRef.current;
        const keys = groupHeights.map((_, index) => getItemKey(index));
        // Trimming changes timeline metadata without changing row geometry. Only
        // invalidate measurements when heights or the cached row identities change.
        if (previous !== null &&
            previous.heights.length === groupHeights.length &&
            groupHeights.every((height, index) => previous.heights[index] === height &&
                previous.keys[index] === keys[index])) {
            return;
        }
        measuredLayoutRef.current = { heights: groupHeights, keys };
        virtualizer.measure();
    }, [getItemKey, groupHeights, virtualizer]);
    (0, react_1.useEffect)(() => {
        if (revealRequest === null) {
            return;
        }
        const key = getSelectionTrackKey(revealRequest.item);
        if (key === null) {
            consumeRevealRequest(revealRequest.token);
            return;
        }
        const selectionKey = (0, TimelineSelection_1.getTimelineSelectionKey)(revealRequest.item);
        if (!selectedItems.some((item) => (0, TimelineSelection_1.getTimelineSelectionKey)(item) === selectionKey)) {
            consumeRevealRequest(revealRequest.token);
            return;
        }
        const index = layout.rootTrackIndexes.get(key);
        if (index === undefined) {
            return;
        }
        const row = layout.rows[index];
        const scrollElement = timeline_refs_1.timelineVerticalScroll.current;
        if (scrollElement === null || scrollElement.clientHeight <= paddingStart) {
            return;
        }
        const auxiliaryIndex = row.auxiliaryRows.findIndex((items) => items.some(({ nodePathInfo }) => nodePathInfo !== null &&
            (0, TimelineSelection_1.getTimelineSequenceSelectionKey)(nodePathInfo) === key));
        const primaryHeight = timeline_track_groups_1.TIMELINE_PACKED_TRACK_HEIGHT + timeline_layout_1.TIMELINE_ITEM_BORDER_BOTTOM;
        const start = layout.offsets[index] +
            (auxiliaryIndex === -1 ? 0 : row.auxiliaryRowOffsets[auxiliaryIndex]);
        const height = auxiliaryIndex !== -1
            ? timeline_track_groups_1.TIMELINE_PACKED_AUXILIARY_ROW_HEIGHT
            : row.items !== null
                ? primaryHeight
                : trackHeights[index];
        if (start < scrollElement.scrollTop + paddingStart ||
            start + height > scrollElement.scrollTop + scrollElement.clientHeight) {
            virtualizer.scrollToOffset(start + height / 2 - (scrollElement.clientHeight + paddingStart) / 2);
        }
        consumeRevealRequest(revealRequest.token);
    }, [
        consumeRevealRequest,
        layout.offsets,
        layout.rootTrackIndexes,
        layout.rows,
        paddingStart,
        revealRequest,
        selectedItems,
        trackHeights,
        virtualizer,
    ]);
    (0, react_1.useEffect)(() => {
        if (revealRequest === null) {
            return;
        }
        const scrollElement = timeline_refs_1.timelineVerticalScroll.current;
        if (scrollElement === null) {
            return;
        }
        // A reveal can wait for a row to mount. User scrolling supersedes it.
        const cancelPendingReveal = () => {
            consumeRevealRequest(revealRequest.token);
        };
        const onWheel = (event) => {
            if (event.deltaY !== 0) {
                cancelPendingReveal();
            }
        };
        const onPointerDown = (event) => {
            if (event.target === scrollElement) {
                cancelPendingReveal();
            }
        };
        scrollElement.addEventListener('wheel', onWheel, { passive: true });
        scrollElement.addEventListener('touchstart', cancelPendingReveal, {
            passive: true,
        });
        scrollElement.addEventListener('pointerdown', onPointerDown);
        return () => {
            scrollElement.removeEventListener('wheel', onWheel);
            scrollElement.removeEventListener('touchstart', cancelPendingReveal);
            scrollElement.removeEventListener('pointerdown', onPointerDown);
        };
    }, [consumeRevealRequest, revealRequest]);
    const virtualGroups = virtualizer.getVirtualItems();
    const virtualItems = (0, react_1.useMemo)(() => {
        var _a, _b, _c;
        // Apply the smaller window in the first zoom commit, before the scroll
        // listener's next update. Keep selected rows mounted for ongoing edits.
        const element = timeline_refs_1.timelineVerticalScroll.current;
        const zoomTop = ((_a = element === null || element === void 0 ? void 0 : element.scrollTop) !== null && _a !== void 0 ? _a : 0) - ZOOM_VERTICAL_OVERSCAN;
        const zoomBottom = ((_b = element === null || element === void 0 ? void 0 : element.scrollTop) !== null && _b !== void 0 ? _b : 0) +
            ((_c = element === null || element === void 0 ? void 0 : element.clientHeight) !== null && _c !== void 0 ? _c : 0) +
            ZOOM_VERTICAL_OVERSCAN;
        return virtualGroups.flatMap((group) => layout.groups[group.index].rows
            .filter((index) => {
            if (selectedTrackIndexes.has(index)) {
                return true;
            }
            if (isZooming && element !== null) {
                return (layout.offsets[index] < zoomBottom &&
                    layout.offsets[index] + layout.rowHeights[index] > zoomTop);
            }
            if (layout.groups[group.index].rows.length === 1) {
                return true;
            }
            return (verticalRenderWindow !== null &&
                layout.offsets[index] < verticalRenderWindow.bottom &&
                layout.offsets[index] + layout.rowHeights[index] >
                    verticalRenderWindow.top);
        })
            .map((index) => ({
            index,
            key: layoutSnapshot.timeline[index].track.sequence.id,
            start: layout.offsets[index],
            end: layout.offsets[index] + layout.rowHeights[index],
            size: layout.rowHeights[index],
            lane: 0,
        })));
    }, [
        isZooming,
        layout.groups,
        layout.offsets,
        layout.rowHeights,
        selectedTrackIndexes,
        layoutSnapshot,
        verticalRenderWindow,
        virtualGroups,
    ]);
    const value = (0, react_1.useMemo)(() => ({
        rows: layout.rows,
        totalSize: layout.tracksEnd + paddingEnd,
        tracksEnd: layout.tracksEnd,
        virtualItems,
    }), [layout.rows, layout.tracksEnd, paddingEnd, virtualItems]);
    return ((0, jsx_runtime_1.jsx)(TimelineRowsRefContext.Provider, { value: rowsRef, children: (0, jsx_runtime_1.jsx)(TimelineVirtualizationContext.Provider, { value: value, children: children }) }));
};
exports.TimelineVirtualizationProvider = TimelineVirtualizationProvider;
const useTimelineVirtualization = () => {
    const context = (0, react_1.useContext)(TimelineVirtualizationContext);
    if (context === null) {
        throw new Error('useTimelineVirtualization must be used inside TimelineVirtualizationProvider');
    }
    return context;
};
exports.useTimelineVirtualization = useTimelineVirtualization;
// Event handlers can read the committed rows without subscribing to viewport changes.
const useTimelineRowsRef = () => {
    const context = (0, react_1.useContext)(TimelineRowsRefContext);
    if (context === null) {
        throw new Error('useTimelineRowsRef must be used inside TimelineVirtualizationProvider');
    }
    return context;
};
exports.useTimelineRowsRef = useTimelineRowsRef;
