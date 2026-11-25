"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.getAnimationItemSelectionForSourceFrame = void 0;
const getKeyframeSelection = ({ keyframe, keyframeDisplayOffset, keyframePlaybackRate, nodePathInfo, }) => {
    return {
        type: 'keyframe',
        nodePathInfo,
        frame: keyframe.frame / keyframePlaybackRate + keyframeDisplayOffset,
    };
};
const getAnimationItemSelectionForSourceFrame = ({ includeEasings, keyframeDisplayOffset, keyframePlaybackRate, keyframes, nodePathInfo, sourceFrame, }) => {
    const firstKeyframe = keyframes[0];
    if (!firstKeyframe) {
        return null;
    }
    for (let i = 0; i < keyframes.length; i++) {
        const keyframe = keyframes[i];
        if (keyframe.frame === sourceFrame) {
            return getKeyframeSelection({
                keyframe,
                keyframeDisplayOffset,
                keyframePlaybackRate,
                nodePathInfo,
            });
        }
        const nextKeyframe = keyframes[i + 1];
        if (!nextKeyframe) {
            continue;
        }
        if (sourceFrame > keyframe.frame && sourceFrame < nextKeyframe.frame) {
            if (!includeEasings) {
                return null;
            }
            return {
                type: 'easing',
                nodePathInfo,
                fromFrame: keyframe.frame / keyframePlaybackRate + keyframeDisplayOffset,
                toFrame: nextKeyframe.frame / keyframePlaybackRate + keyframeDisplayOffset,
                segmentIndex: i,
            };
        }
    }
    const lastKeyframe = keyframes[keyframes.length - 1];
    return getKeyframeSelection({
        keyframe: sourceFrame < firstKeyframe.frame ? firstKeyframe : lastKeyframe,
        keyframeDisplayOffset,
        keyframePlaybackRate,
        nodePathInfo,
    });
};
exports.getAnimationItemSelectionForSourceFrame = getAnimationItemSelectionForSourceFrame;
