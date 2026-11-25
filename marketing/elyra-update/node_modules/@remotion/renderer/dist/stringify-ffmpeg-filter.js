"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.stringifyFfmpegFilter = void 0;
const calculate_atempo_1 = require("./assets/calculate-atempo");
const ffmpeg_volume_expression_1 = require("./assets/ffmpeg-volume-expression");
const logger_1 = require("./logger");
const seamless_aac_trim_1 = require("./seamless-aac-trim");
const truthy_1 = require("./truthy");
const cleanUpFloatingPointError = (value) => {
    if (value % 1 < 0.0000001) {
        return Math.floor(value);
    }
    if (value % 1 > 0.9999999) {
        return Math.ceil(value);
    }
    return value;
};
const stringifyTrim = (trim) => {
    const value = cleanUpFloatingPointError(trim * 1000000);
    const asString = `${value}us`;
    // Handle very small values such as `"6e-7us"`, those are essentially rounding errors to 0
    if (asString.includes('e-')) {
        return '0us';
    }
    return asString;
};
// When `preservePitch` is disabled, the speed change must not go through
// `atempo` (which keeps the pitch). Changing the sample rate and then
// resampling back to the target rate speeds up or slows down playback
// while letting the pitch shift along with it (tape / chipmunk effect).
const calculateSpeedChangeFilter = ({ playbackRate, preservePitch, sampleRate, }) => {
    if (playbackRate === 1) {
        return null;
    }
    if (preservePitch) {
        return (0, calculate_atempo_1.calculateATempo)(playbackRate);
    }
    return `asetrate=${sampleRate}*${playbackRate},aresample=${sampleRate}`;
};
const trimAndSetTempo = ({ assetDuration, asset, trimLeftOffset, trimRightOffset, fps, indent, logLevel, sampleRate, }) => {
    // We need to apply the tempo filter first
    // because the atempo filter is not frame-perfect.
    // It creates a small offset and the offset needs to be the same for all audio tracks, before processing it further.
    // This also affects the trimLeft and trimRight values, as they need to be adjusted.
    const { trimLeft, maxTrim } = (0, seamless_aac_trim_1.getActualTrimLeft)({
        trimLeft: asset.trimLeft,
        fps,
        trimLeftOffset,
        seamless: true,
        assetDuration,
        audioStartFrame: asset.audioStartFrame,
        playbackRate: asset.playbackRate,
    });
    const trimRight = trimLeft + asset.duration / fps - trimLeftOffset + trimRightOffset;
    let trimRightOrAssetDuration = maxTrim
        ? Math.min(trimRight, maxTrim)
        : trimRight;
    if (trimRightOrAssetDuration < trimLeft) {
        logger_1.Log.warn({ indent, logLevel }, 'trimRightOrAssetDuration < trimLeft: ' +
            JSON.stringify({
                trimRight,
                trimLeft,
                assetDuration,
                assetTrimLeft: asset.trimLeft,
            }));
        trimRightOrAssetDuration = trimLeft;
    }
    return {
        filter: [
            calculateSpeedChangeFilter({
                playbackRate: asset.playbackRate,
                preservePitch: asset.preservePitch,
                sampleRate,
            }),
            `atrim=${stringifyTrim(trimLeft)}:${stringifyTrim(trimRightOrAssetDuration)}`,
        ],
        actualTrimLeft: trimLeft,
        audibleDuration: trimRightOrAssetDuration - trimLeft,
    };
};
const stringifyFfmpegFilter = ({ channels, volume, fps, assetDuration, chunkLengthInSeconds, forSeamlessAacConcatenation, trimLeftOffset, trimRightOffset, asset, indent, logLevel, presentationTimeOffsetInSeconds, sampleRate, }) => {
    if (channels === 0) {
        return null;
    }
    const { toneFrequency, startInVideo } = asset;
    const startInVideoSeconds = startInVideo / fps;
    // A chunk's leading trim only cuts into assets already playing at its start.
    // For later assets, remove that time from the silence before the asset instead.
    const assetTrimLeftOffset = startInVideo === 0 ? trimLeftOffset : 0;
    const startInChunkSeconds = startInVideo === 0 ? 0 : startInVideoSeconds - trimLeftOffset;
    const capturedFrameCount = Math.round((chunkLengthInSeconds + trimLeftOffset - trimRightOffset) * fps);
    // Only assets present on the last captured frame need the chunk's trailing trim.
    const assetTrimRightOffset = startInVideo + asset.duration >= capturedFrameCount ? trimRightOffset : 0;
    const { trimLeft, maxTrim } = (0, seamless_aac_trim_1.getActualTrimLeft)({
        trimLeft: asset.trimLeft,
        fps,
        trimLeftOffset: assetTrimLeftOffset,
        seamless: forSeamlessAacConcatenation,
        assetDuration,
        audioStartFrame: asset.audioStartFrame,
        playbackRate: asset.playbackRate,
    });
    if (maxTrim && trimLeft >= maxTrim) {
        return null;
    }
    if (toneFrequency !== null && (toneFrequency <= 0 || toneFrequency > 2)) {
        throw new Error('toneFrequency must be a positive number between 0.01 and 2');
    }
    const { actualTrimLeft, audibleDuration, filter: trimAndTempoFilter, } = trimAndSetTempo({
        assetDuration,
        trimLeftOffset: assetTrimLeftOffset,
        trimRightOffset: assetTrimRightOffset,
        asset,
        fps,
        indent,
        logLevel,
        sampleRate,
    });
    const volumeFilter = (0, ffmpeg_volume_expression_1.ffmpegVolumeExpression)({
        volume,
        fps,
        trimLeft: actualTrimLeft,
    });
    const padAtEnd = chunkLengthInSeconds - audibleDuration - startInChunkSeconds;
    const padStart = startInChunkSeconds +
        (asset.trimLeft === 0 ? presentationTimeOffsetInSeconds : 0);
    // Set as few filters as possible, as combining them can create noise
    return {
        filter: '[0:a]' +
            [
                `aformat=sample_fmts=s16:sample_rates=${sampleRate}`,
                // The order matters here! For speed and correctness, we first trim the audio
                ...trimAndTempoFilter,
                // The timings for volume must include whatever is in atrim, unless the volume
                // filter gets applied before atrim
                volumeFilter.value === '1'
                    ? null
                    : `volume=${volumeFilter.value}:eval=${volumeFilter.eval}`,
                toneFrequency && toneFrequency !== 1
                    ? `asetrate=${sampleRate}*${toneFrequency},aresample=${sampleRate},atempo=1/${toneFrequency}`
                    : null,
            ]
                .filter(truthy_1.truthy)
                .join(',') +
            `[a0]`,
        pad_end: padAtEnd > 0.0000001
            ? 'apad=pad_len=' + Math.round(padAtEnd * sampleRate)
            : null,
        pad_start: 
        // For n channels, we delay n + 1 channels.
        // This is because `ffprobe` for some audio files reports the wrong amount
        // of channels.
        // This should be fine because FFMPEG documentation states:
        // "Unused delays will be silently ignored."
        // https://ffmpeg.org/ffmpeg-filters.html#adelay
        // Use samples so adjacent AAC chunks place the waveform at the same offset.
        padStart === 0
            ? null
            : `adelay=${new Array(channels + 1)
                .fill(`${Math.round(padStart * sampleRate)}S`)
                .join('|')}`,
        actualTrimLeft,
    };
};
exports.stringifyFfmpegFilter = stringifyFfmpegFilter;
