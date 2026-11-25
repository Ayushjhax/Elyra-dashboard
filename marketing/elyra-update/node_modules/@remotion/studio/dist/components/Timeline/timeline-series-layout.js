"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.getTimelineSeriesLayout = void 0;
const get_timeline_scene_range_1 = require("./get-timeline-scene-range");
const get_timeline_transition_ranges_1 = require("./get-timeline-transition-ranges");
const timeline_track_groups_1 = require("./timeline-track-groups");
// Keep sequence rows and their identities intact. Only their vertical positions
// and virtualization groups change when consecutive scenes share child space.
const getTimelineSeriesLayout = ({ rows, heights, sequences, compactSeries, paddingStart, }) => {
    var _a, _b;
    var _c, _d, _e, _f;
    const byId = new Map(sequences.map((sequence) => [sequence.id, sequence]));
    const rowById = new Map(rows.map((row, index) => [row.track.sequence.id, index]));
    const registeredItems = new Map();
    for (const sequence of sequences) {
        const track = sequence.timelineTrack;
        if (track && track.role !== 'track') {
            const items = (_c = registeredItems.get(track.id)) !== null && _c !== void 0 ? _c : [];
            items.push(sequence);
            registeredItems.set(track.id, items);
        }
    }
    const scenesBySeries = new Map();
    const transitionsBySeries = new Map();
    const seriesByScene = new Map();
    if (compactSeries) {
        for (let index = 0; index < rows.length; index++) {
            const row = rows[index];
            const track = row.track.sequence.timelineTrack;
            const registered = track ? registeredItems.get(track.id) : undefined;
            if (row.childScenes === null ||
                row.childScenes.length === 0 ||
                !registered ||
                (row.items !== null &&
                    registered.some((item) => {
                        var _a;
                        return (((_a = item.timelineTrack) === null || _a === void 0 ? void 0 : _a.role) === 'clip' &&
                            item.timelineTrack.seriesOffset !== 0) ||
                            !item.showInTimeline;
                    }))) {
                continue;
            }
            const scenes = row.childScenes
                .filter(({ sequence }) => {
                var _a, _b;
                return ((_a = sequence.timelineTrack) === null || _a === void 0 ? void 0 : _a.role) === 'clip' ||
                    ((_b = sequence.timelineTrack) === null || _b === void 0 ? void 0 : _b.role) === 'overlay';
            })
                .sort((a, b) => a.sequence.from - b.sequence.from);
            scenesBySeries.set(index, scenes);
            transitionsBySeries.set(index, (0, get_timeline_transition_ranges_1.getTimelineTransitionRangesByStart)((0, get_timeline_transition_ranges_1.getTimelineTransitionRanges)(row.childScenes.map((item) => item.sequence))));
            for (const scene of scenes) {
                seriesByScene.set(scene.sequence.id, index);
            }
        }
    }
    const childrenByScene = new Map();
    const roots = [];
    for (let index = 0; index < rows.length; index++) {
        const { sequence } = rows[index].track;
        // A regular Track's clip label shares the same scene space as its
        // descendants. Series only display the descendants of their scenes.
        let parent = seriesByScene.has(sequence.id) ? sequence.id : sequence.parent;
        while (parent !== null && !seriesByScene.has(parent)) {
            parent = (_d = (_a = byId.get(parent)) === null || _a === void 0 ? void 0 : _a.parent) !== null && _d !== void 0 ? _d : null;
        }
        if (parent === null) {
            roots.push(index);
        }
        else {
            const children = (_e = childrenByScene.get(parent)) !== null && _e !== void 0 ? _e : [];
            children.push(index);
            childrenByScene.set(parent, children);
        }
    }
    const offsets = new Array(rows.length);
    const rowHeights = [...heights];
    const auxiliaryRowOffsets = rows.map((row, index) => row.auxiliaryRows.map((_, auxiliaryIndex) => heights[index] -
        (row.auxiliaryRows.length - auxiliaryIndex) *
            timeline_track_groups_1.TIMELINE_PACKED_AUXILIARY_ROW_HEIGHT));
    const sceneRanges = new Array(rows.length).fill(null);
    const groupIndexes = new Array(rows.length);
    const groups = [];
    const layoutRows = (indexes, start, range, groupRows) => {
        var _a, _b;
        var _c;
        let cursor = start;
        for (const index of indexes) {
            offsets[index] = cursor;
            sceneRanges[index] = range;
            groupIndexes[index] = groups.length;
            groupRows.push(index);
            cursor += heights[index];
            const scenes = scenesBySeries.get(index);
            if (!scenes) {
                continue;
            }
            const overlayRowCount = rows[index].auxiliaryRows.length;
            cursor -= overlayRowCount * timeline_track_groups_1.TIMELINE_PACKED_AUXILIARY_ROW_HEIGHT;
            // Overlay contents get their own space below the scene contents.
            for (const role of ['clip', 'overlay']) {
                if (role === 'overlay') {
                    for (let auxiliaryIndex = 0; auxiliaryIndex < overlayRowCount; auxiliaryIndex++) {
                        auxiliaryRowOffsets[index][auxiliaryIndex] =
                            cursor - offsets[index];
                        cursor += timeline_track_groups_1.TIMELINE_PACKED_AUXILIARY_ROW_HEIGHT;
                    }
                    if (overlayRowCount > 0) {
                        rowHeights[index] = cursor - offsets[index];
                    }
                }
                let sceneHeight = 0;
                const roleScenes = scenes.filter(({ sequence }) => { var _a; return ((_a = sequence.timelineTrack) === null || _a === void 0 ? void 0 : _a.role) === role; });
                for (let sceneIndex = 0; sceneIndex < roleScenes.length; sceneIndex++) {
                    const { sequence } = roleScenes[sceneIndex];
                    const previous = (_a = roleScenes[sceneIndex - 1]) === null || _a === void 0 ? void 0 : _a.sequence;
                    const next = (_b = roleScenes[sceneIndex + 1]) === null || _b === void 0 ? void 0 : _b.sequence;
                    const sceneRange = (0, get_timeline_scene_range_1.getTimelineSceneRange)({
                        sequence,
                        transitionRangesByStart: transitionsBySeries.get(index),
                        previous: previous !== null && previous !== void 0 ? previous : null,
                        next: next !== null && next !== void 0 ? next : null,
                        range,
                    });
                    const end = layoutRows((_c = childrenByScene.get(sequence.id)) !== null && _c !== void 0 ? _c : [], cursor, sceneRange, groupRows);
                    sceneHeight = Math.max(sceneHeight, end - cursor);
                }
                // Scenes share child space, handing it off at transition midpoints.
                cursor += sceneHeight;
            }
        }
        return cursor;
    };
    let tracksEnd = paddingStart;
    for (const index of roots) {
        const groupRows = [];
        const end = layoutRows([index], tracksEnd, null, groupRows);
        groups.push({ index, rows: groupRows, height: end - tracksEnd });
        tracksEnd = end;
    }
    // Reordering still follows the actual sequence hierarchy, even when adjacent
    // visual rows belong to different scenes or have different nesting depths.
    const siblingCounts = new Map();
    const siblingIndexes = rows.map(({ track }) => {
        var _a;
        const index = (_a = siblingCounts.get(track.sequence.parent)) !== null && _a !== void 0 ? _a : 0;
        siblingCounts.set(track.sequence.parent, index + 1);
        return index;
    });
    const subtreeEnds = offsets.map((offset, index) => offset + rowHeights[index]);
    for (let index = 0; index < rows.length; index++) {
        let { parent } = rows[index].track.sequence;
        while (parent !== null) {
            const parentIndex = rowById.get(parent);
            if (parentIndex !== undefined) {
                subtreeEnds[parentIndex] = Math.max(subtreeEnds[parentIndex], offsets[index] + rowHeights[index]);
            }
            parent = (_f = (_b = byId.get(parent)) === null || _b === void 0 ? void 0 : _b.parent) !== null && _f !== void 0 ? _f : null;
        }
    }
    return {
        offsets,
        rowHeights,
        auxiliaryRowOffsets,
        sceneRanges,
        groupIndexes,
        groups,
        tracksEnd,
        siblingIndexes,
        afterDropLineOffsets: subtreeEnds.map((end, index) => end - offsets[index]),
    };
};
exports.getTimelineSeriesLayout = getTimelineSeriesLayout;
