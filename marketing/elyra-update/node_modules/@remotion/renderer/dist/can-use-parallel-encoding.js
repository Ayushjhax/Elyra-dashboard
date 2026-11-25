"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.canUseParallelEncoding = void 0;
const is_audio_codec_1 = require("./is-audio-codec");
const canUseParallelEncoding = (codec) => {
    if ((0, is_audio_codec_1.isAudioCodec)(codec)) {
        return false;
    }
    // GIF encoding uses a palette generated from the entire video.
    return (codec === 'h264' ||
        codec === 'h264-mkv' ||
        codec === 'h264-ts' ||
        codec === 'h265' ||
        codec === 'vp8' ||
        codec === 'vp9' ||
        codec === 'av1' ||
        codec === 'prores');
};
exports.canUseParallelEncoding = canUseParallelEncoding;
