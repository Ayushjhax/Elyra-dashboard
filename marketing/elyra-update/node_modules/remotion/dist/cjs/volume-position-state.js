"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.usePlayerMutedState = exports.useMediaVolumeState = exports.SetMediaVolumeContext = exports.MediaVolumeContext = void 0;
const react_1 = require("react");
const react_dom_1 = require("react-dom");
const shared_audio_tags_js_1 = require("./audio/shared-audio-tags.js");
const TimelineContext_js_1 = require("./TimelineContext.js");
exports.MediaVolumeContext = (0, react_1.createContext)({
    playerMuted: false,
    mediaVolume: 1,
});
exports.SetMediaVolumeContext = (0, react_1.createContext)({
    setPlayerMuted: () => {
        throw new Error('default');
    },
    setMediaVolume: () => {
        throw new Error('default');
    },
});
const useResumeAudioOnUnmute = () => {
    const volume = (0, react_1.useContext)(exports.MediaVolumeContext);
    const audioContext = (0, react_1.useContext)(shared_audio_tags_js_1.SharedAudioContext);
    const audioTags = (0, react_1.useContext)(shared_audio_tags_js_1.SharedAudioTagsContext);
    const { isPlaying } = (0, react_1.useContext)(TimelineContext_js_1.SetTimelineContext);
    const current = (0, react_1.useRef)({ volume, audioContext, audioTags });
    current.current = { volume, audioContext, audioTags };
    return (0, react_1.useCallback)((update) => {
        var _a, _b;
        const before = current.current.volume;
        if (!isPlaying() || (!before.playerMuted && before.mediaVolume > 0)) {
            update();
            return;
        }
        // A Player that starts muted creates its AudioContext on unmute.
        // Commit that update before resuming, while still in the user gesture.
        (0, react_dom_1.flushSync)(update);
        const after = current.current;
        if (after.volume.playerMuted || after.volume.mediaVolume === 0) {
            return;
        }
        (_a = after.audioContext) === null || _a === void 0 ? void 0 : _a.resume();
        (_b = after.audioTags) === null || _b === void 0 ? void 0 : _b.playAllAudios();
    }, [isPlaying]);
};
const useMediaVolumeState = () => {
    const { mediaVolume } = (0, react_1.useContext)(exports.MediaVolumeContext);
    const { setMediaVolume } = (0, react_1.useContext)(exports.SetMediaVolumeContext);
    const updateAndResume = useResumeAudioOnUnmute();
    const setVolume = (0, react_1.useCallback)((volume) => updateAndResume(() => setMediaVolume(volume)), [setMediaVolume, updateAndResume]);
    return (0, react_1.useMemo)(() => {
        return [mediaVolume, setVolume];
    }, [mediaVolume, setVolume]);
};
exports.useMediaVolumeState = useMediaVolumeState;
const usePlayerMutedState = () => {
    const { playerMuted } = (0, react_1.useContext)(exports.MediaVolumeContext);
    const { setPlayerMuted } = (0, react_1.useContext)(exports.SetMediaVolumeContext);
    const updateAndResume = useResumeAudioOnUnmute();
    const setMuted = (0, react_1.useCallback)((muted) => updateAndResume(() => setPlayerMuted(muted)), [setPlayerMuted, updateAndResume]);
    return (0, react_1.useMemo)(() => {
        return [playerMuted, setMuted];
    }, [playerMuted, setMuted]);
};
exports.usePlayerMutedState = usePlayerMutedState;
