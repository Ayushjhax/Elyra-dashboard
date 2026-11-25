"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.useMediaInTimelineRegistration = exports.useBasicMediaInTimeline = void 0;
const react_1 = require("react");
const use_audio_frame_js_1 = require("./audio/use-audio-frame.js");
const get_asset_file_name_js_1 = require("./get-asset-file-name.js");
const get_timeline_duration_js_1 = require("./get-timeline-duration.js");
const sequence_outline_js_1 = require("./sequence-outline.js");
const SequenceContext_js_1 = require("./SequenceContext.js");
const SequenceManager_js_1 = require("./SequenceManager.js");
const timeline_track_context_js_1 = require("./timeline-track-context.js");
const use_remotion_environment_js_1 = require("./use-remotion-environment.js");
const use_sequence_registration_js_1 = require("./use-sequence-registration.js");
const use_video_config_js_1 = require("./use-video-config.js");
const EMPTY_EFFECTS = [];
const useBasicMediaInTimeline = ({ src, displayName, trimBefore, trimAfter, playbackRate, sequenceDurationInFrames, mediaStartsAt, loop, muted, }) => {
    var _a;
    if (!src) {
        throw new Error('No src passed');
    }
    const parentSequence = (0, react_1.useContext)(SequenceContext_js_1.SequenceContext);
    const duration = (0, get_timeline_duration_js_1.getTimelineDuration)({
        compositionDurationInFrames: sequenceDurationInFrames,
        playbackRate,
        trimBefore,
        trimAfter,
        parentSequenceDurationInFrames: (_a = parentSequence === null || parentSequence === void 0 ? void 0 : parentSequence.durationInFrames) !== null && _a !== void 0 ? _a : null,
        loop,
    });
    const startMediaFrom = 0 - mediaStartsAt + (trimBefore !== null && trimBefore !== void 0 ? trimBefore : 0);
    const memoizedResult = (0, react_1.useMemo)(() => {
        return {
            duration,
            finalDisplayName: displayName !== null && displayName !== void 0 ? displayName : (0, get_asset_file_name_js_1.getAssetDisplayName)(src),
            startMediaFrom,
            src,
            playbackRate,
            muted,
        };
    }, [duration, displayName, src, startMediaFrom, playbackRate, muted]);
    return memoizedResult;
};
exports.useBasicMediaInTimeline = useBasicMediaInTimeline;
const useMediaInTimelineRegistration = ({ src, mediaType, playbackRate, displayName, id, getStack, showInTimeline, premountDisplay, postmountDisplay, loopDisplay, documentationLink, muted, }) => {
    var _a, _b;
    const parentSequence = (0, react_1.useContext)(SequenceContext_js_1.SequenceContext);
    const timelineTrack = (0, react_1.useContext)(timeline_track_context_js_1.TimelineTrackContext);
    const mediaTrimBefore = (0, react_1.useContext)(use_audio_frame_js_1.Html5MediaTrimContext);
    const sequenceRegistrationEnabled = (0, react_1.useContext)(SequenceManager_js_1.SequenceRegistrationContext);
    const { durationInFrames } = (0, use_video_config_js_1.useVideoConfig)();
    const mediaStartsAt = (0, use_audio_frame_js_1.useMediaStartsAt)();
    const canvasOutlinesEnabled = (0, react_1.useContext)(sequence_outline_js_1.SequenceOutlineContext);
    const { isStudio } = (0, use_remotion_environment_js_1.useRemotionEnvironment)();
    const stack = getStack();
    const getStackForRegistration = (0, react_1.useCallback)(() => stack, [stack]);
    const automaticOutlineRef = (0, react_1.useMemo)(() => mediaType === 'video' && (isStudio || canvasOutlinesEnabled)
        ? sequence_outline_js_1.SequenceOutlineInternals.createRef()
        : null, [canvasOutlinesEnabled, isStudio, mediaType]);
    const { duration, finalDisplayName } = (0, exports.useBasicMediaInTimeline)({
        src,
        displayName,
        trimAfter: undefined,
        trimBefore: undefined,
        playbackRate,
        sequenceDurationInFrames: durationInFrames,
        mediaStartsAt,
        loop: false,
        muted,
    });
    const getSequenceForRegistration = (0, react_1.useCallback)(() => {
        var _a;
        if (!src) {
            throw new Error('No src passed');
        }
        return {
            effectRuntimeValues: null,
            ...(timelineTrack
                ? {
                    timelineTrack: {
                        ...timelineTrack,
                        role: 'clip',
                        seriesOffset: null,
                    },
                }
                : {}),
            type: mediaType,
            src,
            id,
            duration,
            from: 0,
            trimBefore: null,
            parent: (_a = parentSequence === null || parentSequence === void 0 ? void 0 : parentSequence.id) !== null && _a !== void 0 ? _a : null,
            displayName: finalDisplayName,
            documentationLink,
            muted,
            showInTimeline: true,
            timelineOrder: null,
            startMediaFrom: mediaTrimBefore,
            mediaFrameAtSequenceZero: mediaTrimBefore * (1 - playbackRate),
            loopDisplay,
            playbackRate,
            sequencePlaybackRate: 1,
            getStack: getStackForRegistration,
            premountDisplay,
            postmountDisplay,
            controls: null,
            effects: EMPTY_EFFECTS,
            refForOutline: automaticOutlineRef,
            isInsideSeries: false,
            frozenFrame: null,
            frozenMediaFrame: null,
        };
    }, [
        duration,
        id,
        timelineTrack,
        parentSequence === null || parentSequence === void 0 ? void 0 : parentSequence.id,
        src,
        mediaType,
        mediaTrimBefore,
        playbackRate,
        getStackForRegistration,
        premountDisplay,
        postmountDisplay,
        loopDisplay,
        documentationLink,
        finalDisplayName,
        automaticOutlineRef,
        muted,
    ]);
    const registrationEnabled = isStudio ||
        sequenceRegistrationEnabled ||
        (typeof window !== 'undefined' && ((_b = (_a = window.process) === null || _a === void 0 ? void 0 : _a.env) === null || _b === void 0 ? void 0 : _b.NODE_ENV) === 'test');
    const registration = (0, use_sequence_registration_js_1.useSequenceRegistration)({
        getSequence: registrationEnabled && showInTimeline ? getSequenceForRegistration : null,
        id,
    });
    return { automaticOutlineRef, registration };
};
exports.useMediaInTimelineRegistration = useMediaInTimelineRegistration;
