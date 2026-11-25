"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.getAudioSyncAnchorTolerance = void 0;
const ALLOWED_GLOBAL_TIME_ANCHOR_SHIFT = 0.1;
// The tolerance is measured in AudioContext seconds.
const getAudioSyncAnchorTolerance = (audioContext) => {
    const { baseLatency, outputLatency } = audioContext;
    const safeOutputLatency = outputLatency === 0 ? 0.3 : outputLatency;
    return ALLOWED_GLOBAL_TIME_ANCHOR_SHIFT + baseLatency + safeOutputLatency;
};
exports.getAudioSyncAnchorTolerance = getAudioSyncAnchorTolerance;
