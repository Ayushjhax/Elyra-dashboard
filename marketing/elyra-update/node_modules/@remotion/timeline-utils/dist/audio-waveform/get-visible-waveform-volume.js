"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.getVisibleWaveformVolume = void 0;
const getVisibleWaveformVolume = ({ displayDurationInFrames, displayOffsetInFrames, volume, }) => {
    if (!Array.isArray(volume)) {
        return volume;
    }
    if (!Number.isFinite(displayDurationInFrames) ||
        displayDurationInFrames <= 0) {
        return [];
    }
    // Registered curves already cover the visible composition timeline, including
    // repeat/extend behavior and partial loops introduced by ancestor trimming.
    const start = Math.max(0, Math.floor(displayOffsetInFrames));
    const end = Math.min(volume.length, Math.ceil(displayOffsetInFrames + displayDurationInFrames));
    return volume.slice(start, end);
};
exports.getVisibleWaveformVolume = getVisibleWaveformVolume;
