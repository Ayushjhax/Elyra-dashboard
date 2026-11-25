"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.getEasingSelectionFromCurrentKeyframes = void 0;
const get_timeline_keyframes_1 = require("../Timeline/get-timeline-keyframes");
const getEasingSelectionFromCurrentKeyframes = ({ keyframeDisplayOffset, keyframePlaybackRate, nodePathInfo, propStatus, segmentIndex, }) => {
    const fromKeyframe = propStatus.keyframes[segmentIndex];
    const toKeyframe = propStatus.keyframes[segmentIndex + 1];
    if (!fromKeyframe || !toKeyframe) {
        return null;
    }
    const resolvedKeyframeDisplayOffset = (0, get_timeline_keyframes_1.getKeyframeDisplayOffset)({
        propStatus,
        keyframeDisplayOffset,
        keyframePlaybackRate,
    });
    return {
        type: 'easing',
        nodePathInfo,
        fromFrame: fromKeyframe.frame /
            (0, get_timeline_keyframes_1.getKeyframePlaybackRate)(propStatus, keyframePlaybackRate) +
            resolvedKeyframeDisplayOffset,
        toFrame: toKeyframe.frame /
            (0, get_timeline_keyframes_1.getKeyframePlaybackRate)(propStatus, keyframePlaybackRate) +
            resolvedKeyframeDisplayOffset,
        segmentIndex,
    };
};
exports.getEasingSelectionFromCurrentKeyframes = getEasingSelectionFromCurrentKeyframes;
