"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.renderFrameStripToCanvas = void 0;
const extract_frames_1 = require("./extract-frames");
const frame_database_1 = require("./frame-database");
const render_frame_strip_1 = require("./render-frame-strip");
const resize_video_frame_1 = require("./resize-video-frame");
const getContext = (canvas) => {
    const ctx = canvas.getContext('2d');
    if (!ctx) {
        throw new Error('Could not get 2d context');
    }
    return ctx;
};
const renderFrameStripToCanvas = async ({ canvas, src, fromSeconds, toSeconds, width, frameHeight, devicePixelRatio, horizontalOffset, signal, }) => {
    const drawingWidth = Math.max(1, width);
    const naturalWidth = Math.max(1, Math.ceil(width + horizontalOffset));
    const naturalHeight = Math.max(1, Math.ceil(frameHeight));
    const segmentDuration = toSeconds - fromSeconds;
    canvas.width = naturalWidth;
    canvas.height = naturalHeight;
    if (segmentDuration <= 0 || (signal === null || signal === void 0 ? void 0 : signal.aborted)) {
        return;
    }
    const ctx = getContext(canvas);
    ctx.clearRect(0, 0, naturalWidth, naturalHeight);
    ctx.setTransform(1, 0, 0, 1, horizontalOffset, 0);
    const filledSlots = new Map();
    let aspectRatio = (0, frame_database_1.getAspectRatioFromCache)(src);
    if (aspectRatio !== null) {
        (0, render_frame_strip_1.ensureSlots)({
            filledSlots,
            naturalWidth: drawingWidth,
            fromSeconds,
            toSeconds,
            aspectRatio,
            frameHeight,
        });
        (0, render_frame_strip_1.fillWithCachedFrames)({
            ctx,
            naturalWidth: drawingWidth,
            filledSlots,
            src,
            segmentDuration,
            fromSeconds,
            devicePixelRatio,
            frameHeight,
            horizontalOffset,
        });
        if ((0, render_frame_strip_1.getSlotsToExtract)({ filledSlots, src }).length === 0) {
            return;
        }
    }
    await (0, extract_frames_1.extractFrames)({
        src,
        signal,
        timestampsInSeconds: ({ track, durationInSeconds }) => {
            aspectRatio = track.width / track.height;
            frame_database_1.aspectRatioCache.set(src, aspectRatio);
            if (durationInSeconds !== null) {
                frame_database_1.mediaDurationCache.set(src, durationInSeconds);
            }
            (0, render_frame_strip_1.ensureSlots)({
                filledSlots,
                naturalWidth: drawingWidth,
                fromSeconds,
                toSeconds,
                aspectRatio,
                frameHeight,
            });
            return (0, render_frame_strip_1.getSlotsToExtract)({ filledSlots, src }).map((timestamp) => timestamp / render_frame_strip_1.WEBCODECS_TIMESCALE);
        },
        onVideoSample: (sample) => {
            let frame;
            try {
                frame = sample.toVideoFrame();
                const scale = (frameHeight / frame.displayHeight) * devicePixelRatio;
                const transformed = (0, resize_video_frame_1.resizeVideoFrame)({ frame, scale });
                if (transformed !== frame) {
                    frame.close();
                }
                frame = undefined;
                (0, frame_database_1.addFrameToCache)((0, frame_database_1.makeFrameDatabaseKey)(src, transformed.timestamp), transformed);
                if (aspectRatio === null) {
                    throw new Error('Aspect ratio is not set');
                }
                (0, render_frame_strip_1.ensureSlots)({
                    filledSlots,
                    naturalWidth: drawingWidth,
                    fromSeconds,
                    toSeconds,
                    aspectRatio,
                    frameHeight,
                });
                (0, render_frame_strip_1.fillFrameWhereItFits)({
                    ctx,
                    src,
                    filledSlots,
                    visualizationWidth: drawingWidth,
                    frame: transformed,
                    segmentDuration,
                    fromSeconds,
                    devicePixelRatio,
                    frameHeight,
                    horizontalOffset,
                });
            }
            catch (e) {
                if (frame) {
                    frame.close();
                }
                throw e;
            }
            finally {
                sample.close();
            }
        },
    });
    if (signal === null || signal === void 0 ? void 0 : signal.aborted) {
        return;
    }
    (0, render_frame_strip_1.fillWithCachedFrames)({
        ctx,
        naturalWidth: drawingWidth,
        filledSlots,
        src,
        segmentDuration,
        fromSeconds,
        devicePixelRatio,
        frameHeight,
        horizontalOffset,
    });
};
exports.renderFrameStripToCanvas = renderFrameStripToCanvas;
