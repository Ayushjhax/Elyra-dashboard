"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.stepPlaybackRate = exports.loadPlaybackRate = exports.persistPlaybackRate = exports.commonPlaybackRates = void 0;
const key = 'remotion.playbackrate';
exports.commonPlaybackRates = [
    -4, -2, -1, -0.5, -0.25, 0.25, 0.5, 1, 1.5, 2, 4,
];
const persistPlaybackRate = (option) => {
    localStorage.setItem(key, String(option));
};
exports.persistPlaybackRate = persistPlaybackRate;
const loadPlaybackRate = () => {
    if (typeof window === 'undefined') {
        return 1;
    }
    const item = localStorage.getItem(key);
    if (item === null) {
        return 1;
    }
    // Reject zero and out-of-range values so corrupted storage cannot stall playback.
    const playbackRate = Number(item);
    return Number.isFinite(playbackRate) &&
        playbackRate !== 0 &&
        Math.abs(playbackRate) <= 4
        ? playbackRate
        : 1;
};
exports.loadPlaybackRate = loadPlaybackRate;
const stepPlaybackRate = (playbackRate, direction) => {
    const tenths = Math.abs(playbackRate) * 10;
    const next = direction === 1
        ? Math.floor(tenths + 1e-9) + 1
        : Math.ceil(tenths - 1e-9) - 1;
    return (Math.sign(playbackRate) * Math.min(40, Math.max(1, next))) / 10;
};
exports.stepPlaybackRate = stepPlaybackRate;
