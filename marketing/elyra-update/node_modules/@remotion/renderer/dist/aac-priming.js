"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.getAacPrimingInputArgs = exports.LIBFDK_AAC_LC_ENCODER_DELAY_IN_SAMPLES = void 0;
const get_mp4_brand_1 = require("./get-mp4-brand");
// libfdk_aac (AAC-LC) prepends 2048 samples of encoder delay ("priming") to
// its output. The audio is encoded to ADTS first (compressAudio, combineAudio),
// and ADTS cannot signal that delay, so stream-copying it into an MP4 or MOV
// produced an edit list starting at media time 0: players then played the
// priming as content and the audio was 2048 / sampleRate late (42.67ms at
// 48kHz). Shifting the ADTS input back by the delay makes the muxer write an
// edit list that skips the priming, like encoding straight to MP4 does.
exports.LIBFDK_AAC_LC_ENCODER_DELAY_IN_SAMPLES = 2048;
const getAacPrimingInputArgs = ({ audioCodec, sampleRate, outputExtension, }) => {
    var _a;
    if (audioCodec !== 'aac') {
        return [];
    }
    // Only containers with edit lists can carry the shift
    const extension = (_a = outputExtension === null || outputExtension === void 0 ? void 0 : outputExtension.toLowerCase()) !== null && _a !== void 0 ? _a : null;
    if (extension !== 'mp4' &&
        extension !== 'mov' &&
        (0, get_mp4_brand_1.getMp4BrandForExtension)(extension) === null) {
        return [];
    }
    const delayInMicroseconds = Math.round((exports.LIBFDK_AAC_LC_ENCODER_DELAY_IN_SAMPLES / sampleRate) * 1000000);
    return ['-itsoffset', `-${delayInMicroseconds}us`];
};
exports.getAacPrimingInputArgs = getAacPrimingInputArgs;
