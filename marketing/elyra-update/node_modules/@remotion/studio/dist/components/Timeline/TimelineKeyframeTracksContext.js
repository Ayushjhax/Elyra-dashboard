"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.useTimelineKeyframeTracksRef = exports.TimelineKeyframeTracksProvider = void 0;
const jsx_runtime_1 = require("react/jsx-runtime");
const react_1 = require("react");
const TimelineKeyframeTracksContext = (0, react_1.createContext)({ current: [] });
// Keyframe diamonds need track metadata to resolve other selected rows. The
// selection state only stores identities, and a mounted-row registry would miss
// collapsed or otherwise unmounted rows.
const TimelineKeyframeTracksProvider = ({ tracks, children }) => {
    const tracksRef = (0, react_1.useRef)(tracks);
    tracksRef.current = tracks;
    return ((0, jsx_runtime_1.jsx)(TimelineKeyframeTracksContext.Provider, { value: tracksRef, children: children }));
};
exports.TimelineKeyframeTracksProvider = TimelineKeyframeTracksProvider;
const useTimelineKeyframeTracksRef = () => {
    return (0, react_1.useContext)(TimelineKeyframeTracksContext);
};
exports.useTimelineKeyframeTracksRef = useTimelineKeyframeTracksRef;
