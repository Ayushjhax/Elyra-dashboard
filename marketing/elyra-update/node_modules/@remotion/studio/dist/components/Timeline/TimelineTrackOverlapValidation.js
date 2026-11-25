"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
Object.defineProperty(exports, "__esModule", { value: true });
exports.TimelineTrackOverlapValidation = void 0;
const jsx_runtime_1 = require("react/jsx-runtime");
const react_1 = __importStar(require("react"));
const runtime_error_store_1 = require("../../error-overlay/runtime-error-store");
const fast_refresh_context_1 = require("../../fast-refresh-context");
const get_timeline_track_overlap_error_1 = require("../../helpers/get-timeline-track-overlap-error");
const is_video_with_last_frame_hold_1 = require("../../helpers/is-video-with-last-frame-hold");
const use_media_metadata_1 = require("../../helpers/use-media-metadata");
const TrackMediaMetadata = react_1.default.memo(({ src, onMetadata }) => {
    // Shares cached and pending requests with the clip bars, including when
    // a collapsed or virtualized track has not mounted its bars.
    const metadata = (0, use_media_metadata_1.useMediaMetadata)(src);
    (0, react_1.useEffect)(() => {
        onMetadata(src, metadata);
    }, [metadata, onMetadata, src]);
    return null;
});
exports.TimelineTrackOverlapValidation = react_1.default.memo(({ timeline, durationInFrames, fps }) => {
    const { fastRefreshes } = (0, react_1.useContext)(fast_refresh_context_1.FastRefreshContext);
    const [mediaMetadata, setMediaMetadata] = (0, react_1.useState)(() => new Map());
    const onMetadata = (0, react_1.useCallback)((src, metadata) => {
        setMediaMetadata((previous) => {
            if (previous.get(src) === metadata) {
                return previous;
            }
            return new Map(previous).set(src, metadata);
        });
    }, []);
    const sources = (0, react_1.useMemo)(() => {
        const trackIds = new Set(timeline
            .filter(({ sequence }) => {
            var _a, _b;
            return ((_a = sequence.timelineTrack) === null || _a === void 0 ? void 0 : _a.role) === 'track' &&
                ((_b = sequence.controls) === null || _b === void 0 ? void 0 : _b.componentIdentity) ===
                    'dev.remotion.remotion.Track';
        })
            .map(({ sequence }) => sequence.timelineTrack.id));
        return Array.from(new Set(timeline.flatMap(({ sequence }) => {
            var _a;
            return ((_a = sequence.timelineTrack) === null || _a === void 0 ? void 0 : _a.role) === 'clip' &&
                trackIds.has(sequence.timelineTrack.id) &&
                (sequence.type === 'audio' || sequence.type === 'video') &&
                !sequence.loopDisplay &&
                !(0, is_video_with_last_frame_hold_1.isVideoWithLastFrameHold)(sequence)
                ? [sequence.src]
                : [];
        })));
    }, [timeline]);
    const error = (0, react_1.useMemo)(() => (0, get_timeline_track_overlap_error_1.getTimelineTrackOverlapError)(timeline, durationInFrames, fps, mediaMetadata), [timeline, durationInFrames, fps, mediaMetadata]);
    (0, react_1.useEffect)(() => {
        if (error === null) {
            return;
        }
        (0, runtime_error_store_1.addErrorToOverlay)(error, null);
        return () => (0, runtime_error_store_1.removeErrorFromOverlay)(error);
    }, [error, fastRefreshes]);
    return sources.map((src) => ((0, jsx_runtime_1.jsx)(TrackMediaMetadata, { src: src, onMetadata: onMetadata }, src)));
});
