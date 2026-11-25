"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.muxVideoAndAudio = void 0;
const aac_priming_1 = require("./aac-priming");
const call_ffmpeg_1 = require("./call-ffmpeg");
const convert_number_of_gif_loops_to_ffmpeg_1 = require("./convert-number-of-gif-loops-to-ffmpeg");
const get_extension_of_filename_1 = require("./get-extension-of-filename");
const get_fast_start_muxer_1 = require("./get-fast-start-muxer");
const get_mp4_brand_1 = require("./get-mp4-brand");
const logger_1 = require("./logger");
const make_metadata_args_1 = require("./make-metadata-args");
const parse_ffmpeg_progress_1 = require("./parse-ffmpeg-progress");
const truthy_1 = require("./truthy");
const muxVideoAndAudio = async ({ videoOutput, audioOutput, output, indent, logLevel, onProgress, binariesDirectory, fps, cancelSignal, metadata, numberOfGifLoops, audioCodec, sampleRate, }) => {
    var _a;
    const startTime = Date.now();
    logger_1.Log.verbose({ indent, logLevel }, 'Muxing video and audio together');
    const outputExtension = (0, get_extension_of_filename_1.getExtensionOfFilename)(output);
    const fastStartMuxer = outputExtension
        ? (0, get_fast_start_muxer_1.getFastStartMuxer)(outputExtension)
        : null;
    const mp4Brand = (0, get_mp4_brand_1.getMp4BrandForExtension)(outputExtension);
    const command = [
        '-hide_banner',
        videoOutput ? '-i' : null,
        videoOutput,
        ...(audioOutput
            ? (0, aac_priming_1.getAacPrimingInputArgs)({
                audioCodec,
                sampleRate,
                outputExtension,
            })
            : []),
        audioOutput ? '-i' : null,
        audioOutput,
        videoOutput ? '-c:v' : null,
        videoOutput ? 'copy' : null,
        audioOutput ? '-c:a' : null,
        audioOutput ? 'copy' : null,
        // Set the exact output framerate to prevent drift when combining chunks.
        // Without this, ffmpeg infers the framerate from the stream which can
        // result in slightly imprecise values like 95940000/3197999 instead of 30/1.
        videoOutput ? '-r' : null,
        videoOutput ? String(fps) : null,
        // Keep the MP4/MOV video time base consistent with the initial encoding.
        videoOutput ? '-video_track_timescale' : null,
        videoOutput ? '90000' : null,
        numberOfGifLoops === null ? null : '-loop',
        numberOfGifLoops === null
            ? null
            : (0, convert_number_of_gif_loops_to_ffmpeg_1.convertNumberOfGifLoopsToFfmpegSyntax)(numberOfGifLoops),
        mp4Brand ? '-f' : null,
        mp4Brand ? 'mp4' : null,
        mp4Brand ? '-brand' : null,
        mp4Brand,
        fastStartMuxer || mp4Brand ? '-movflags' : null,
        fastStartMuxer || mp4Brand ? 'faststart' : null,
        ...(0, make_metadata_args_1.makeMetadataArgs)(metadata !== null && metadata !== void 0 ? metadata : {}),
        '-y',
        output,
    ].filter(truthy_1.truthy);
    logger_1.Log.verbose({ indent, logLevel }, 'Combining command: ', command);
    const task = (0, call_ffmpeg_1.callFf)({
        bin: 'ffmpeg',
        args: command,
        indent,
        logLevel,
        binariesDirectory,
        cancelSignal,
    });
    (_a = task.stderr) === null || _a === void 0 ? void 0 : _a.on('data', (data) => {
        const utf8 = data.toString('utf8');
        const parsed = (0, parse_ffmpeg_progress_1.parseFfmpegProgress)(utf8, fps);
        if (parsed === undefined) {
            if (!utf8.includes('Estimating duration from bitrate, this may be inaccurate')) {
                logger_1.Log.verbose({ indent, logLevel }, utf8);
            }
        }
        else {
            logger_1.Log.verbose({ indent, logLevel }, `Combined ${parsed} frames`);
            onProgress(parsed);
        }
    });
    await task;
    logger_1.Log.verbose({ indent, logLevel }, `Muxing done in ${Date.now() - startTime}ms`);
};
exports.muxVideoAndAudio = muxVideoAndAudio;
