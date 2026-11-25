"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.TimelineLayerChildrenToggle = exports.useTimelineLayerChildren = exports.TimelineLayerChildrenProvider = void 0;
const jsx_runtime_1 = require("react/jsx-runtime");
const react_1 = require("react");
const colors_1 = require("../../helpers/colors");
const hoverable_1 = require("../../helpers/hoverable");
const remap_collapsed_layer_children_1 = require("../../helpers/remap-collapsed-layer-children");
const timeline_node_path_key_1 = require("../../helpers/timeline-node-path-key");
const timeline_series_layout_1 = require("./timeline-series-layout");
const timeline_track_groups_1 = require("./timeline-track-groups");
const TimelineCollapseToggle_1 = require("./TimelineCollapseToggle");
// Reserve the same space before and after children register or unregister.
const toggleLayout = {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    width: 12,
    height: 16,
    marginRight: 0,
    flexShrink: 0,
};
const STORAGE_KEY = 'remotion.editor.collapsedLayerChildren.v1';
const TimelineLayerChildrenContext = (0, react_1.createContext)(null);
exports.TimelineLayerChildrenProvider = TimelineLayerChildrenContext.Provider;
const useTimelineLayerChildren = (tracks, layoutSnapshot, compositionId, compactSeries) => {
    const [collapsed, setCollapsed] = (0, react_1.useState)(() => {
        var _a;
        try {
            const parsed = JSON.parse((_a = window.localStorage.getItem(STORAGE_KEY)) !== null && _a !== void 0 ? _a : '{}');
            if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
                return {};
            }
            return Object.fromEntries(Object.entries(parsed).filter(([, storedValue]) => storedValue === true));
        }
        catch (_b) {
            return {};
        }
    });
    const remapCollapsedLayers = (0, react_1.useCallback)((mutations) => {
        setCollapsed((previous) => {
            const next = (0, remap_collapsed_layer_children_1.remapCollapsedLayerChildren)(previous, mutations);
            if (next === null) {
                return previous;
            }
            try {
                window.localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
            }
            catch (_a) {
                // Preserve the in-memory state when storage is unavailable.
            }
            return next;
        });
    }, []);
    const hierarchy = (0, react_1.useMemo)(() => {
        var _a;
        var _b, _c;
        const { tracks: layoutTracks, sequences } = layoutSnapshot;
        const byId = new Map(sequences.map((sequence) => [sequence.id, sequence]));
        const siblingIndices = new Map();
        const siblingCounts = new Map();
        for (const sequence of sequences) {
            const index = (_b = siblingCounts.get(sequence.parent)) !== null && _b !== void 0 ? _b : 0;
            siblingIndices.set(sequence.id, index);
            siblingCounts.set(sequence.parent, index + 1);
        }
        const keys = new Map();
        const parents = new Set();
        const ancestors = new Map();
        for (const track of layoutTracks) {
            const parentIds = [];
            let { parent } = track.sequence;
            while (parent !== null && !parentIds.includes(parent)) {
                parentIds.push(parent);
                parents.add(parent);
                parent = (_c = (_a = byId.get(parent)) === null || _a === void 0 ? void 0 : _a.parent) !== null && _c !== void 0 ? _c : null;
            }
            ancestors.set(track.sequence.id, parentIds);
            // Source identity survives remounts. While it is resolving, the stack
            // gives interactive layers a stable display identity.
            const identity = track.nodePathInfo
                ? ['source', (0, timeline_node_path_key_1.timelineNodePathInfoToKey)(track.nodePathInfo)]
                : track.displayGroup
                    ? ['stack', track.displayGroup.key]
                    : [
                        'position',
                        ...[...parentIds]
                            .reverse()
                            .concat(track.sequence.id)
                            .map((id) => siblingIndices.get(id)),
                    ];
            const key = JSON.stringify([compositionId, identity]);
            // Series clips have no child-collapse control. Regular Track clips
            // have their own child rows and can collapse their nested contents.
            if (!track.sequence.timelineTrack ||
                track.sequence.timelineTrack.role === 'track' ||
                (track.sequence.timelineTrack.role === 'clip' &&
                    track.sequence.timelineTrack.seriesOffset === null)) {
                keys.set(track.sequence.id, key);
            }
        }
        return { keys, parents, ancestors, byId };
    }, [compositionId, layoutSnapshot]);
    const toggle = (0, react_1.useCallback)((key) => {
        const affectedKeys = new Set([key]);
        if (compactSeries) {
            const rows = (0, timeline_track_groups_1.getTimelineDisplayRows)(layoutSnapshot.tracks);
            const index = rows.findIndex((row) => hierarchy.keys.get(row.track.sequence.id) === key);
            // Find corresponding layers on click, before hiding any children.
            const layout = (0, timeline_series_layout_1.getTimelineSeriesLayout)({
                rows,
                heights: rows.map(() => 1),
                sequences: layoutSnapshot.sequences,
                compactSeries,
                paddingStart: 0,
            });
            if (index !== -1 && layout.sceneRanges[index] !== null) {
                for (let rowIndex = 0; rowIndex < rows.length; rowIndex++) {
                    if (layout.sceneRanges[rowIndex] === null ||
                        layout.groupIndexes[rowIndex] !== layout.groupIndexes[index] ||
                        layout.offsets[rowIndex] !== layout.offsets[index]) {
                        continue;
                    }
                    const candidateKey = hierarchy.keys.get(rows[rowIndex].track.sequence.id);
                    if (candidateKey !== undefined) {
                        affectedKeys.add(candidateKey);
                    }
                }
            }
        }
        setCollapsed((previous) => {
            const next = { ...previous };
            for (const affectedKey of affectedKeys) {
                if (previous[key]) {
                    delete next[affectedKey];
                }
                else {
                    next[affectedKey] = true;
                }
            }
            try {
                window.localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
            }
            catch (_a) {
                // Keep the control usable when storage is unavailable.
            }
            return next;
        });
    }, [compactSeries, hierarchy, layoutSnapshot]);
    const visibleTrackIndexes = (0, react_1.useMemo)(() => layoutSnapshot.tracks.flatMap((track, index) => {
        var _a;
        const hidden = ((_a = hierarchy.ancestors.get(track.sequence.id)) !== null && _a !== void 0 ? _a : []).some((id) => {
            var _a, _b;
            // Keep packed Series bars when their contents collapse.
            // Regular Track clips have their own rows and collapse normally.
            const packedTrack = track.sequence.timelineTrack;
            if (packedTrack &&
                packedTrack.role !== 'track' &&
                (packedTrack.role !== 'clip' ||
                    packedTrack.seriesOffset !== null) &&
                packedTrack.id === ((_b = (_a = hierarchy.byId.get(id)) === null || _a === void 0 ? void 0 : _a.timelineTrack) === null || _b === void 0 ? void 0 : _b.id)) {
                return false;
            }
            const key = hierarchy.keys.get(id);
            return key !== undefined && collapsed[key];
        });
        return hidden ? [] : [index];
    }), [hierarchy, collapsed, layoutSnapshot]);
    const visibleTracks = (0, react_1.useMemo)(() => visibleTrackIndexes.map((index) => tracks[index]), [tracks, visibleTrackIndexes]);
    const visibleLayoutTracks = (0, react_1.useMemo)(() => visibleTrackIndexes.map((index) => layoutSnapshot.tracks[index]), [layoutSnapshot, visibleTrackIndexes]);
    const value = (0, react_1.useMemo)(() => ({
        collapsed,
        keys: hierarchy.keys,
        parents: hierarchy.parents,
        toggle,
    }), [collapsed, hierarchy, toggle]);
    return { visibleTracks, visibleLayoutTracks, value, remapCollapsedLayers };
};
exports.useTimelineLayerChildren = useTimelineLayerChildren;
const TimelineLayerChildrenToggle = ({ sequence }) => {
    const context = (0, react_1.useContext)(TimelineLayerChildrenContext);
    const key = context === null || context === void 0 ? void 0 : context.keys.get(sequence.id);
    const isCollapsed = key !== undefined && Boolean(context === null || context === void 0 ? void 0 : context.collapsed[key]);
    const onClick = (0, react_1.useCallback)((event) => {
        event.stopPropagation();
        if (key !== undefined) {
            context === null || context === void 0 ? void 0 : context.toggle(key);
        }
    }, [context, key]);
    const stopPropagation = (0, react_1.useCallback)((event) => event.stopPropagation(), []);
    if (!(context === null || context === void 0 ? void 0 : context.parents.has(sequence.id)) || key === undefined) {
        return (0, jsx_runtime_1.jsx)("div", { style: toggleLayout });
    }
    const label = `${isCollapsed ? 'Expand' : 'Collapse'} children of ${sequence.displayName}`;
    return ((0, jsx_runtime_1.jsx)("button", { type: "button", className: `${hoverable_1.HOVERABLE_CLASS_NAME} ${hoverable_1.FOCUS_VISIBLE_ONLY_CLASS_NAME}`, "aria-label": label, "aria-expanded": !isCollapsed, onClick: onClick, onPointerDown: stopPropagation, onDoubleClick: stopPropagation, style: {
            ...(0, hoverable_1.hoverableStyle)({
                idleBackground: colors_1.TRANSPARENT,
                hoverBackground: colors_1.TRANSPARENT,
                idleColor: colors_1.LIGHT_TEXT,
                hoverColor: colors_1.WHITE,
            }),
            ...toggleLayout,
            border: 'none',
            padding: 0,
            cursor: 'default',
        }, children: (0, jsx_runtime_1.jsx)(TimelineCollapseToggle_1.TimelineCollapseToggle, { collapsed: isCollapsed, color: colors_1.CURRENT_COLOR }) }));
};
exports.TimelineLayerChildrenToggle = TimelineLayerChildrenToggle;
