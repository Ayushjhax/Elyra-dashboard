"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.getTimelineNaturalMediaDuration = void 0;
const get_timeline_media_start_frame_1 = require("../components/Timeline/get-timeline-media-start-frame");
const getTimelineNaturalMediaDuration = ({ sequence, sequenceFrameOffset, mediaMetadata, fps, }) => {
    if ((sequence.type !== 'audio' && sequence.type !== 'video') ||
        mediaMetadata === null ||
        sequence.playbackRate <= 0) {
        return null;
    }
    return Math.max(0, (mediaMetadata.duration * fps -
        (0, get_timeline_media_start_frame_1.getTimelineMediaStartFrame)({
            startMediaFrom: sequence.startMediaFrom,
            mediaFrameAtSequenceZero: sequence.mediaFrameAtSequenceZero,
            sequenceFrameOffset,
            playbackRate: sequence.playbackRate,
        })) /
        (sequence.playbackRate * sequence.sequencePlaybackRate));
};
exports.getTimelineNaturalMediaDuration = getTimelineNaturalMediaDuration;
