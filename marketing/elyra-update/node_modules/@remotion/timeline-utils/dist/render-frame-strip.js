"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.fillFrameWhereItFits = exports.fillWithCachedFrames = exports.drawSlot = exports.ensureSlots = exports.calculateTimestampSlots = exports.getDurationOfOneFrame = exports.getSlotsToExtract = exports.findBestCachedFrame = exports.getCachedFrames = exports.getSlotTolerance = exports.getFrameDistance = exports.MAX_TIME_DEVIATION = exports.WEBCODECS_TIMESCALE = void 0;
const device_pixel_alignment_1 = require("./device-pixel-alignment");
const frame_database_1 = require("./frame-database");
exports.WEBCODECS_TIMESCALE = 1000000;
exports.MAX_TIME_DEVIATION = exports.WEBCODECS_TIMESCALE * 0.05;
// How far a frame is from the frame that is shown at a slot, 0 if it is shown.
// The duration makes this work for low and variable frame rate videos.
// Like extractFrames(), the last frame is shown after the end of the media.
const getFrameDistance = ({ src, frameTimestamp, frameDuration, slot, }) => {
    const mediaDuration = frame_database_1.mediaDurationCache.get(src);
    const timestamp = mediaDuration === undefined
        ? slot
        : Math.min(slot, mediaDuration * exports.WEBCODECS_TIMESCALE - 1);
    if (frameTimestamp <= timestamp &&
        timestamp < frameTimestamp + (frameDuration !== null && frameDuration !== void 0 ? frameDuration : 0)) {
        return 0;
    }
    return Math.abs(frameTimestamp - timestamp);
};
exports.getFrameDistance = getFrameDistance;
const getFilledDistance = ({ src, filled, slot, }) => {
    var _a;
    var _b;
    if (filled === undefined) {
        return Infinity;
    }
    return (0, exports.getFrameDistance)({
        src,
        frameTimestamp: filled,
        frameDuration: (_b = (_a = frame_database_1.frameDatabase.get((0, frame_database_1.makeFrameDatabaseKey)(src, filled))) === null || _a === void 0 ? void 0 : _a.frame.duration) !== null && _b !== void 0 ? _b : null,
        slot,
    });
};
// A frame that is closer to a slot than to the neighboring slots is a good
// enough thumbnail for it, so zooming out reuses the frames of a closer zoom.
const getSlotTolerance = (slots) => {
    if (slots.length < 2) {
        return exports.MAX_TIME_DEVIATION;
    }
    const [first, second] = [...slots].sort((a, b) => a - b);
    return Math.max(exports.MAX_TIME_DEVIATION, (second - first) / 2);
};
exports.getSlotTolerance = getSlotTolerance;
const getCachedFrames = ({ src, height, }) => {
    const prefix = (0, frame_database_1.getFrameDatabaseKeyPrefix)(src);
    const frames = [];
    for (const [key, entry] of frame_database_1.frameDatabase) {
        if (key.startsWith(prefix) &&
            (height === null || entry.frame.displayHeight === height)) {
            frames.push(entry);
        }
    }
    return frames;
};
exports.getCachedFrames = getCachedFrames;
const findBestCachedFrame = ({ src, frames, timestamp, }) => {
    let best = null;
    let distance = Infinity;
    for (const candidate of frames) {
        const candidateDistance = (0, exports.getFrameDistance)({
            src,
            frameTimestamp: candidate.frame.timestamp,
            frameDuration: candidate.frame.duration,
            slot: timestamp,
        });
        if (candidateDistance < distance) {
            best = candidate;
            distance = candidateDistance;
            if (distance === 0) {
                break;
            }
        }
    }
    return { entry: best, distance };
};
exports.findBestCachedFrame = findBestCachedFrame;
// Slots that are filled with a frame that is too far away, for example after
// zooming in, or not filled at all.
const getSlotsToExtract = ({ filledSlots, src, }) => {
    const slots = Array.from(filledSlots.keys());
    const tolerance = (0, exports.getSlotTolerance)(slots);
    return slots.filter((slot) => getFilledDistance({ src, filled: filledSlots.get(slot), slot }) > tolerance);
};
exports.getSlotsToExtract = getSlotsToExtract;
const getDurationOfOneFrame = ({ visualizationWidth, aspectRatio, segmentDuration, frameHeight, }) => {
    const framesFitInWidthUnrounded = visualizationWidth / (frameHeight * aspectRatio);
    return (segmentDuration / framesFitInWidthUnrounded) * exports.WEBCODECS_TIMESCALE;
};
exports.getDurationOfOneFrame = getDurationOfOneFrame;
const fixRounding = (value) => {
    if (value % 1 >= 0.49999999) {
        return Math.ceil(value);
    }
    return Math.floor(value);
};
const calculateTimestampSlots = ({ visualizationWidth, fromSeconds, segmentDuration, aspectRatio, frameHeight, }) => {
    const framesFitInWidthUnrounded = visualizationWidth / (frameHeight * aspectRatio);
    const framesFitInWidth = Math.ceil(framesFitInWidthUnrounded);
    const durationOfOneFrame = (0, exports.getDurationOfOneFrame)({
        visualizationWidth,
        aspectRatio,
        segmentDuration,
        frameHeight,
    });
    const timestampTargets = [];
    for (let i = 0; i < framesFitInWidth + 1; i++) {
        const target = fromSeconds * exports.WEBCODECS_TIMESCALE + durationOfOneFrame * (i + 0.5);
        const snappedToDuration = (Math.round(fixRounding(target / durationOfOneFrame)) - 1) *
            durationOfOneFrame;
        timestampTargets.push(snappedToDuration);
    }
    return timestampTargets;
};
exports.calculateTimestampSlots = calculateTimestampSlots;
const ensureSlots = ({ filledSlots, naturalWidth, fromSeconds, toSeconds, aspectRatio, frameHeight, }) => {
    const segmentDuration = toSeconds - fromSeconds;
    const timestampTargets = (0, exports.calculateTimestampSlots)({
        visualizationWidth: naturalWidth,
        fromSeconds,
        segmentDuration,
        aspectRatio,
        frameHeight,
    });
    for (const timestamp of timestampTargets) {
        if (!filledSlots.has(timestamp)) {
            filledSlots.set(timestamp, undefined);
        }
    }
};
exports.ensureSlots = ensureSlots;
const drawSlot = ({ frame, ctx, filledSlots, visualizationWidth, timestamp, segmentDuration, fromSeconds, devicePixelRatio, frameHeight, horizontalOffset, aspectRatio = null, clearBeforeDraw = false, }) => {
    const durationOfOneFrame = (0, exports.getDurationOfOneFrame)({
        visualizationWidth,
        aspectRatio: aspectRatio !== null && aspectRatio !== void 0 ? aspectRatio : frame.displayWidth / frame.displayHeight,
        segmentDuration,
        frameHeight,
    });
    const relativeTimestamp = timestamp - fromSeconds * exports.WEBCODECS_TIMESCALE;
    const frameIndex = relativeTimestamp / durationOfOneFrame;
    const thumbnailWidth = aspectRatio === null
        ? frame.displayWidth / devicePixelRatio
        : (frame.displayHeight * aspectRatio) / devicePixelRatio;
    const idealLeft = frameIndex * thumbnailWidth;
    const idealRight = idealLeft + thumbnailWidth;
    // When the canvas is aligned to the device-pixel grid, use the same absolute
    // grid for both edges so adjacent thumbnails neither shimmer nor leave seams.
    const left = (0, device_pixel_alignment_1.snapCanvasPositionToDevicePixel)({
        horizontalOffset,
        position: idealLeft,
    });
    const right = (0, device_pixel_alignment_1.snapCanvasPositionToDevicePixel)({
        horizontalOffset,
        position: idealRight,
    });
    if (clearBeforeDraw) {
        ctx.clearRect(left, 0, right - left, frame.displayHeight / devicePixelRatio);
    }
    ctx.drawImage(frame, left, 0, right - left, frame.displayHeight / devicePixelRatio);
    filledSlots.set(timestamp, frame.timestamp);
};
exports.drawSlot = drawSlot;
const fillWithCachedFrames = ({ ctx, naturalWidth, filledSlots, src, segmentDuration, fromSeconds, devicePixelRatio, frameHeight, horizontalOffset, }) => {
    let candidates = null;
    const targets = Array.from(filledSlots.keys());
    for (const timestamp of targets) {
        const filledDistance = getFilledDistance({
            src,
            filled: filledSlots.get(timestamp),
            slot: timestamp,
        });
        // A frame covering this slot cannot be improved by another cached frame.
        if (filledDistance === 0) {
            continue;
        }
        if (candidates === null) {
            candidates = (0, exports.getCachedFrames)({ src, height: null });
        }
        const { entry: best, distance: bestDistance } = (0, exports.findBestCachedFrame)({
            src,
            frames: candidates,
            timestamp,
        });
        if (!best) {
            continue;
        }
        if (filledDistance <= bestDistance) {
            continue;
        }
        best.lastUsed = Date.now();
        (0, exports.drawSlot)({
            ctx,
            frame: best.frame,
            filledSlots,
            visualizationWidth: naturalWidth,
            timestamp,
            segmentDuration,
            fromSeconds,
            devicePixelRatio,
            frameHeight,
            horizontalOffset,
        });
    }
};
exports.fillWithCachedFrames = fillWithCachedFrames;
const fillFrameWhereItFits = ({ frame, src, filledSlots, ctx, visualizationWidth, segmentDuration, fromSeconds, devicePixelRatio, frameHeight, horizontalOffset, }) => {
    const slots = Array.from(filledSlots.keys());
    for (const slot of slots) {
        const distance = (0, exports.getFrameDistance)({
            src,
            frameTimestamp: frame.timestamp,
            frameDuration: frame.duration,
            slot,
        });
        if (distance > exports.MAX_TIME_DEVIATION) {
            continue;
        }
        if (getFilledDistance({ src, filled: filledSlots.get(slot), slot }) <= distance) {
            continue;
        }
        (0, exports.drawSlot)({
            ctx,
            frame,
            filledSlots,
            visualizationWidth,
            timestamp: slot,
            segmentDuration,
            fromSeconds,
            devicePixelRatio,
            frameHeight,
            horizontalOffset,
        });
    }
};
exports.fillFrameWhereItFits = fillFrameWhereItFits;
