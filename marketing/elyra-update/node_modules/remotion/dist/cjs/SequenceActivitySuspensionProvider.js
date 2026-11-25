"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.SequenceActivitySuspensionProvider = void 0;
const jsx_runtime_1 = require("react/jsx-runtime");
const react_1 = require("react");
const sequence_activity_context_js_1 = require("./sequence-activity-context.js");
const TimelineContext_js_1 = require("./TimelineContext.js");
const SequenceActivitySuspensionProvider = ({ children }) => {
    const enabled = (0, react_1.useContext)(sequence_activity_context_js_1.SequenceActivityContext);
    const { isPlaying, subscribePlaying, seek } = (0, react_1.useContext)(TimelineContext_js_1.SetTimelineContext);
    const [suspended, setSuspended] = (0, react_1.useState)(false);
    (0, react_1.useEffect)(() => {
        if (!enabled) {
            setSuspended(false);
            return;
        }
        let timeout = null;
        const update = () => {
            setSuspended(isPlaying() || timeout !== null);
        };
        const unsubscribePlaying = subscribePlaying(update);
        const unsubscribeSeek = seek === null || seek === void 0 ? void 0 : seek.subscribe(() => {
            setSuspended(true);
            if (timeout !== null) {
                clearTimeout(timeout);
            }
            // Repeated pointer, keyboard, and API seeks keep discovery suspended.
            // Resume only once navigation settles, using the latest scene props.
            timeout = setTimeout(() => {
                timeout = null;
                update();
            }, 150);
        });
        update();
        return () => {
            unsubscribePlaying();
            unsubscribeSeek === null || unsubscribeSeek === void 0 ? void 0 : unsubscribeSeek();
            if (timeout !== null) {
                clearTimeout(timeout);
            }
        };
    }, [enabled, isPlaying, seek, subscribePlaying]);
    return ((0, jsx_runtime_1.jsx)(sequence_activity_context_js_1.SequenceActivitySuspensionContext.Provider, { value: suspended, children: children }));
};
exports.SequenceActivitySuspensionProvider = SequenceActivitySuspensionProvider;
