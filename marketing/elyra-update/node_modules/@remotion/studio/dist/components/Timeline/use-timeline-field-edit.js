"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.useTimelineFieldEdit = void 0;
const react_1 = require("react");
// A pending save may finish after the next scrub or text edit has started.
// Only that edit's own completion may clear its local input state.
const useTimelineFieldEdit = () => {
    const revision = (0, react_1.useRef)(0);
    const markEdit = (0, react_1.useCallback)(() => {
        revision.current++;
    }, []);
    const finishEdit = (0, react_1.useCallback)((save, clear) => {
        const savedRevision = revision.current;
        return save.finally(() => {
            if (revision.current === savedRevision)
                clear();
        });
    }, []);
    return { markEdit, finishEdit };
};
exports.useTimelineFieldEdit = useTimelineFieldEdit;
