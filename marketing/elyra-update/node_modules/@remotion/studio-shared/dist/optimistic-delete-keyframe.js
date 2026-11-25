"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.optimisticDeleteEffectKeyframes = exports.optimisticDeleteEffectKeyframe = exports.optimisticDeleteSequenceKeyframes = exports.optimisticDeleteSequenceKeyframe = exports.removeKeyframeFromPropStatus = void 0;
const update_source_prop_status_1 = require("./update-source-prop-status");
const getEasingIndexToRemove = ({ removedKeyframeIndex, keyframeCountBeforeRemoval, }) => {
    if (removedKeyframeIndex === 0) {
        return 0;
    }
    if (removedKeyframeIndex === keyframeCountBeforeRemoval - 1) {
        return removedKeyframeIndex - 1;
    }
    return removedKeyframeIndex;
};
/**
 * The status of a prop after removing the keyframe at `frame`. Removing the
 * last keyframe leaves a static prop.
 */
const removeKeyframeFromPropStatus = ({ status, frame, valueWhenLastKeyframeDeleted, }) => {
    if (status.status !== 'keyframed') {
        return status;
    }
    const index = status.keyframes.findIndex((kf) => kf.frame === frame);
    if (index === -1) {
        return status;
    }
    const keyframes = status.keyframes.filter((_, i) => i !== index);
    if (keyframes.length === 0) {
        return {
            status: 'static',
            keyframeDisplayOffsetAdjustment: status.keyframeDisplayOffsetAdjustment,
            ...(status.keyframePlaybackRateAdjustment === undefined
                ? {}
                : {
                    keyframePlaybackRateAdjustment: status.keyframePlaybackRateAdjustment,
                }),
            codeValue: valueWhenLastKeyframeDeleted === null
                ? status.keyframes[index].value
                : valueWhenLastKeyframeDeleted,
        };
    }
    // Easing holds one segment per gap between consecutive keyframes
    // (keyframes.length - 1 entries). Drop the segment adjacent to the removed
    // keyframe so the invariant keeps holding until the server responds.
    const easing = [...status.easing];
    if (easing.length > 0) {
        const easingIndexToRemove = getEasingIndexToRemove({
            removedKeyframeIndex: index,
            keyframeCountBeforeRemoval: status.keyframes.length,
        });
        easing.splice(easingIndexToRemove, 1);
    }
    return {
        ...status,
        keyframes,
        easing,
    };
};
exports.removeKeyframeFromPropStatus = removeKeyframeFromPropStatus;
const optimisticDeleteSequenceKeyframe = ({ previous, videoConfigValues, fieldKey, frame, valueWhenLastKeyframeDeleted, }) => {
    if (!previous.canUpdate) {
        return previous;
    }
    const status = previous.props[fieldKey];
    if (!status) {
        return previous;
    }
    return {
        ...previous,
        props: {
            ...previous.props,
            [fieldKey]: (0, update_source_prop_status_1.updateSourcePropStatus)({
                source: status,
                videoConfigValues,
                update: (evaluatedStatus) => (0, exports.removeKeyframeFromPropStatus)({
                    status: evaluatedStatus,
                    frame,
                    valueWhenLastKeyframeDeleted: valueWhenLastKeyframeDeleted !== null && valueWhenLastKeyframeDeleted !== void 0 ? valueWhenLastKeyframeDeleted : null,
                }),
            }),
        },
    };
};
exports.optimisticDeleteSequenceKeyframe = optimisticDeleteSequenceKeyframe;
const optimisticDeleteSequenceKeyframes = ({ previous, videoConfigValues, keyframes, }) => {
    return keyframes.reduce((current, keyframe) => (0, exports.optimisticDeleteSequenceKeyframe)({
        previous: current,
        videoConfigValues,
        fieldKey: keyframe.fieldKey,
        frame: keyframe.frame,
        valueWhenLastKeyframeDeleted: keyframe.valueWhenLastKeyframeDeleted,
    }), previous);
};
exports.optimisticDeleteSequenceKeyframes = optimisticDeleteSequenceKeyframes;
const optimisticDeleteEffectKeyframe = ({ previous, videoConfigValues, effectIndex, fieldKey, frame, valueWhenLastKeyframeDeleted, }) => {
    if (!previous.canUpdate) {
        return previous;
    }
    const targetIndex = previous.effects.findIndex((e) => e.effectIndex === effectIndex);
    if (targetIndex === -1) {
        return previous;
    }
    const target = previous.effects[targetIndex];
    if (!target.canUpdate) {
        return previous;
    }
    const status = target.props[fieldKey];
    if (!status) {
        return previous;
    }
    const updatedEffect = {
        ...target,
        props: {
            ...target.props,
            [fieldKey]: (0, update_source_prop_status_1.updateSourcePropStatus)({
                source: status,
                videoConfigValues,
                update: (evaluatedStatus) => (0, exports.removeKeyframeFromPropStatus)({
                    status: evaluatedStatus,
                    frame,
                    valueWhenLastKeyframeDeleted: valueWhenLastKeyframeDeleted !== null && valueWhenLastKeyframeDeleted !== void 0 ? valueWhenLastKeyframeDeleted : null,
                }),
            }),
        },
    };
    const effects = [...previous.effects];
    effects[targetIndex] = updatedEffect;
    return {
        ...previous,
        effects,
    };
};
exports.optimisticDeleteEffectKeyframe = optimisticDeleteEffectKeyframe;
const optimisticDeleteEffectKeyframes = ({ previous, videoConfigValues, keyframes, }) => {
    return keyframes.reduce((current, keyframe) => (0, exports.optimisticDeleteEffectKeyframe)({
        previous: current,
        videoConfigValues,
        effectIndex: keyframe.effectIndex,
        fieldKey: keyframe.fieldKey,
        frame: keyframe.frame,
        valueWhenLastKeyframeDeleted: keyframe.valueWhenLastKeyframeDeleted,
    }), previous);
};
exports.optimisticDeleteEffectKeyframes = optimisticDeleteEffectKeyframes;
