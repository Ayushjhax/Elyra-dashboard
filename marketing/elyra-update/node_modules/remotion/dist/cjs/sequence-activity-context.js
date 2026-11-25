"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.SequenceContent = exports.SequenceActivityAbsoluteTimeContext = exports.SequenceActivityTimelineContext = exports.SequenceActivitySettingsContext = exports.SequenceActivitySuspensionContext = exports.SequenceActivityDormantContext = exports.SequenceActivityContext = exports.DEFAULT_SEQUENCE_ACTIVITY_LIMIT = void 0;
const react_1 = require("react");
var sequence_activity_defaults_js_1 = require("./sequence-activity-defaults.js");
Object.defineProperty(exports, "DEFAULT_SEQUENCE_ACTIVITY_LIMIT", { enumerable: true, get: function () { return sequence_activity_defaults_js_1.DEFAULT_SEQUENCE_ACTIVITY_LIMIT; } });
// Hidden Activity trees register on commit, so Sequence Activity is disabled
// when the sequence manager falls back to effects.
exports.SequenceActivityContext = (0, react_1.createContext)(false);
exports.SequenceActivityDormantContext = (0, react_1.createContext)(false);
exports.SequenceActivitySuspensionContext = (0, react_1.createContext)(false);
exports.SequenceActivitySettingsContext = (0, react_1.createContext)(null);
// React propagates changed ancestor contexts through hidden Activity trees,
// even when a nested provider keeps their value stable. Use separate context
// identities so dormant clocks do not subscribe to the advancing timeline.
exports.SequenceActivityTimelineContext = (0, react_1.createContext)(null);
exports.SequenceActivityAbsoluteTimeContext = (0, react_1.createContext)(null);
const SequenceContent = ({ children }) => {
    return (0, react_1.useContext)(exports.SequenceActivityDormantContext) ? null : children;
};
exports.SequenceContent = SequenceContent;
