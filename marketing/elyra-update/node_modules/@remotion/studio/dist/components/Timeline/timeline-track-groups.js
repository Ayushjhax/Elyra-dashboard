"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.projectTimelineDisplayRows = exports.getTimelineDisplayRows = exports.filterTimelineTrackContents = exports.getTimelineSequenceHeight = exports.hasTimelineTrackMediaLabel = exports.TIMELINE_TRACK_MEDIA_LABEL_HEIGHT = exports.TIMELINE_PACKED_AUXILIARY_ROW_HEIGHT = exports.TIMELINE_PACKED_TRACK_HEIGHT = void 0;
const timeline_layout_1 = require("../../helpers/timeline-layout");
const timeline_node_path_key_1 = require("../../helpers/timeline-node-path-key");
exports.TIMELINE_PACKED_TRACK_HEIGHT = 28;
exports.TIMELINE_PACKED_AUXILIARY_ROW_HEIGHT = 24;
exports.TIMELINE_TRACK_MEDIA_LABEL_HEIGHT = 16;
const hasTimelineTrackMediaLabel = (sequence) => {
    var _a;
    return ((_a = sequence.timelineTrack) === null || _a === void 0 ? void 0 : _a.role) === 'clip' &&
        sequence.timelineTrack.seriesOffset === null &&
        (sequence.type === 'audio' ||
            sequence.type === 'video' ||
            sequence.type === 'image');
};
exports.hasTimelineTrackMediaLabel = hasTimelineTrackMediaLabel;
const getTimelineSequenceHeight = (sequence) => {
    var _a;
    if (((_a = sequence.timelineTrack) === null || _a === void 0 ? void 0 : _a.role) === 'overlay') {
        return exports.TIMELINE_PACKED_AUXILIARY_ROW_HEIGHT - timeline_layout_1.TIMELINE_ITEM_BORDER_BOTTOM;
    }
    if (sequence.timelineTrack &&
        (sequence.timelineTrack.role !== 'clip' ||
            sequence.timelineTrack.seriesOffset !== null)) {
        return exports.TIMELINE_PACKED_TRACK_HEIGHT;
    }
    return ((0, timeline_layout_1.getTimelineLayerHeight)(sequence.type) +
        ((0, exports.hasTimelineTrackMediaLabel)(sequence)
            ? exports.TIMELINE_TRACK_MEDIA_LABEL_HEIGHT
            : 0));
};
exports.getTimelineSequenceHeight = getTimelineSequenceHeight;
const filterTimelineTrackContents = (tracks, sequences, compactSeries) => {
    var _a;
    const byId = new Map(sequences.map((sequence) => [sequence.id, sequence]));
    const tracksById = new Map(tracks.map((track) => [track.sequence.id, track]));
    const scopedDisplayGroupCounts = new Map();
    const hiddenSelfReferences = new Set();
    if (compactSeries) {
        for (const { sequence } of tracks) {
            let parent = sequence.parent === null ? null : byId.get(sequence.parent);
            // Transition presentations insert hidden sequences around the scene.
            // Its visible parent clip still represents the component's own wrapper.
            while (parent && !parent.showInTimeline) {
                parent = parent.parent === null ? undefined : byId.get(parent.parent);
            }
            if (((_a = parent === null || parent === void 0 ? void 0 : parent.timelineTrack) === null || _a === void 0 ? void 0 : _a.role) === 'clip' &&
                tracksById.has(parent.id) &&
                parent.showInTimeline &&
                sequence.singleChildComponent !== null &&
                sequence.singleChildComponent !== undefined &&
                sequence.singleChildComponent === parent.singleChildComponent) {
                // The scene clip already represents this component's own wrapper.
                hiddenSelfReferences.add(sequence.id);
            }
        }
    }
    const visibleTracks = tracks.flatMap((track) => {
        var _a, _b;
        var _c;
        if (hiddenSelfReferences.has(track.sequence.id)) {
            return [];
        }
        if (((_a = track.sequence.timelineTrack) === null || _a === void 0 ? void 0 : _a.role) === 'clip' &&
            !track.sequence.showInTimeline) {
            return [];
        }
        let { parent } = track.sequence;
        let hiddenAncestors = 0;
        let nearestPackedInstance = null;
        while (parent !== null) {
            const ancestor = byId.get(parent);
            if (!ancestor) {
                break;
            }
            if (hiddenSelfReferences.has(ancestor.id)) {
                hiddenAncestors += Number(ancestor.showInTimeline);
            }
            if (ancestor.timelineTrack) {
                if (ancestor.timelineTrack.role === 'track' &&
                    (!ancestor.showInTimeline ||
                        ancestor.loopDisplay !== undefined ||
                        ancestor.frozenFrame !== null)) {
                    // Repeated or frozen child clocks cannot be represented by one
                    // advancing clip interval. Show the transformed container instead.
                    return [];
                }
                if (ancestor.timelineTrack.role !== 'track') {
                    hiddenAncestors += Number(ancestor.showInTimeline);
                }
                if (ancestor.timelineTrack.role !== 'track' &&
                    (ancestor.timelineTrack.role !== 'clip' || ancestor.showInTimeline)) {
                    if (nearestPackedInstance === null) {
                        const nodePathInfo = (_b = tracksById.get(ancestor.id)) === null || _b === void 0 ? void 0 : _b.nodePathInfo;
                        nearestPackedInstance = nodePathInfo
                            ? `source:${(0, timeline_node_path_key_1.timelineNodePathInfoToKey)(nodePathInfo)}`
                            : `instance:${ancestor.id}`;
                    }
                }
            }
            parent = ancestor.parent;
        }
        let { displayGroup } = track;
        if (!track.sequence.timelineTrack &&
            nearestPackedInstance !== null &&
            displayGroup !== null) {
            // Shared child components in overlapping clips must remain visible
            // once per clip, while duplicates inside one clip still collapse.
            const key = `packed-descendant:${JSON.stringify([nearestPackedInstance, displayGroup.key])}`;
            scopedDisplayGroupCounts.set(key, ((_c = scopedDisplayGroupCounts.get(key)) !== null && _c !== void 0 ? _c : 0) + 1);
            displayGroup = { ...displayGroup, key };
        }
        return [
            {
                ...track,
                displayGroup,
                depth: Math.max(0, track.depth - hiddenAncestors),
            },
        ];
    });
    return visibleTracks.map((track) => {
        if (track.displayGroup === null) {
            return track;
        }
        const numberOfSequences = scopedDisplayGroupCounts.get(track.displayGroup.key);
        if (numberOfSequences === undefined) {
            return track;
        }
        return {
            ...track,
            displayGroup: { ...track.displayGroup, numberOfSequences },
        };
    });
};
exports.filterTimelineTrackContents = filterTimelineTrackContents;
const getTimelineDisplayRows = (tracks) => {
    var _a;
    var _b, _c, _d, _e;
    const rows = [];
    const groupedItems = new Map();
    for (const track of tracks) {
        const group = track.sequence.timelineTrack;
        if (!group || group.role === 'track') {
            continue;
        }
        const items = (_b = groupedItems.get(group.id)) !== null && _b !== void 0 ? _b : [];
        items.push(track);
        groupedItems.set(group.id, items);
    }
    for (const track of tracks) {
        const group = track.sequence.timelineTrack;
        if (!group) {
            rows.push({ track, items: null, childScenes: null, auxiliaryRows: [] });
        }
        else if (group.role === 'clip' && group.seriesOffset === null) {
            // Regular Track clips have their own bars and expandable properties
            // below the container's row.
            rows.push({ track, items: null, childScenes: null, auxiliaryRows: [] });
        }
        else if (group.role === 'track') {
            const packed = ((_a = track.sequence.controls) === null || _a === void 0 ? void 0 : _a.componentIdentity) !==
                'dev.remotion.remotion.Track';
            if (track.sequence.loopDisplay !== undefined ||
                track.sequence.frozenFrame !== null) {
                rows.push({
                    track,
                    items: packed ? [track] : null,
                    childScenes: null,
                    auxiliaryRows: [],
                });
                continue;
            }
            const items = (_c = groupedItems.get(group.id)) !== null && _c !== void 0 ? _c : [];
            const auxiliaryRows = [];
            // Transitions paint over scene clips. Only overlays need extra rows.
            for (const item of items.filter((candidate) => { var _a; return ((_a = candidate.sequence.timelineTrack) === null || _a === void 0 ? void 0 : _a.role) === 'overlay'; })) {
                const start = item.sequence.from;
                const end = item.sequence.from +
                    item.sequence.duration +
                    ((_d = item.sequence.postmountDisplay) !== null && _d !== void 0 ? _d : 0);
                let rowIndex = 0;
                for (let index = 0; index < auxiliaryRows.length; index++) {
                    const overlaps = auxiliaryRows[index].some(({ sequence }) => {
                        var _a;
                        const otherStart = sequence.from;
                        const otherEnd = sequence.from +
                            sequence.duration +
                            ((_a = sequence.postmountDisplay) !== null && _a !== void 0 ? _a : 0);
                        return start < otherEnd && otherStart < end;
                    });
                    if (overlaps) {
                        // Later overlays paint above earlier ones. Keep them below every
                        // overlapping overlay, even if a higher row has free space.
                        rowIndex = index + 1;
                    }
                }
                (_e = auxiliaryRows[rowIndex]) !== null && _e !== void 0 ? _e : (auxiliaryRows[rowIndex] = []);
                auxiliaryRows[rowIndex].push(item);
            }
            rows.push({
                track,
                items: packed ? items : null,
                childScenes: items,
                auxiliaryRows,
            });
        }
    }
    return rows;
};
exports.getTimelineDisplayRows = getTimelineDisplayRows;
// The input rows own membership and packing. Reuse previous snapshots only when
// their resolved tracks still match, including after a full layout calculation.
const projectTimelineDisplayRows = ({ rows, tracksById, previousRows, }) => {
    var _a, _b, _c;
    const previousById = previousRows === rows
        ? null
        : new Map(previousRows.map((row) => [row.track.sequence.id, row]));
    const updateTracks = (tracks, previousTracks) => {
        var _a;
        let updatedTracks = null;
        for (let index = 0; index < tracks.length; index++) {
            const track = (_a = tracksById.get(tracks[index].sequence.id)) !== null && _a !== void 0 ? _a : tracks[index];
            if (track !== tracks[index]) {
                updatedTracks !== null && updatedTracks !== void 0 ? updatedTracks : (updatedTracks = [...tracks]);
                updatedTracks[index] = track;
            }
        }
        const projected = updatedTracks !== null && updatedTracks !== void 0 ? updatedTracks : tracks;
        return previousTracks !== null &&
            previousTracks.length === projected.length &&
            previousTracks.every((track, index) => track === projected[index])
            ? previousTracks
            : projected;
    };
    let updated = null;
    for (let index = 0; index < rows.length; index++) {
        const row = rows[index];
        const previous = (_a = previousById === null || previousById === void 0 ? void 0 : previousById.get(row.track.sequence.id)) !== null && _a !== void 0 ? _a : row;
        const track = (_b = tracksById.get(row.track.sequence.id)) !== null && _b !== void 0 ? _b : row.track;
        const items = row.items === null ? null : updateTracks(row.items, previous.items);
        const childScenes = row.childScenes === null
            ? null
            : updateTracks(row.childScenes, previous.childScenes);
        let auxiliaryRows = null;
        for (let auxiliaryIndex = 0; auxiliaryIndex < row.auxiliaryRows.length; auxiliaryIndex++) {
            const auxiliaryRow = updateTracks(row.auxiliaryRows[auxiliaryIndex], (_c = previous.auxiliaryRows[auxiliaryIndex]) !== null && _c !== void 0 ? _c : null);
            if (auxiliaryRow !== row.auxiliaryRows[auxiliaryIndex]) {
                auxiliaryRows !== null && auxiliaryRows !== void 0 ? auxiliaryRows : (auxiliaryRows = [...row.auxiliaryRows]);
                auxiliaryRows[auxiliaryIndex] = auxiliaryRow;
            }
        }
        const projectedAuxiliaryRows = auxiliaryRows !== null && auxiliaryRows !== void 0 ? auxiliaryRows : row.auxiliaryRows;
        const stableAuxiliaryRows = previous.auxiliaryRows.length === projectedAuxiliaryRows.length &&
            previous.auxiliaryRows.every((auxiliaryRow, auxiliaryIndex) => auxiliaryRow === projectedAuxiliaryRows[auxiliaryIndex])
            ? previous.auxiliaryRows
            : projectedAuxiliaryRows;
        const projected = track === previous.track &&
            items === previous.items &&
            childScenes === previous.childScenes &&
            stableAuxiliaryRows === previous.auxiliaryRows
            ? previous
            : track === row.track &&
                items === row.items &&
                childScenes === row.childScenes &&
                stableAuxiliaryRows === row.auxiliaryRows
                ? row
                : {
                    track,
                    items,
                    childScenes,
                    auxiliaryRows: stableAuxiliaryRows,
                };
        if (projected === row) {
            continue;
        }
        updated !== null && updated !== void 0 ? updated : (updated = [...rows]);
        updated[index] = projected;
    }
    return updated !== null && updated !== void 0 ? updated : rows;
};
exports.projectTimelineDisplayRows = projectTimelineDisplayRows;
