"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.getTimelineTrackOverlapError = void 0;
const get_timeline_natural_media_duration_1 = require("./get-timeline-natural-media-duration");
const is_video_with_last_frame_hold_1 = require("./is-video-with-last-frame-hold");
const getTimelineTrackOverlapError = (timeline, durationInFrames, fps, mediaMetadata) => {
    var _a, _b, _c, _d, _e;
    var _f, _g;
    const tracks = new Map();
    for (const { sequence } of timeline) {
        if (((_a = sequence.timelineTrack) === null || _a === void 0 ? void 0 : _a.role) === 'track' &&
            ((_b = sequence.controls) === null || _b === void 0 ? void 0 : _b.componentIdentity) === 'dev.remotion.remotion.Track') {
            tracks.set(sequence.timelineTrack.id, []);
        }
    }
    for (const item of timeline) {
        const { sequence } = item;
        if (((_c = sequence.timelineTrack) === null || _c === void 0 ? void 0 : _c.role) === 'clip' &&
            (sequence.showInTimeline || sequence.type !== 'sequence') &&
            sequence.duration > 0 &&
            sequence.from < durationInFrames) {
            const track = tracks.get(sequence.timelineTrack.id);
            if (!track) {
                continue;
            }
            let duration = sequence.loopDisplay
                ? sequence.loopDisplay.durationInFrames *
                    sequence.loopDisplay.numberOfTimes
                : sequence.duration;
            if ((sequence.type === 'audio' || sequence.type === 'video') &&
                !sequence.loopDisplay &&
                !(0, is_video_with_last_frame_hold_1.isVideoWithLastFrameHold)(sequence)) {
                const naturalDuration = (0, get_timeline_natural_media_duration_1.getTimelineNaturalMediaDuration)({
                    sequence,
                    sequenceFrameOffset: item.sequenceFrameOffset,
                    mediaMetadata: (_f = mediaMetadata.get(sequence.src)) !== null && _f !== void 0 ? _f : null,
                    fps,
                });
                // Unresolved media has no visible bar yet. Validate it when its
                // metadata arrives, using the same duration cap as the bar.
                if (naturalDuration === null) {
                    continue;
                }
                duration = Math.min(duration, naturalDuration);
            }
            const from = sequence.from + ((_g = (_d = sequence.loopDisplay) === null || _d === void 0 ? void 0 : _d.startOffset) !== null && _g !== void 0 ? _g : 0);
            const end = Math.min(durationInFrames, from + duration);
            if (end > from) {
                track.push({ sequence, from, end });
            }
        }
    }
    for (const items of tracks.values()) {
        items.sort((a, b) => a.from - b.from);
        for (let index = 1; index < items.length; index++) {
            const previous = items[index - 1];
            const current = items[index];
            const previousEnd = previous.end;
            const currentEnd = current.end;
            const overlapEnd = Math.min(previousEnd, currentEnd);
            const overlap = overlapEnd - current.from;
            const tolerance = Number.EPSILON *
                Math.max(1, Math.abs(overlapEnd), Math.abs(current.from)) *
                4;
            if (overlap > tolerance) {
                return new Error(`<Track name="${(_e = current.sequence.timelineTrack) === null || _e === void 0 ? void 0 : _e.name}"> contains overlapping items: "${previous.sequence.displayName}" (frames ${previous.from}–${previousEnd}) and "${current.sequence.displayName}" (frames ${current.from}–${currentEnd}) overlap by ${overlap} frames, from frame ${current.from} up to frame ${overlapEnd} (exclusive). Items in a <Track> must not overlap in Studio. Shorten the earlier item's durationInFrames, move the later item's from, or put the items on separate Tracks. Use <Series> or <TransitionSeries> for overlaps managed by a series.`);
            }
        }
    }
    return null;
};
exports.getTimelineTrackOverlapError = getTimelineTrackOverlapError;
