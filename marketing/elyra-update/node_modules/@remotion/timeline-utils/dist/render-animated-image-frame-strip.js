"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.renderAnimatedImageFrameStrip = void 0;
const extract_animated_image_frames_1 = require("./extract-animated-image-frames");
const frame_database_1 = require("./frame-database");
const persistent_cache_1 = require("./persistent-cache/persistent-cache");
const render_frame_strip_1 = require("./render-frame-strip");
const resize_video_frame_1 = require("./resize-video-frame");
const timeline_media_source_1 = require("./timeline-media-source");
const renderAnimatedImageFrameStrip = async ({ canvas, src, fromSeconds, toSeconds, width, frameHeight, devicePixelRatio, horizontalOffset, signal, requestInit, loopBehavior, getTimestampInSeconds, }) => {
    if (typeof ImageDecoder === 'undefined' || (signal === null || signal === void 0 ? void 0 : signal.aborted)) {
        return;
    }
    const source = requestInit === null
        ? (0, timeline_media_source_1.normalizeTimelineMediaSource)(src)
        : await (0, timeline_media_source_1.getTimelineMediaSource)({ src, requestInit });
    if (signal === null || signal === void 0 ? void 0 : signal.aborted) {
        return;
    }
    canvas.width = Math.max(1, Math.ceil(width + horizontalOffset));
    canvas.height = Math.max(1, Math.ceil(frameHeight * devicePixelRatio));
    const segmentDuration = toSeconds - fromSeconds;
    if (segmentDuration <= 0 || width <= 0) {
        return;
    }
    const ctx = canvas.getContext('2d');
    if (!ctx) {
        throw new Error('Could not get 2d context');
    }
    ctx.setTransform(1, 0, 0, 1, horizontalOffset, 0);
    let aspectRatio = (0, frame_database_1.getAspectRatioFromCache)(source.cacheKey);
    let targets = null;
    let missingTimestamps = [];
    const filledSlots = new Map();
    const tolerances = new Map();
    const getTargets = () => {
        if (targets !== null) {
            return targets;
        }
        aspectRatio = (0, frame_database_1.getAspectRatioFromCache)(source.cacheKey);
        const duration = frame_database_1.mediaDurationCache.get(source.cacheKey);
        if (aspectRatio === null || duration === undefined) {
            return null;
        }
        const slots = (0, render_frame_strip_1.calculateTimestampSlots)({
            visualizationWidth: width,
            fromSeconds,
            segmentDuration,
            aspectRatio,
            frameHeight: canvas.height,
        });
        const slotDuration = (0, render_frame_strip_1.getDurationOfOneFrame)({
            visualizationWidth: width,
            aspectRatio,
            segmentDuration,
            frameHeight: canvas.height,
        });
        const durationInMicroseconds = Math.round(duration * render_frame_strip_1.WEBCODECS_TIMESCALE);
        targets = slots.flatMap((slot) => {
            var _a;
            const time = Math.max(0, Math.round(getTimestampInSeconds(slot / render_frame_strip_1.WEBCODECS_TIMESCALE) *
                render_frame_strip_1.WEBCODECS_TIMESCALE));
            if (time >= durationInMicroseconds &&
                loopBehavior === 'clear-after-finish') {
                return [];
            }
            const timestamp = duration === Infinity
                ? 0
                : loopBehavior === 'loop'
                    ? time % durationInMicroseconds
                    : Math.min(time, durationInMicroseconds - 1);
            // Measure the half-slot in source time, respecting speed and loop edges.
            const before = getTimestampInSeconds((slot - slotDuration / 2) / render_frame_strip_1.WEBCODECS_TIMESCALE) *
                render_frame_strip_1.WEBCODECS_TIMESCALE;
            const after = getTimestampInSeconds((slot + slotDuration / 2) / render_frame_strip_1.WEBCODECS_TIMESCALE) *
                render_frame_strip_1.WEBCODECS_TIMESCALE;
            const tolerance = Math.max(render_frame_strip_1.MAX_TIME_DEVIATION, Math.min(Math.abs(time - before), Math.abs(after - time)));
            tolerances.set(timestamp, Math.max((_a = tolerances.get(timestamp)) !== null && _a !== void 0 ? _a : 0, tolerance));
            return [{ slot, timestamp, tolerance }];
        });
        return targets;
    };
    const fillFromCache = () => {
        const requests = getTargets();
        if (requests === null || aspectRatio === null) {
            return false;
        }
        const frames = (0, render_frame_strip_1.getCachedFrames)({
            src: source.cacheKey,
            height: canvas.height,
        });
        missingTimestamps = [];
        for (const target of requests) {
            const { entry, distance } = (0, render_frame_strip_1.findBestCachedFrame)({
                src: source.cacheKey,
                frames,
                timestamp: target.timestamp,
            });
            if (entry && filledSlots.get(target.slot) !== entry.frame.timestamp) {
                entry.lastUsed = Date.now();
                (0, render_frame_strip_1.drawSlot)({
                    frame: entry.frame,
                    ctx,
                    filledSlots,
                    visualizationWidth: width,
                    timestamp: target.slot,
                    segmentDuration,
                    fromSeconds,
                    devicePixelRatio: 1,
                    frameHeight: canvas.height,
                    horizontalOffset,
                    aspectRatio,
                    clearBeforeDraw: true,
                });
            }
            if (distance > target.tolerance) {
                missingTimestamps.push(target.timestamp);
            }
        }
        return missingTimestamps.length === 0;
    };
    try {
        // Match the video path: memory, persisted thumbnails, then decoding.
        if (fillFromCache()) {
            return;
        }
        await (0, persistent_cache_1.hydrateThumbnailsFromPersistentCache)({
            src: source,
            height: canvas.height,
            getTimestamps: () => { var _a; var _b; return (_b = (_a = getTargets()) === null || _a === void 0 ? void 0 : _a.map((target) => target.timestamp)) !== null && _b !== void 0 ? _b : []; },
            getTimestampTolerance: (timestamp) => { var _a; return (_a = tolerances.get(timestamp)) !== null && _a !== void 0 ? _a : render_frame_strip_1.MAX_TIME_DEVIATION; },
        });
        signal === null || signal === void 0 ? void 0 : signal.throwIfAborted();
        if (fillFromCache()) {
            return;
        }
        await (0, extract_animated_image_frames_1.extractAnimatedImageFrames)({
            source,
            signal,
            timestampsInSeconds: ({ track, durationInSeconds }) => {
                frame_database_1.aspectRatioCache.set(source.cacheKey, track.width / track.height);
                if (durationInSeconds !== null) {
                    frame_database_1.mediaDurationCache.set(source.cacheKey, durationInSeconds);
                }
                targets = null;
                fillFromCache();
                return Array.from(new Set(missingTimestamps)).map((timestamp) => timestamp / render_frame_strip_1.WEBCODECS_TIMESCALE);
            },
            onFrame: (frame) => {
                const resized = (0, resize_video_frame_1.resizeVideoFrame)({
                    frame,
                    scale: canvas.height / frame.displayHeight,
                });
                const thumbnail = resized === frame ? frame.clone() : resized;
                (0, frame_database_1.addFrameToCache)((0, frame_database_1.makeFrameDatabaseKey)(source.cacheKey, thumbnail.timestamp), thumbnail);
                (0, persistent_cache_1.writeThumbnailToPersistentCache)({ src: source, frame: thumbnail });
                fillFromCache();
            },
        });
    }
    catch (error) {
        if (!(signal === null || signal === void 0 ? void 0 : signal.aborted)) {
            throw error;
        }
    }
};
exports.renderAnimatedImageFrameStrip = renderAnimatedImageFrameStrip;
